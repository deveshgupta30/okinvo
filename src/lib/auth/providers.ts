import type { ServerEnv } from "@/lib/env.schema";

export type ProviderId = "google" | "github" | "keycloak" | "casdoor" | "oidc";
export interface ProviderInfo {
  id: ProviderId;
  name: string;
}

type ProviderEnv = Pick<
  ServerEnv,
  | "AUTH_GOOGLE_ID"
  | "AUTH_GOOGLE_SECRET"
  | "AUTH_GITHUB_ID"
  | "AUTH_GITHUB_SECRET"
  | "AUTH_KEYCLOAK_ISSUER"
  | "AUTH_KEYCLOAK_ID"
  | "AUTH_KEYCLOAK_SECRET"
  | "AUTH_CASDOOR_ISSUER"
  | "AUTH_CASDOOR_ID"
  | "AUTH_CASDOOR_SECRET"
  | "AUTH_OIDC_ISSUER"
  | "AUTH_OIDC_ID"
  | "AUTH_OIDC_SECRET"
  | "AUTH_OIDC_NAME"
>;

/** Providers the sign-in page offers. Order is fixed so the page is stable across restarts. */
export function configuredProviders(e: ProviderEnv): ProviderInfo[] {
  const out: ProviderInfo[] = [];
  if (e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET) out.push({ id: "google", name: "Google" });
  if (e.AUTH_GITHUB_ID && e.AUTH_GITHUB_SECRET) out.push({ id: "github", name: "GitHub" });
  if (e.AUTH_KEYCLOAK_ISSUER && e.AUTH_KEYCLOAK_ID && e.AUTH_KEYCLOAK_SECRET) {
    out.push({ id: "keycloak", name: "Keycloak" });
  }
  if (e.AUTH_CASDOOR_ISSUER && e.AUTH_CASDOOR_ID && e.AUTH_CASDOOR_SECRET) {
    out.push({ id: "casdoor", name: "Casdoor" });
  }
  if (e.AUTH_OIDC_ISSUER && e.AUTH_OIDC_ID && e.AUTH_OIDC_SECRET) {
    out.push({ id: "oidc", name: e.AUTH_OIDC_NAME });
  }
  return out;
}
