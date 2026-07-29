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

  it("uses the selected platform for a single @handle", () => {
    expect(parseProfileUrl("@Criador.Top", "instagram")).toMatchObject({
      platform: "instagram",
      handle: "criador.top",
      url: "https://www.instagram.com/criador.top/",
    });
    expect(parseProfileUrl("@Criador.Top", "tiktok")).toMatchObject({
      platform: "tiktok",
      handle: "criador.top",
      url: "https://www.tiktok.com/@criador.top",
    });
  });

  it("rejects post URLs for Instagram", () => {
    expect(parseProfileUrl("https://www.instagram.com/reel/abc")).toMatchObject({
      reason: "URL do Instagram não parece ser de perfil",
    });
  });

  it("rejects reserved Instagram chrome paths like blog/help", () => {
    expect(parseProfileUrl("https://www.instagram.com/blog/")).toMatchObject({
      reason: "URL do Instagram não parece ser de perfil",
    });
    expect(parseProfileUrl("https://www.instagram.com/help")).toMatchObject({
      reason: "URL do Instagram não parece ser de perfil",
    });
    expect(parseProfileUrl("@blog", "instagram")).toMatchObject({
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

  it("imports a comma or line-separated list of @handles", () => {
    const result = parseProfileImport("@Primeiro, @Segundo\n@primeiro", "tiktok");

    expect(result.invalid).toHaveLength(0);
    expect(result.valid).toEqual([
      expect.objectContaining({ platform: "tiktok", handle: "primeiro" }),
      expect.objectContaining({ platform: "tiktok", handle: "segundo" }),
    ]);
  });
});
