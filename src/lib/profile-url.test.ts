import { describe, expect, it } from "vitest";
import { parseProfileImport, parseProfileUrl } from "@/lib/profile-url";

describe("parseProfileUrl", () => {
  it("normalizes Instagram profile URLs", () => {
    expect(parseProfileUrl("https://instagram.com/Criador.Top/?hl=pt-br")).toMatchObject({
      platform: "instagram",
      handle: "criador.top",
      url: "https://www.instagram.com/criador.top/",
    });
  });

  it("normalizes TikTok profile URLs", () => {
    expect(parseProfileUrl("www.tiktok.com/@MeuPerfil/video/123")).toMatchObject({
      platform: "tiktok",
      handle: "meuperfil",
      url: "https://www.tiktok.com/@meuperfil",
    });
  });

  it("rejects post URLs for Instagram", () => {
    expect(parseProfileUrl("https://www.instagram.com/reel/abc")).toMatchObject({
      reason: "URL do Instagram não parece ser de perfil",
    });
  });
});

describe("parseProfileImport", () => {
  it("deduplicates valid profiles and keeps invalid rows", () => {
    const result = parseProfileImport(`
      instagram:@Teste
      https://instagram.com/teste
      nope
      tiktok:@Outro
    `);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(1);
  });
});
