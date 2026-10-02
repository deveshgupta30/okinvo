import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/security-headers";

describe("buildCsp", () => {
  it("embeds the nonce with strict-dynamic and forbids framing", () => {
    const csp = buildCsp({ nonce: "abc123", isProd: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
  it("allows unsafe-eval and websockets only outside production", () => {
    expect(buildCsp({ nonce: "n", isProd: true })).not.toContain("unsafe-eval");
    expect(buildCsp({ nonce: "n", isProd: true })).not.toContain("ws:");
    expect(buildCsp({ nonce: "n", isProd: false })).toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: "n", isProd: false })).toContain("connect-src 'self' ws: wss:");
  });
  it("upgrades insecure requests only when production is actually served over https", () => {
    expect(buildCsp({ nonce: "n", isProd: true, https: true })).toContain(
      "upgrade-insecure-requests",
    );
    expect(buildCsp({ nonce: "n", isProd: true, https: false })).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(buildCsp({ nonce: "n", isProd: false, https: true })).not.toContain(
      "upgrade-insecure-requests",
    );
  });
});

describe("securityHeaders", () => {
  it("sets the baseline headers and HSTS only over https", () => {
    const plain = Object.fromEntries(securityHeaders({ csp: "x", https: false }));
    expect(plain["Content-Security-Policy"]).toBe("x");
    expect(plain["X-Content-Type-Options"]).toBe("nosniff");
    expect(plain["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(plain["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(plain["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(plain["Strict-Transport-Security"]).toBeUndefined();
    const secure = Object.fromEntries(securityHeaders({ csp: "x", https: true }));
    expect(secure["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
  });
});

describe("proxy", () => {
  it("issues a fresh nonce per request", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");
    const a = proxy(new NextRequest("http://localhost/auth/sign-in"));
    const b = proxy(new NextRequest("http://localhost/auth/sign-in"));
    const nonce = (r: Response) =>
      /'nonce-([^']+)'/.exec(r.headers.get("Content-Security-Policy") ?? "")?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
  }, 30_000); // cold import of next/server under a full parallel run
});
