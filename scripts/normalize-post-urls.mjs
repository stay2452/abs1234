import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function instagramIdFromPath(parts) {
  const typeIndex = parts.findIndex((part) => ["p", "reel", "tv"].includes(part.toLowerCase()));
  return typeIndex >= 0 ? parts[typeIndex + 1] ?? null : null;
}

function tikTokIdFromPath(parts) {
  const videoIndex = parts.findIndex((part) => part.toLowerCase() === "video");
  return videoIndex >= 0 ? parts[videoIndex + 1] ?? null : null;
}

function canonicalizePostUrl(platform, rawUrl, externalId) {
  const parsed = normalizedUrl(rawUrl);
  const fallbackId = typeof externalId === "string" && externalId.trim() ? externalId.trim() : null;

  if (!parsed) {
    return rawUrl.trim();
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (platform === "instagram") {
    const type = parts.find((part) => ["p", "reel", "tv"].includes(part.toLowerCase()))?.toLowerCase() ?? "p";
    const id = instagramIdFromPath(parts) ?? fallbackId;
    return id ? `https://www.instagram.com/${type}/${id}/` : `https://www.instagram.com/${parts.join("/")}/`;
  }

  if (platform === "tiktok") {
    const id = tikTokIdFromPath(parts) ?? fallbackId;
    const handle = parts.find((part) => part.startsWith("@"));
    return id && handle
      ? `https://www.tiktok.com/${handle.toLowerCase()}/video/${id}`
      : `https://www.tiktok.com/${parts.join("/")}`;
  }

  return parsed.toString().replace(/\/$/, "");
}

function earliestDate(posts, field) {
  const dates = posts.map((post) => post[field]).filter((value) => value instanceof Date);
  return dates.length > 0 ? new Date(Math.min(...dates.map((value) => value.getTime()))) : null;
}

async function normalizePosts() {
  const posts = await prisma.post.findMany({
    select: {
      id: true,
      profileId: true,
      platform: true,
      sourceType: true,
      url: true,
      externalId: true,
      caption: true,
      publishedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map();
  for (const post of posts) {
    const canonicalUrl = canonicalizePostUrl(post.platform, post.url, post.externalId);
    const key = `${post.profileId}\u0000${post.sourceType}\u0000${canonicalUrl}`;
    const group = groups.get(key) ?? { canonicalUrl, posts: [] };
    group.posts.push(post);
    groups.set(key, group);
  }

  let urlsUpdated = 0;
  let postsMerged = 0;
  let snapshotsMoved = 0;

  for (const { canonicalUrl, posts: groupPosts } of groups.values()) {
    const survivor = groupPosts[0];
    const duplicates = groupPosts.slice(1);
    const externalId = groupPosts.find((post) => post.externalId)?.externalId ?? null;
    const caption = groupPosts.find((post) => post.caption)?.caption ?? null;
    const publishedAt = earliestDate(groupPosts, "publishedAt");

    await prisma.$transaction(async (tx) => {
      if (duplicates.length > 0) {
        const duplicateIds = duplicates.map((post) => post.id);
        const moved = await tx.postSnapshot.updateMany({
          where: { postId: { in: duplicateIds } },
          data: { postId: survivor.id },
        });
        snapshotsMoved += moved.count;
        await tx.post.deleteMany({ where: { id: { in: duplicateIds } } });
        postsMerged += duplicates.length;
      }

      if (
        survivor.url !== canonicalUrl ||
        survivor.externalId !== externalId ||
        survivor.caption !== caption ||
        String(survivor.publishedAt ?? "") !== String(publishedAt ?? "")
      ) {
        await tx.post.update({
          where: { id: survivor.id },
          data: { url: canonicalUrl, externalId, caption, publishedAt },
        });
        if (survivor.url !== canonicalUrl) {
          urlsUpdated += 1;
        }
      }
    });
  }

  console.log(JSON.stringify({ postsScanned: posts.length, urlsUpdated, postsMerged, snapshotsMoved }));
}

normalizePosts()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha ao normalizar URLs de posts.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
