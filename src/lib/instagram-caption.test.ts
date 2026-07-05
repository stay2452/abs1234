import { describe, expect, it } from "vitest";
import { cleanInstagramCaption, isLikelyInstagramGeneratedCaption } from "@/lib/instagram-caption";

describe("instagram caption cleanup", () => {
  it("removes generated accessibility descriptions", () => {
    expect(
      cleanInstagramCaption(
        "Photo by Aurora Cecilia on June 29, 2026. May be an image of one or more people.",
      ),
    ).toBeNull();
  });

  it("keeps real short captions", () => {
    expect(cleanInstagramCaption("Sem amores 🥺")).toBe("Sem amores 🥺");
  });

  it("identifies generated captions without rejecting normal text", () => {
    expect(isLikelyInstagramGeneratedCaption("Image may contain text")).toBe(true);
    expect(isLikelyInstagramGeneratedCaption("Feliz 💛")).toBe(false);
  });
});
