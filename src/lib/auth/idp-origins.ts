/**
 * Origins of the configured identity providers, for the CSP `form-action` directive (v2 §14):
 * Chrome applies `form-action` to the redirect a form submission ends on, so a sign-in form that
 * bounces to the IdP needs its origin listed. Pure: reads a plain env-like object so the proxy
 * can pass `process.env` without running the full environment validation.
 */
/** `process.env` or any string map; only the `AUTH_*` keys below are read. */
export type IdpEnvLike = Readonly<Record<string, string | undefined>>;

const set = (v: string | undefined): boolean => typeof v === "string" && v.trim() !== "";

function originOf(issuer: string | undefined): string | null {
  if (!set(issuer)) return null;
  try {
    const u = new URL(issuer as string);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function idpFormActionOrigins(env: IdpEnvLike): string[] {
  const origins: (string | null)[] = [];
  if (set(env.AUTH_GITHUB_ID) && set(env.AUTH_GITHUB_SECRET)) origins.push("https://github.com");
  if (set(env.AUTH_GOOGLE_ID) && set(env.AUTH_GOOGLE_SECRET)) {
    origins.push("https://accounts.google.com");
  }
  if (set(env.AUTH_KEYCLOAK_ID) && set(env.AUTH_KEYCLOAK_SECRET)) {
    origins.push(originOf(env.AUTH_KEYCLOAK_ISSUER));
  }
  if (set(env.AUTH_CASDOOR_ID) && set(env.AUTH_CASDOOR_SECRET)) {
    origins.push(originOf(env.AUTH_CASDOOR_ISSUER));
  }
  if (set(env.AUTH_OIDC_ID) && set(env.AUTH_OIDC_SECRET)) {
    origins.push(originOf(env.AUTH_OIDC_ISSUER));
  }
  return [...new Set(origins.filter((o): o is string => o !== null))];
}
