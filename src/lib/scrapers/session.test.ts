import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  update: vi.fn(),
  findUniqueOrThrow: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    collectorSession: {
      updateMany: mocks.updateMany,
      update: mocks.update,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
    },
  },
  withDbWriteRetry: (fn: () => Promise<unknown>) => fn(),
}));

import { recordCollectorSessionNoData } from "@/lib/scrapers/session";

describe("recordCollectorSessionNoData", () => {
  beforeEach(() => {
    mocks.updateMany.mockReset();
    mocks.update.mockReset();
    mocks.findUniqueOrThrow.mockReset();
  });

  it("uses an atomic decrement for remaining local credits", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "session-1" });

    await recordCollectorSessionNoData("session-1");

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "session-1",
          creditsSource: "estimated_local",
          creditsRemaining: { gt: 1 },
        },
        data: expect.objectContaining({
          creditsRemaining: { decrement: 1 },
          creditStatus: "has_credit",
        }),
      }),
    );
  });

  it("marks the final local credit as no_credit without going below zero", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "session-1" });

    await recordCollectorSessionNoData("session-1");

    expect(mocks.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "session-1",
          creditsSource: "estimated_local",
          creditsRemaining: 1,
        },
        data: expect.objectContaining({
          creditsRemaining: { decrement: 1 },
          creditStatus: "no_credit",
        }),
      }),
    );
  });
});
