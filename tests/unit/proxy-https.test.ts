import { describe, expect, it } from "vitest";
import { forceHttpsEnabled, shouldForceHttps } from "@/lib/security/force-https";

/**
 * Force HTTPS (addendum §1): behind Caddy or an ingress the app sees plain http with
 * `x-forwarded-proto`; when the flag is on, a plain request is sent to https, except the
 * health probes that Compose and Kubernetes call over http inside the network.
 */
const h = (entries: Record<string, string>) => new Headers(entries);

describe("shouldForceHttps", () => {
  it("redirects a plain http request when the flag is on", () => {
    expect(shouldForceHttps(h({}), "/invoices", "http:", true)).toBe(true);
    expect(shouldForceHttps(h({ "x-forwarded-proto": "http" }), "/", "http:", true)).toBe(true);
  });
  it("leaves https alone, whether direct or forwarded", () => {
    expect(shouldForceHttps(h({ "x-forwarded-proto": "https" }), "/invoices", "http:", true)).toBe(
      false,
    );
    expect(shouldForceHttps(h({}), "/invoices", "https:", true)).toBe(false);
    expect(shouldForceHttps(h({ "x-forwarded-proto": "https, http" }), "/", "http:", true)).toBe(
      false,
    );
  });
  it("never redirects the health probes", () => {
    expect(shouldForceHttps(h({}), "/api/health/live", "http:", true)).toBe(false);
    expect(shouldForceHttps(h({}), "/api/health/ready", "http:", true)).toBe(false);
  });
  it("does nothing when the flag is off", () => {
    expect(shouldForceHttps(h({}), "/invoices", "http:", false)).toBe(false);
  });
});

describe("forceHttpsEnabled", () => {
  it("defaults to on in production and off elsewhere", () => {
    expect(forceHttpsEnabled(undefined, "production")).toBe(true);
    expect(forceHttpsEnabled(undefined, "development")).toBe(false);
    expect(forceHttpsEnabled(undefined, "test")).toBe(false);
  });
  it("honours an explicit value", () => {
    expect(forceHttpsEnabled("false", "production")).toBe(false);
    expect(forceHttpsEnabled("true", "development")).toBe(true);
    expect(forceHttpsEnabled("1", "development")).toBe(true);
    expect(forceHttpsEnabled("no", "production")).toBe(false);
  });
});
