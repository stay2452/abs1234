import { describe, expect, it } from "vitest";
import { csvToImportText, detectCsvDelimiter, parseCsvRows } from "@/lib/import-csv";

describe("import-csv", () => {
  it("detects delimiter", () => {
    expect(detectCsvDelimiter("a;b;c")).toBe(";");
    expect(detectCsvDelimiter("a,b,c")).toBe(",");
    expect(detectCsvDelimiter("a\tb\tc")).toBe("\t");
  });

  it("parses quoted cells", () => {
    const rows = parseCsvRows('handle,url\n"user,name",https://instagram.com/user');
    expect(rows[0]).toEqual(["handle", "url"]);
    expect(rows[1][0]).toBe("user,name");
  });

  it("reads simple one-column handles", () => {
    const result = csvToImportText("@Alice\nbob\n@alice\n");
    expect(result.lineCount).toBe(2);
    expect(result.text).toContain("@Alice");
    expect(result.text).toContain("@bob");
  });

  it("reads header handle + platform", () => {
    const csv = `platform,handle
instagram,Criador.Top
tiktok,MeuPerfil
`;
    const result = csvToImportText(csv);
    expect(result.skippedHeader).toBe(true);
    expect(result.lineCount).toBe(2);
    // normalização de case fica no parseProfileUrl na hora do import
    expect(result.text).toMatch(/instagram:@Criador\.Top/i);
    expect(result.text).toMatch(/tiktok:@MeuPerfil/i);
  });

  it("reads url column", () => {
    const csv = `url
https://www.instagram.com/foo/
https://www.tiktok.com/@bar
`;
    const result = csvToImportText(csv);
    expect(result.lineCount).toBe(2);
    expect(result.text).toContain("instagram.com/foo");
    expect(result.text).toContain("tiktok.com/@bar");
  });

  it("reads platform,handle without header", () => {
    const result = csvToImportText("instagram,user_one\ntiktok,user_two");
    expect(result.lineCount).toBe(2);
    expect(result.text).toContain("instagram:@user_one");
    expect(result.text).toContain("tiktok:@user_two");
  });
});
