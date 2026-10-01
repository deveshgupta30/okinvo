import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, jwt, type GenericOAuthConfig } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { lazyProxy } from "@/lib/lazy";
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
            if (!isAllowedEmail(user.email, env.allowList)) {
              throw new APIError("FORBIDDEN", {
                message: "This email is not allowed to sign in.",
              });
            }
            // A password sign-up proves nothing about who owns the address, so a `*@domain`
            // pattern must not be enough: the address has to be listed exactly (review finding;
            // identity-provider sign-ins still honour the pattern).
            const exact = env.allowList.emails.has(user.email.trim().toLowerCase());
            if (ctx?.path === "/sign-up/email" && !exact) {
              throw new APIError("FORBIDDEN", {
                message: "Password sign-up needs this exact address on the allow-list.",
              });
            }
            return { data: { ...user, role: "OWNER" } };
          },
        },
      },
      session: {
        create: {
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
