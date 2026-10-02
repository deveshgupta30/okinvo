import { describe, expect, it } from "vitest";
import { SIDEBAR_COOKIE, parseSidebar, sidebarCookie } from "@/lib/sidebar";

describe("sidebar state", () => {
  it("is expanded unless the cookie says collapsed", () => {
    expect(parseSidebar("collapsed")).toBe("collapsed");
    for (const v of ["expanded", "", "yes", undefined, null, 0]) {
      expect(parseSidebar(v)).toBe("expanded");
    }
  });
  it("writes a year-long, lax, site-wide cookie", () => {
    const c = sidebarCookie("collapsed");
    expect(c.startsWith(`${SIDEBAR_COOKIE}=collapsed;`)).toBe(true);
    expect(c).toContain("path=/");
    expect(c).toContain("max-age=31536000");
    expect(c).toContain("samesite=lax");
    expect(c).not.toMatch(/httponly/i);
  });
});
