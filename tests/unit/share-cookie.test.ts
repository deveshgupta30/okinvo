import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import {
  SHARE_COOKIE_TTL_MS,
  shareCookieName,
  signShareCookie,
  verifyShareCookie,
} from "@/lib/security/share-cookie";

/** The "password already entered" cookie and the password hash behind share links (spec §5.6). */
describe("share cookie", () => {
  const secret = Buffer.alloc(32, 3);
  const other = Buffer.alloc(32, 4);
  const now = new Date("2026-10-03T10:00:00Z");

  it("verifies within the hour, for the same link and secret only", () => {
    const value = signShareCookie("link-1", secret, now);
    expect(value).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(verifyShareCookie(value, "link-1", secret, now)).toBe(true);
    expect(verifyShareCookie(value, "link-1", secret, new Date(now.getTime() + 59 * 60_000))).toBe(
      true,
    );
    expect(
      verifyShareCookie(value, "link-1", secret, new Date(now.getTime() + SHARE_COOKIE_TTL_MS)),
    ).toBe(false);
    expect(verifyShareCookie(value, "link-2", secret, now)).toBe(false);
    expect(verifyShareCookie(value, "link-1", other, now)).toBe(false);
  });

  it("rejects garbage, tampered expiries and missing values", () => {
    expect(verifyShareCookie(undefined, "link-1", secret, now)).toBe(false);
    expect(verifyShareCookie("", "link-1", secret, now)).toBe(false);
    expect(verifyShareCookie("abc", "link-1", secret, now)).toBe(false);
    const value = signShareCookie("link-1", secret, now);
    const [, mac] = value.split(".");
    expect(
      verifyShareCookie(
        `${now.getTime() + 10 * SHARE_COOKIE_TTL_MS}.${mac}`,
        "link-1",
        secret,
        now,
      ),
    ).toBe(false);
    expect(
      verifyShareCookie(`${now.getTime() + 1000}.${"0".repeat(64)}`, "link-1", secret, now),
    ).toBe(false);
  });

  it("names the cookie after the link", () => {
    expect(shareCookieName("abc")).toBe("okinvo.share.abc");
  });
});

describe("password hash", () => {
  it("round-trips and rejects the wrong password or a malformed hash", async () => {
    const stored = await hashPassword("correct-horse-battery");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword("correct-horse-battery", stored)).toBe(true);
    expect(await verifyPassword("correct-horse-batterx", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
    expect(await verifyPassword("x", "nonsense")).toBe(false);
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  }, 20_000);
});
