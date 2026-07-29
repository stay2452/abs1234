import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_IMPORT_PROFILES,
  MAX_IMPORT_TEXT_CHARS,
  PLATFORMS,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import { optionsCors, withCors } from "@/lib/extension-cors";
import { parseProfileImport } from "@/lib/profile-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const importSchema = z.object({
  text: z.string().min(1).max(MAX_IMPORT_TEXT_CHARS),
  defaultPlatform: z.enum(PLATFORMS).optional(),
});

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request.headers.get("origin"));
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const parsedBody = importSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return withCors(
      NextResponse.json(
        {
          error: `Envie URLs, @perfis ou uma lista valida (ate ${MAX_IMPORT_TEXT_CHARS.toLocaleString("pt-BR")} caracteres).`,
        },
        { status: 400 },
      ),
      origin,
    );
  }

  const parsed = parseProfileImport(parsedBody.data.text, parsedBody.data.defaultPlatform);

  if (parsed.valid.length === 0) {
    return withCors(
      NextResponse.json({
        created: 0,
        updated: 0,
        profileIds: [] as string[],
        createdIds: [] as string[],
        updatedIds: [] as string[],
        invalid: parsed.invalid,
        totalValid: 0,
      }),
      origin,
    );
  }

  if (parsed.valid.length > MAX_IMPORT_PROFILES) {
    return withCors(
      NextResponse.json(
        {
          error: `Limite de ${MAX_IMPORT_PROFILES} perfis por importacao. Voce enviou ${parsed.valid.length} validos. Divida a lista em partes.`,
          totalValid: parsed.valid.length,
          invalid: parsed.invalid,
        },
        { status: 400 },
      ),
      origin,
    );
  }

  const existing = await prisma.profile.findMany({
    where: {
      OR: parsed.valid.map((profile) => ({
        platform: profile.platform,
        handle: profile.handle,
      })),
    },
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  });
  const existingByKey = new Map(
    existing.map((profile) => [`${profile.platform}:${profile.handle}`, profile]),
  );

  const toCreate = parsed.valid.filter(
    (profile) => !existingByKey.has(`${profile.platform}:${profile.handle}`),
  );
  const toUpdate = parsed.valid.filter((profile) =>
    existingByKey.has(`${profile.platform}:${profile.handle}`),
  );

  if (toCreate.length > 0) {
    await prisma.profile.createMany({
      data: toCreate.map((profile) => ({
        platform: profile.platform,
        handle: profile.handle,
        url: profile.url,
        status: "active",
      })),
    });
  }

  const UPDATE_BATCH = 50;
  for (let index = 0; index < toUpdate.length; index += UPDATE_BATCH) {
    const slice = toUpdate.slice(index, index + UPDATE_BATCH);
    await prisma.$transaction(
      slice.map((profile) => {
        const current = existingByKey.get(`${profile.platform}:${profile.handle}`);
        if (!current) {
          throw new Error(`Perfil sumiu durante o import: ${profile.handle}`);
        }
        return prisma.profile.update({
          where: { id: current.id },
          data: {
            url: profile.url,
            status: "active",
          },
        });
      }),
    );
  }

  const saved = await prisma.profile.findMany({
    where: {
      OR: parsed.valid.map((profile) => ({
        platform: profile.platform,
        handle: profile.handle,
      })),
    },
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  });
  const savedByKey = new Map(
    saved.map((profile) => [`${profile.platform}:${profile.handle}`, profile.id]),
  );

  const createdIds: string[] = [];
  const updatedIds: string[] = [];
  const profileIds: string[] = [];

  for (const profile of parsed.valid) {
    const id = savedByKey.get(`${profile.platform}:${profile.handle}`);
    if (!id) {
      continue;
    }
    profileIds.push(id);
    if (existingByKey.has(`${profile.platform}:${profile.handle}`)) {
      updatedIds.push(id);
    } else {
      createdIds.push(id);
    }
  }

  return withCors(
    NextResponse.json({
      created: createdIds.length,
      updated: updatedIds.length,
      profileIds,
      createdIds,
      updatedIds,
      invalid: parsed.invalid,
      totalValid: parsed.valid.length,
      profiles: parsed.valid.map((profile) => ({
        platform: profile.platform,
        handle: profile.handle,
        url: profile.url,
        id: savedByKey.get(`${profile.platform}:${profile.handle}`) ?? null,
      })),
    }),
    origin,
  );
}
