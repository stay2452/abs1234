import { describe, expect, it } from "vitest";
import { canonicalizePostUrl } from "@/lib/post-url";

describe("canonicalizePostUrl", () => {
  it("removes Instagram tracking parameters without changing the content route", () => {
    expect(
      canonicalizePostUrl(
        "instagram",
        "https://instagram.com/reel/AbCd/?igsh=example#comments",
        "AbCd",
      ),
    ).toBe("https://www.instagram.com/reel/AbCd/");
  });

  it("removes TikTok tracking parameters and normalizes the handle", () => {
    expect(
      canonicalizePostUrl(
        "tiktok",
        "https://www.tiktok.com/@Creator/video/123456?lang=pt",
        "123456",
      ),
    ).toBe("https://www.tiktok.com/@creator/video/123456");
  });
});
