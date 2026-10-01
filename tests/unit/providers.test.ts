import { describe, expect, it } from "vitest";
import { configuredProviders } from "@/lib/auth/providers";

describe("configuredProviders", () => {
  it("lists only fully configured providers, in a stable order", () => {
    const list = configuredProviders({
      AUTH_GOOGLE_ID: "g",
      AUTH_GOOGLE_SECRET: "s",
      AUTH_GITHUB_ID: "gh",
      AUTH_GITHUB_SECRET: undefined,
      AUTH_KEYCLOAK_ISSUER: "https://sso.example.com/realms/x",
      AUTH_KEYCLOAK_ID: "k",
      AUTH_KEYCLOAK_SECRET: "ks",
      AUTH_CASDOOR_ISSUER: undefined,
      AUTH_CASDOOR_ID: undefined,
      AUTH_CASDOOR_SECRET: undefined,
      AUTH_OIDC_ISSUER: "https://id.example.com",
      AUTH_OIDC_ID: "o",
      AUTH_OIDC_SECRET: "os",
      AUTH_OIDC_NAME: "Acme SSO",
    });
    expect(list).toEqual([
      { id: "google", name: "Google" },
      { id: "keycloak", name: "Keycloak" },
      { id: "oidc", name: "Acme SSO" },
    ]);
  });
});
