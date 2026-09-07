import { describe, expect, it } from "vitest";
import {
  hashPassword,
  loginSchema,
  normalizeEmail,
  registerSchema,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";

const TEST_SECRET = "segredo-de-teste-com-mais-de-32-caracteres-ok";

describe("auth: senha", () => {
  it("hash valida a senha certa e rejeita a errada", () => {
    const stored = hashPassword("minha-senha-123");
    expect(verifyPassword("minha-senha-123", stored)).toBe(true);
    expect(verifyPassword("outra-senha", stored)).toBe(false);
  });

  it("rejeita formato invalido sem quebrar", () => {
    expect(verifyPassword("x", "sem-separador")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });

  it("cada hash usa salt diferente", () => {
    expect(hashPassword("mesma")).not.toBe(hashPassword("mesma"));
  });
});

describe("auth: sessao", () => {
  it("assina e valida", () => {
    const token = signSessionToken({ id: "u1", role: "user" }, TEST_SECRET);
    const payload = verifySessionToken(token, TEST_SECRET);
    expect(payload?.uid).toBe("u1");
    expect(payload?.role).toBe("user");
  });

  it("rejeita payload adulterado", () => {
    const token = signSessionToken({ id: "u1", role: "user" }, TEST_SECRET);
    const [encoded, sig] = token.split(".");
    const fake = Buffer.from(JSON.stringify({ uid: "admin", role: "admin", exp: 9999999999 })).toString(
      "base64url",
    );
    expect(verifySessionToken(`${fake}.${sig}`, TEST_SECRET)).toBeNull();
    expect(verifySessionToken(`${encoded}.assinatura-falsa`, TEST_SECRET)).toBeNull();
  });

  it("rejeita secret errado", () => {
    const token = signSessionToken({ id: "u1", role: "admin" }, TEST_SECRET);
    expect(verifySessionToken(token, "outro-segredo-com-mais-de-32-caracteres")).toBeNull();
  });

  it("rejeita token malformado", () => {
    expect(verifySessionToken("sem-ponto", TEST_SECRET)).toBeNull();
    expect(verifySessionToken("", TEST_SECRET)).toBeNull();
  });
});

describe("auth: validacao", () => {
  it("cadastro exige nome, email e senha >= 8", () => {
    expect(registerSchema.safeParse({ name: "A", email: "x", password: "123" }).success).toBe(false);
    const ok = registerSchema.safeParse({ name: "Ana", email: "ANA@mail.com", password: "12345678" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.email).toBe("ana@mail.com");
    }
  });

  it("login exige email e senha", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("normalizeEmail padroniza", () => {
    expect(normalizeEmail("  ANA@Mail.COM ")).toBe("ana@mail.com");
  });
});
