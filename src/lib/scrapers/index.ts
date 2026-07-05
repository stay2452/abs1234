import type { Profile } from "@prisma/client";
import type { Platform } from "@/lib/constants";
import { POSTS_PER_PROFILE } from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  createBrowserSession,
  deleteBrowserSession,
  getActiveBrowserSessions,
  getScrapeContextForSession,
  listBrowserSessions,
  openLoginBrowser,
  testBrowserSession,
  updateBrowserSession,
} from "@/lib/scrapers/session";
import { scrapeInstagramProfile } from "@/lib/scrapers/instagram";
import { scrapeTikTokProfile } from "@/lib/scrapers/tiktok";
import type { ProfileScraper, ScrapedPost, ScrapedProfileResult } from "@/lib/scrapers/types";

const SCRAPERS: Record<Platform, ProfileScraper> = {
  instagram: scrapeInstagramProfile,
  tiktok: scrapeTikTokProfile,
};

function toStoredCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function persistScrapeResult(profile: Profile, result: ScrapedProfileResult) {
  await prisma.profileSnapshot.create({
    data: {
      profileId: profile.id,
      followers: toStoredCount(result.followers),
      following: toStoredCount(result.following),
      postsCount: result.postsCount ?? null,
    },
  });

  let postsFound = 0;

  for (const scrapedPost of result.posts) {
    if (!scrapedPost.url) {
      continue;
    }

    await persistPost(profile, scrapedPost);
    postsFound += 1;
  }

  return postsFound;
}

async function persistPost(profile: Profile, scrapedPost: ScrapedPost) {
  const sourceType = scrapedPost.sourceType ?? (profile.platform === "tiktok" ? "video" : "grid");
  const post = await prisma.post.upsert({
    where: {
      profileId_url_sourceType: {
        profileId: profile.id,
        url: scrapedPost.url,
        sourceType,
      },
    },
    update: {
      caption: scrapedPost.caption ?? undefined,
      externalId: scrapedPost.externalId ?? undefined,
      publishedAt: scrapedPost.publishedAt ?? undefined,
      profileId: profile.id,
      platform: profile.platform,
      sourceType,
    },
    create: {
      platform: profile.platform,
      profileId: profile.id,
      externalId: scrapedPost.externalId ?? null,
      url: scrapedPost.url,
      sourceType,
      caption: scrapedPost.caption ?? null,
      publishedAt: scrapedPost.publishedAt ?? null,
    },
  });

  await prisma.postSnapshot.create({
    data: {
      postId: post.id,
      views: toStoredCount(scrapedPost.metrics.views),
      likes: toStoredCount(scrapedPost.metrics.likes),
      comments: toStoredCount(scrapedPost.metrics.comments),
      shares: toStoredCount(scrapedPost.metrics.shares),
      favorites: toStoredCount(scrapedPost.metrics.favorites),
    },
  });
}

export {
  createBrowserSession,
  deleteBrowserSession,
  listBrowserSessions,
  openLoginBrowser,
  testBrowserSession,
  updateBrowserSession,
};

type ScrapeError = {
  profileId: string;
  handle: string;
  platform: string;
  sessionId?: string;
  sessionName?: string;
  error: string;
};

export async function runScrape(limit = POSTS_PER_PROFILE, profileIds?: string[]) {
  const uniqueProfileIds = profileIds === undefined ? undefined : [...new Set(profileIds)].filter(Boolean);
  const profiles = await prisma.profile.findMany({
    where: {
      status: "active",
      id: uniqueProfileIds === undefined ? undefined : { in: uniqueProfileIds },
    },
    orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
  });
  const run = await prisma.scrapeRun.create({
    data: {
      status: "running",
      profilesTotal: profiles.length,
    },
  });
  const errors: ScrapeError[] = [];
  let profilesOk = 0;
  let postsFound = 0;

  const groups = profiles.reduce<Record<Platform, Profile[]>>(
    (acc, profile) => {
      const platform = profile.platform as Platform;
      acc[platform]?.push(profile);
      return acc;
    },
    { instagram: [], tiktok: [] },
  );

  for (const platform of Object.keys(groups) as Platform[]) {
    const platformProfiles = groups[platform];
    if (platformProfiles.length === 0) {
      continue;
    }

    const scraper = SCRAPERS[platform];
    const sessions = await getActiveBrowserSessions(platform).catch((error) => {
      for (const profile of platformProfiles) {
        errors.push({
          profileId: profile.id,
          handle: profile.handle,
          platform,
          error: errorMessage(error),
        });
      }
      return [];
    });

    if (sessions.length === 0) {
      continue;
    }

    const assignments = sessions.map((session) => ({
      session,
      profiles: [] as Profile[],
    }));

    platformProfiles.forEach((profile, index) => {
      assignments[index % assignments.length].profiles.push(profile);
    });

    const results = await Promise.all(
      assignments
        .filter((assignment) => assignment.profiles.length > 0)
        .map(async ({ session, profiles: assignedProfiles }) => {
          const scrapeContext = await getScrapeContextForSession(session).catch((error) => {
            for (const profile of assignedProfiles) {
              errors.push({
                profileId: profile.id,
                handle: profile.handle,
                platform,
                sessionId: session.id,
                sessionName: session.name,
                error: errorMessage(error),
              });
            }
            return null;
          });

          if (!scrapeContext) {
            return { profilesOk: 0, postsFound: 0 };
          }

          const { context, close } = scrapeContext;
          let sessionProfilesOk = 0;
          let sessionPostsFound = 0;

          try {
            for (const profile of assignedProfiles) {
              try {
                const result = await scraper(
                  context,
                  {
                    id: profile.id,
                    platform,
                    handle: profile.handle,
                    url: profile.url,
                  },
                  limit,
                );
                sessionPostsFound += await persistScrapeResult(profile, result);
                sessionProfilesOk += 1;
              } catch (error) {
                errors.push({
                  profileId: profile.id,
                  handle: profile.handle,
                  platform,
                  sessionId: session.id,
                  sessionName: session.name,
                  error: errorMessage(error),
                });
              }
            }
          } finally {
            await close();
          }

          return { profilesOk: sessionProfilesOk, postsFound: sessionPostsFound };
        }),
    );

    for (const result of results) {
      profilesOk += result.profilesOk;
      postsFound += result.postsFound;
    }
  }

  const status = errors.length === 0 ? "success" : profilesOk > 0 ? "partial_failed" : "failed";
  const updated = await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      profilesOk,
      postsFound,
      errorsJson: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  });

  return {
    id: updated.id,
    status: updated.status,
    profilesTotal: updated.profilesTotal,
    profilesOk: updated.profilesOk,
    postsFound: updated.postsFound,
    errors,
  };
}
