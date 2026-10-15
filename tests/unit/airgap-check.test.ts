import { describe, expect, it } from "vitest";
import { scanText, SECRET_ENV_NAMES } from "../../scripts/airgap-check";

/**
 * The air-gap guard (addendum §1): the built output must not reference the internet, and the
 * client bundles must not carry the names of secret environment variables.
 */
describe("scanText", () => {
  it("flags external font, CDN and arbitrary https hosts with their line", () => {
    const text = [
      "const a = 1;",
      'link.href = "https://fonts.googleapis.com/css2?family=Inter";',
      'import("https://cdn.jsdelivr.net/npm/x");',
      'fetch("https://api.example.net/v1")',
    ].join("\n");
    const found = scanText(text, "static/chunks/app.js", { secrets: false, anyHost: true });
    expect(found.map((f) => [f.line, f.match])).toEqual([
      [2, "https://fonts.googleapis.com"],
      [3, "https://cdn.jsdelivr.net"],
      [4, "https://api.example.net"],
    ]);
    expect(found[0]!.file).toBe("static/chunks/app.js");
  });

  it("lets documentation and schema identifiers through", () => {
    const text = [
      "// see https://nextjs.org/docs/app and https://github.com/deveshgupta30/okinvo",
      'xmlns="http://www.w3.org/2000/svg"',
      'ns = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
      'const x = "http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/common/UBL-CommonBasicComponents-2.xsd"',
      'const guideline = "urn:cen.eu:en16931:2017"',
    ].join("\n");
    expect(scanText(text, "server/app/x.js", { secrets: false, anyHost: true })).toEqual([]);
  });

  it("flags secret environment variable names only when asked (client bundles)", () => {
    const text = 'const k = process.env.FIELD_ENCRYPTION_KEY; const s = "AUTH_SECRET=";';
    expect(
      scanText(text, "static/chunks/a.js", { secrets: true, anyHost: true }).map((f) => f.match),
    ).toEqual(["FIELD_ENCRYPTION_KEY", "AUTH_SECRET"]);
    expect(scanText(text, "server/chunks/a.js", { secrets: false, anyHost: false })).toEqual([]);
  });

  it("passes a clean file", () => {
    expect(
      scanText('fetch("/api/health/live"); const u = "/fonts/inter.woff2";', "a.js", {
        secrets: true,
        anyHost: true,
      }),
    ).toEqual([]);
  });

  it("flags only font hosts in server chunks, where library URLs are identifiers", () => {
    const text = [
      'const docs = "https://accounts.google.com/o/oauth2/v2/auth";',
      'const bad = "https://cdn.jsdelivr.net/npm/x";',
      'const font = "https://fonts.gstatic.com/s/inter.woff2";',
    ].join("\n");
    expect(scanText(text, "server/chunks/b.js", { secrets: false, anyHost: false })).toEqual([
      { file: "server/chunks/b.js", line: 3, match: "https://fonts.gstatic.com" },
    ]);
  });

  it("ignores dotless fragments of minified code and a library's env getters", () => {
    const text = 'u="https://"+x; get AUTH_SECRET(){return l("AUTH_SECRET")}';
    expect(scanText(text, "static/chunks/c.js", { secrets: true, anyHost: true })).toEqual([]);
  });

  it("names the secrets the schema marks secret", () => {
    for (const name of [
      "AUTH_SECRET",
      "FIELD_ENCRYPTION_KEY",
      "DATABASE_URL",
      "SMTP_PASSWORD",
      "S3_SECRET_KEY",
    ]) {
      expect(SECRET_ENV_NAMES).toContain(name);
    }
  });
});
