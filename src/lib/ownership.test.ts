import { describe, expect, it } from "vitest";
import { canAccessOwner, isAdmin, ownedVia, ownerWhere } from "@/lib/ownership";

const admin = { id: "a1", name: "Admin", email: "a@x.com", role: "admin" as const };
const user = { id: "u1", name: "Ana", email: "ana@x.com", role: "user" as const };

describe("ownership: biblioteca pessoal", () => {
  it("admin enxerga tudo (sem filtro)", () => {
    expect(ownerWhere(admin)).toEqual({});
    expect(isAdmin(admin)).toBe(true);
  });

  it("usuario comum filtra pelo proprio id", () => {
    expect(ownerWhere(user)).toEqual({ ownerId: "u1" });
    expect(isAdmin(user)).toBe(false);
  });

  it("sem sessao nao filtra (rota decide o 401)", () => {
    expect(ownerWhere(null)).toEqual({});
    expect(isAdmin(null)).toBe(false);
  });

  it("filtro via relacao (Post -> profile)", () => {
    expect(ownedVia("profile", user)).toEqual({ profile: { ownerId: "u1" } });
    expect(ownedVia("profile", admin)).toEqual({ profile: {} });
  });

  it("acesso: dono e admin passam, outro nao", () => {
    expect(canAccessOwner(user, "u1")).toBe(true);
    expect(canAccessOwner(admin, "u1")).toBe(true);
    expect(canAccessOwner(user, "u2")).toBe(false);
    expect(canAccessOwner(user, null)).toBe(false);
    expect(canAccessOwner(null, "u1")).toBe(false);
  });
});
