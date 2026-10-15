import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";
import { ROLE_RANK, hasRole, requireRole, requireWriter } from "@/server/dal/authz";
import { ForbiddenError } from "@/server/dal/errors";

const actor = (role: Actor["role"]): Actor => ({
  userId: "u",
  email: "u@example.com",
  name: "U",
  role,
  timezone: "UTC",
  locale: "en-US",
});

describe("roles", () => {
  it("rank VIEWER < EDITOR < OWNER", () => {
    expect(ROLE_RANK.VIEWER).toBeLessThan(ROLE_RANK.EDITOR);
    expect(ROLE_RANK.EDITOR).toBeLessThan(ROLE_RANK.OWNER);
  });
  it("requireRole admits the role and anything above it", () => {
    expect(() => requireRole(actor("OWNER"), "OWNER")).not.toThrow();
    expect(() => requireRole(actor("OWNER"), "VIEWER")).not.toThrow();
    expect(() => requireRole(actor("EDITOR"), "EDITOR")).not.toThrow();
    expect(() => requireRole(actor("EDITOR"), "OWNER")).toThrow(ForbiddenError);
    expect(() => requireRole(actor("VIEWER"), "EDITOR")).toThrow(ForbiddenError);
    expect(() => requireRole(actor("VIEWER"), "VIEWER")).not.toThrow();
  });
  it("requireWriter is EDITOR or above; hasRole mirrors it without throwing", () => {
    expect(() => requireWriter(actor("EDITOR"))).not.toThrow();
    expect(() => requireWriter(actor("VIEWER"))).toThrow(ForbiddenError);
    expect(hasRole(actor("VIEWER"), "EDITOR")).toBe(false);
    expect(hasRole(actor("EDITOR"), "VIEWER")).toBe(true);
  });
});
