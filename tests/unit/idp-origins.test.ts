import { describe, expect, it } from "vitest";
import { idpFormActionOrigins } from "@/lib/auth/idp-origins";

describe("idpFormActionOrigins", () => {
  it("lists only the configured providers' origins, deduplicated and in a stable order", () => {
    expect(idpFormActionOrigins({})).toEqual([]);
    expect(
      idpFormActionOrigins({
        AUTH_GITHUB_ID: "x",
        AUTH_GITHUB_SECRET: "y",
        AUTH_GOOGLE_ID: "x",
        AUTH_GOOGLE_SECRET: "y",
      }),
    ).toEqual(["https://github.com", "https://accounts.google.com"]);
  });
  it("reduces an OIDC issuer to its origin and skips half-configured providers", () => {
    expect(
      idpFormActionOrigins({
        AUTH_KEYCLOAK_ISSUER: "https://sso.example.com/realms/me/",
        AUTH_KEYCLOAK_ID: "x",
        AUTH_KEYCLOAK_SECRET: "y",
        AUTH_CASDOOR_ISSUER: "https://casdoor.example.com",
        AUTH_CASDOOR_ID: "x",
        AUTH_OIDC_ISSUER: "https://sso.example.com/realms/other",
        AUTH_OIDC_ID: "x",
        AUTH_OIDC_SECRET: "y",
        AUTH_GITHUB_ID: "only-the-id",
      }),
    ).toEqual(["https://sso.example.com"]);
  });
  it("ignores an issuer that is not an absolute URL", () => {
    expect(
      idpFormActionOrigins({
        AUTH_OIDC_ISSUER: "not a url",
        AUTH_OIDC_ID: "x",
        AUTH_OIDC_SECRET: "y",
      }),
    ).toEqual([]);
  });
});
