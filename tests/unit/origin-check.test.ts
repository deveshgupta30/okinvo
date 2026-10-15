import { describe, expect, it } from "vitest";
import { originAllowed } from "@/lib/security/origin";

const h = (init: Record<string, string>) => new Headers(init);
const APP = "https://invoices.example.com";

describe("originAllowed", () => {
  it("accepts a matching Origin and rejects any other", () => {
    expect(originAllowed(h({ origin: "https://invoices.example.com" }), APP)).toBe(true);
    expect(originAllowed(h({ origin: "https://evil.example" }), APP)).toBe(false);
    expect(originAllowed(h({ origin: "http://invoices.example.com" }), APP)).toBe(false);
    expect(originAllowed(h({ origin: "null" }), APP)).toBe(false);
  });
  it("compares origins, not whole URLs, and ignores APP_URL's path", () => {
    expect(originAllowed(h({ origin: "https://invoices.example.com" }), `${APP}/`)).toBe(true);
    expect(originAllowed(h({ origin: "https://localhost:8443" }), "https://localhost:8443")).toBe(
      true,
    );
  });
  it("falls back to Sec-Fetch-Site when there is no Origin, and allows non-browser clients", () => {
    expect(originAllowed(h({ "sec-fetch-site": "same-origin" }), APP)).toBe(true);
    expect(originAllowed(h({ "sec-fetch-site": "none" }), APP)).toBe(true);
    expect(originAllowed(h({ "sec-fetch-site": "cross-site" }), APP)).toBe(false);
    expect(originAllowed(h({ "sec-fetch-site": "same-site" }), APP)).toBe(false);
    expect(originAllowed(h({}), APP)).toBe(true); // curl, health checks, scripts
  });
});

describe("proxy origin check on custom POST routes", () => {
  it("rejects a cross-origin POST to /api/uploads and leaves /api/auth to Better Auth", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("@/proxy");
    process.env.APP_URL = "http://localhost:3000";
    const post = (path: string, headers: Record<string, string>) =>
      new NextRequest(`http://localhost${path}`, { method: "POST", headers });

    const foreign = proxy(post("/api/uploads", { origin: "https://evil.example" }));
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ error: "bad_origin" });

    const same = proxy(post("/api/uploads", { origin: "http://localhost:3000" }));
    expect(same.status).toBe(200);

    const auth = proxy(post("/api/auth/sign-in/social", { origin: "https://evil.example" }));
    expect(auth.status).toBe(200);

    const get = proxy(
      new NextRequest("http://localhost/api/exports/clients", {
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(get.status).toBe(200);
  }, 30_000); // cold import of next/server under a full parallel run
});
