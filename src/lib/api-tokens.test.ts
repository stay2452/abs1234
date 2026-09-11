import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  tokenHash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  user?: { id: string; name: string; email: string; role: string; isActive: boolean };
};

const store = new Map<string, Row>();
let seq = 0;

vi.mock("@/lib/db", () => ({
  prisma: {
    apiToken: {
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "lastUsedAt" | "revokedAt"> }) => {
        seq += 1;
        const row: Row = {
          ...data,
          id: `tok-${seq}`,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        };
        store.set(row.id, row);
        return row;
      },
      findMany: async ({ where }: { where?: { prefix?: string; revokedAt?: null; userId?: string } }) => {
        const rows = [...store.values()].filter((row) => {
          if (where?.prefix && row.prefix !== where.prefix) return false;
          if (where?.revokedAt === null && row.revokedAt !== null) return false;
          if (where?.userId && row.userId !== where.userId) return false;
          return true;
        });
        return rows.map((row) => ({
          ...row,
          user: row.user ?? {
            id: row.userId,
            name: "Teste",
            email: "teste@x.com",
            role: "user",
            isActive: true,
          },
        }));
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = store.get(where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: { id?: string; userId?: string; revokedAt?: null }; data: Partial<Row> }) => {
        let count = 0;
        for (const row of store.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.userId && row.userId !== where.userId) continue;
          if (where.revokedAt === null && row.revokedAt !== null) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
  },
}));

import { issueApiToken, listApiTokens, revokeApiToken, revokeApiTokenByValue, verifyApiToken } from "@/lib/api-tokens";

beforeEach(() => {
  store.clear();
  seq = 0;
});

describe("api-tokens SaaS", () => {
  it("emite eoz_... e nunca grava o texto em claro", async () => {
    const { token, info } = await issueApiToken("user-1");
    expect(token.startsWith("eoz_")).toBe(true);
    const row = store.get(info.id);
    expect(row?.tokenHash).not.toContain(token);
    expect(row?.prefix).toBe(token.slice(0, 12));
  });

  it("verifica roundtrip e resolve o dono", async () => {
    const { token } = await issueApiToken("user-1");
    const user = await verifyApiToken(token);
    expect(user?.id).toBe("user-1");
    expect(await verifyApiToken(`${token}x`)).toBeNull();
    expect(await verifyApiToken("API_ACCESS_TOKEN-legado")).toBeNull();
  });

  it("revogado nao resolve (por id e por valor)", async () => {
    const { token, info } = await issueApiToken("user-1");
    expect(await revokeApiToken("user-1", info.id)).toBe(true);
    expect(await verifyApiToken(token)).toBeNull();

    const second = await issueApiToken("user-1");
    expect(await revokeApiTokenByValue(second.token)).toBe(true);
    expect(await verifyApiToken(second.token)).toBeNull();
  });

  it("nao revoga token de outro dono", async () => {
    const { info } = await issueApiToken("user-1");
    expect(await revokeApiToken("user-2", info.id)).toBe(false);
  });

  it("lista sem expor hash", async () => {
    await issueApiToken("user-1", "Casa");
    const list = await listApiTokens("user-1");
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("tokenHash");
    expect(list[0].prefix.length).toBeGreaterThan(0);
  });
});
