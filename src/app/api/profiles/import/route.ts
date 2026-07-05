import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseProfileImport } from "@/lib/profile-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const importSchema = z.object({
  text: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsedBody = importSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Envie uma lista de URLs." }, { status: 400 });
  }

  const parsed = parseProfileImport(parsedBody.data.text);

  let created = 0;
  let updated = 0;
  const profileIds: string[] = [];

  for (const profile of parsed.valid) {
    const existing = await prisma.profile.findUnique({
      where: {
        platform_handle: {
          platform: profile.platform,
          handle: profile.handle,
        },
      },
    });

    if (existing) {
      const updatedProfile = await prisma.profile.update({
        where: { id: existing.id },
        data: {
          url: profile.url,
          status: "active",
        },
      });
      profileIds.push(updatedProfile.id);
      updated += 1;
    } else {
      const createdProfile = await prisma.profile.create({
        data: {
          platform: profile.platform,
          handle: profile.handle,
          url: profile.url,
          status: "active",
        },
      });
      profileIds.push(createdProfile.id);
      created += 1;
    }
  }

  return NextResponse.json({
    created,
    updated,
    profileIds,
    invalid: parsed.invalid,
    totalValid: parsed.valid.length,
  });
}
