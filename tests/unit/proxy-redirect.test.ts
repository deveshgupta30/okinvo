import { describe, expect, it } from "vitest";
import { shouldRedirectToSignIn } from "@/lib/auth/redirect";

describe("shouldRedirectToSignIn", () => {
  it("sends anonymous page navigations in the app to sign-in", () => {
    expect(shouldRedirectToSignIn("/", false)).toBe(true);
    expect(shouldRedirectToSignIn("/invoices/abc", false)).toBe(true);
    expect(shouldRedirectToSignIn("/settings/profiles", false)).toBe(true);
  });
  it("never redirects public, auth, api or asset paths", () => {
    for (const p of [
      "/auth/sign-in",
      "/auth/error",
      "/verify/abc",
      "/api/auth/sign-in/social",
      "/api/health/live",
      "/api/exports/invoices",
      "/_next/static/x.js",
      "/favicon.ico",
      "/robots.txt",
      "/icon.svg",
      "/apple-icon.png",
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/flags/in.svg",
    ]) {
      expect(shouldRedirectToSignIn(p, false)).toBe(false);
    }
  });
  it("does nothing when a session cookie is present", () => {
    expect(shouldRedirectToSignIn("/invoices", true)).toBe(false);
  });
});
