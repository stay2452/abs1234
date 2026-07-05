import { describe, expect, it } from "vitest";
import { maskProxy, parseProxyConfig } from "@/lib/proxy";

describe("parseProxyConfig", () => {
  it("parses provider format host:port:user:password", () => {
    expect(parseProxyConfig("45.38.101.31:5964:marketbetrdw:mbxyfkvd93e8")).toEqual({
      server: "http://45.38.101.31:5964",
      username: "marketbetrdw",
      password: "mbxyfkvd93e8",
    });
  });

  it("parses full proxy URLs", () => {
    expect(parseProxyConfig("http://user:pass@127.0.0.1:9999")).toEqual({
      server: "http://127.0.0.1:9999",
      username: "user",
      password: "pass",
    });
  });

  it("parses host:port without auth", () => {
    expect(parseProxyConfig("127.0.0.1:9999")).toEqual({
      server: "http://127.0.0.1:9999",
    });
  });
});

describe("maskProxy", () => {
  it("masks provider credentials", () => {
    expect(maskProxy("45.38.101.31:5964:marketbetrdw:mbxyfkvd93e8")).toBe(
      "http://marketbetrdw:***@45.38.101.31:5964",
    );
  });
});
