import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * API tokens (JWT): a signed-in owner mints a short-lived token at GET /api/auth/token, the
 * public keys are served at /api/auth/jwks, and route handlers accept `Authorization: Bearer`
 * by verifying the signature and re-checking the user, allow-list and role.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("JWT API tokens", () => {
  const email = `jwt-${Date.now()}@allowed.example`;
  const password = "correct horse battery staple";
  let auth: typeof import("@/server/auth-config").auth;
  let prisma: typeof import("@/lib/db").prisma;
  let actorFromBearer: typeof import("@/server/auth").actorFromBearer;
  let cookie: string;

  beforeAll(async () => {
    process.env.AUTH_PASSWORD_SIGNIN = "true";
    process.env.AUTH_ALLOWED_EMAILS = email;
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ auth } = await import("@/server/auth-config"));
    ({ prisma } = await import("@/lib/db"));
    ({ actorFromBearer } = await import("@/server/auth"));
    const { headers } = await auth.api.signUpEmail({
      body: { email, password, name: "Token Owner" },
      returnHeaders: true,
    });
    const setCookie = headers.get("set-cookie") ?? "";
    const pair = setCookie.split(",").map((c) => c.split(";")[0]?.trim() ?? "");
    cookie = pair.filter((p) => p.includes("session_token")).join("; ");
    expect(cookie).toContain("session_token=");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it("mints a token for the session, publishes the keys and verifies the token", async () => {
    const { token } = await auth.api.getToken({ headers: new Headers({ cookie }) });
    expect(token.split(".")).toHaveLength(3);
    const jwks = await auth.api.getJwks();
    expect(jwks.keys.length).toBeGreaterThan(0);
    expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519" });
    const { payload } = await auth.api.verifyJWT({ body: { token } });
    if (!payload) throw new Error("token did not verify");
    expect(payload).toMatchObject({ email, role: "OWNER" });
    expect(typeof payload.sub).toBe("string");
    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(15 * 60);
  });

  it("turns a bearer token into the owner's Actor, and nothing else into one", async () => {
    const { token } = await auth.api.getToken({ headers: new Headers({ cookie }) });
    const actor = await actorFromBearer(`Bearer ${token}`, new Headers());
    expect(actor).toMatchObject({ email, role: "OWNER", name: "Token Owner" });
    expect(await actorFromBearer(null, new Headers())).toBeNull();
    expect(await actorFromBearer("Bearer not.a.jwt", new Headers())).toBeNull();
    const [h, p, s] = token.split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), role: "ADMIN" })).toString("base64url")}.${s}`;
    expect(await actorFromBearer(`Bearer ${tampered}`, new Headers())).toBeNull();
  });

  it("refuses a token without a session and a token whose user is gone", async () => {
    await expect(auth.api.getToken({ headers: new Headers() })).rejects.toMatchObject({
      status: "UNAUTHORIZED",
    });
    const { token } = await auth.api.getToken({ headers: new Headers({ cookie }) });
    await prisma.user.deleteMany({ where: { email } });
    expect(await actorFromBearer(`Bearer ${token}`, new Headers())).toBeNull();
  });
});
