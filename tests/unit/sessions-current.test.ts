import { describe, expect, it } from "vitest";
import { withCurrentSession } from "@/server/dal/sessions";

/**
 * Settings > Security always shows the device you are on: when the auth library's session list
 * leaves the current session out (it caps the list, and an owner who signs in daily for months
 * exceeds it), the current session is added from the request itself and sorted first.
 */
const row = (id: string, updatedAt: string) => ({
  id,
  ipAddress: null,
  userAgent: "Chrome",
  createdAt: updatedAt,
  updatedAt,
  expiresAt: "2026-11-14T00:00:00.000Z",
  current: false,
});

describe("withCurrentSession", () => {
  it("marks the current session when the list contains it and sorts it first", () => {
    const rows = [row("a", "2026-10-15T10:00:00.000Z"), row("b", "2026-10-15T11:00:00.000Z")];
    const out = withCurrentSession(rows, {
      id: "a",
      createdAt: new Date("2026-10-15T10:00:00Z"),
      updatedAt: new Date("2026-10-15T10:00:00Z"),
      expiresAt: new Date("2026-11-14T00:00:00Z"),
      ipAddress: null,
      userAgent: "Chrome",
    });
    expect(out.map((r) => [r.id, r.current])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("adds the current session when the capped list left it out", () => {
    const rows = [row("old", "2026-09-01T10:00:00.000Z")];
    const out = withCurrentSession(rows, {
      id: "now",
      createdAt: new Date("2026-10-15T12:00:00Z"),
      updatedAt: new Date("2026-10-15T12:00:00Z"),
      expiresAt: new Date("2026-11-14T00:00:00Z"),
      ipAddress: "127.0.0.1",
      userAgent: "Firefox",
    });
    expect(out[0]).toMatchObject({
      id: "now",
      current: true,
      userAgent: "Firefox",
      ipAddress: "127.0.0.1",
    });
    expect(out).toHaveLength(2);
  });

  it("leaves the list alone without a current session", () => {
    const rows = [row("a", "2026-10-15T10:00:00.000Z")];
    expect(withCurrentSession(rows, null)).toEqual(rows);
  });
});
