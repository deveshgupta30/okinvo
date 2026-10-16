import { INPUT_CHARSET_MESSAGE, isKeyboardText } from "@/lib/input-charset";
import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, jwt, type GenericOAuthConfig } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { lazyProxy } from "@/lib/lazy";
import { invitedRole } from "@/server/admission";
import { isAllowedEmail } from "@/server/allow-list";

const SESSION_DAYS = 30;

/** Keycloak, Casdoor and any OIDC issuer go through the generic OAuth plugin via discovery (v2 §9.1). */
function oidcProviders(): GenericOAuthConfig[] {
  const out: GenericOAuthConfig[] = [];
  const add = (providerId: string, issuer?: string, clientId?: string, clientSecret?: string) => {
    if (!issuer || !clientId || !clientSecret) return;
    out.push({
      providerId,
      discoveryUrl: `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
      clientId,
      clientSecret,
      scopes: ["openid", "profile", "email"],
      pkce: true,
    });
  };
  add("keycloak", env.AUTH_KEYCLOAK_ISSUER, env.AUTH_KEYCLOAK_ID, env.AUTH_KEYCLOAK_SECRET);
  add("casdoor", env.AUTH_CASDOOR_ISSUER, env.AUTH_CASDOOR_ID, env.AUTH_CASDOOR_SECRET);
  add("oidc", env.AUTH_OIDC_ISSUER, env.AUTH_OIDC_ID, env.AUTH_OIDC_SECRET);
  return out;
}

function createAuth() {
  const trustedProviders = env.AUTH_LINKING_TRUSTED_PROVIDERS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return betterAuth({
    appName: "okinvo",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    // Better Auth limits sign-in and sign-up per client IP in production (3 per 10 s). The e2e
    // suite signs its fixed owners in dozens of times from one address, so it turns this off.
    ...(env.AUTH_RATE_LIMIT ? {} : { rateLimit: { enabled: false } }),
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // Email + password only when the owner opts in (R1); the allow-list hook below still gates sign-up.
    emailAndPassword: {
      enabled: env.AUTH_PASSWORD_SIGNIN,
      minPasswordLength: 12,
      requireEmailVerification: false,
      autoSignIn: true,
    },
    socialProviders: {
      ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
        ? { google: { clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET } }
        : {}),
      ...(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET
        ? { github: { clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET } }
        : {}),
    },
    plugins: [
      genericOAuth({ config: oidcProviders() }),
      // API tokens: GET /api/auth/token mints a 15-minute EdDSA JWT for the signed-in session,
      // /api/auth/jwks publishes the keys, and route handlers accept `Authorization: Bearer`
      // (src/server/auth.ts). Browser sessions stay server-side cookies so revocation is immediate.
      jwt({
        jwt: {
          expirationTime: "15m",
          definePayload: ({ user }) => ({ email: user.email, role: user.role }),
        },
      }),
      nextCookies(),
    ],
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "OWNER", input: false },
        timezone: { type: "string", required: false, input: true },
        // Preferences are written through the audited DAL (src/server/dal/users.ts), never via
        // Better Auth's update-user route: input: false keeps that route from touching them.
        accent: { type: "string", defaultValue: "mint", input: false },
        countryCode: { type: "string", required: false, input: false },
        currency: { type: "string", required: false, input: false },
        locale: { type: "string", defaultValue: "en-US", input: false },
        usage: { type: "string", required: false, input: false },
        onboardedAt: { type: "date", required: false, input: false },
        deactivatedAt: { type: "date", required: false, input: false },
      },
    },
    account: { accountLinking: { enabled: true, trustedProviders } },
    session: {
      expiresIn: 60 * 60 * 24 * SESSION_DAYS,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false }, // revocation must be immediate (Settings → Security)
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            // The display name is user input like any other text field (SPEC.md §6.6).
            if (!isKeyboardText(user.name ?? "")) {
              throw new APIError("BAD_REQUEST", { message: INPUT_CHARSET_MESSAGE });
            }
            // Admitted by the env list, or by an active invitation (Settings → Users).
            const invited = await invitedRole(user.email);
            if (!invited && !isAllowedEmail(user.email, env.allowList)) {
              throw new APIError("FORBIDDEN", {
                message: "This email is not allowed to sign in.",
              });
            }
            // A password sign-up proves nothing about who owns the address, so a `*@domain`
            // pattern must not be enough: the address has to be listed exactly (review finding;
            // identity-provider sign-ins still honour the pattern). An invitation is exact.
            const exact =
              invited !== null || env.allowList.emails.has(user.email.trim().toLowerCase());
            if (ctx?.path === "/sign-up/email" && !exact) {
              throw new APIError("FORBIDDEN", {
                message: "Password sign-up needs this exact address on the allow-list.",
              });
            }
            return { data: { ...user, role: invited ?? "OWNER" } };
          },
          after: async (user) => {
            await prisma.allowedEmail.updateMany({
              where: { email: user.email.trim().toLowerCase(), acceptedAt: null },
              data: { acceptedAt: new Date() },
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { deactivatedAt: true },
            });
            if (user?.deactivatedAt) {
              throw new APIError("FORBIDDEN", { message: "This account is deactivated." });
            }
          },
          after: async (session) => {
            await prisma.auditEvent.create({
              data: {
                actorId: session.userId,
                action: "auth.sign_in",
                entityType: "Session",
                entityId: session.id,
                ipAddress: session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
              },
            });
          },
        },
      },
    },
    advanced: {
      useSecureCookies: env.APP_URL.startsWith("https://"),
      // Only read forwarded addresses when the deployment declares a trusted proxy.
      ipAddress: { ipAddressHeaders: env.TRUST_PROXY ? ["x-forwarded-for", "x-real-ip"] : [] },
    },
    trustedOrigins: [env.APP_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Lazy: env and the database client are touched on first use, never at import (see lib/db). */
export const auth: Auth = lazyProxy(createAuth);
