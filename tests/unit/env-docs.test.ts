import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  END,
  ENV_EXAMPLE,
  parseEnvExample,
  parseSchema,
  README,
  renderEnvDocs,
  SCHEMA,
  START,
} from "../../scripts/env-docs.mjs";

/** The README configuration table is generated from the env schema and must not go stale. */
describe("env-docs", () => {
  it("parses a schema object literal with docs, enums, defaults and optionals", () => {
    const src = `
const objectSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    TRUST_PROXY: z.stringbool().default(false),
    /** Build sha baked into the image. */
    BUILD_SHA: optional,
    PORT: z.coerce.number().int().positive().default(587), // the SMTP port
    KEY: base64Bytes(32),
  })
  .superRefine(() => {});
`;
    const entries = parseSchema(src);
    expect(entries.map((e) => e.key)).toEqual([
      "NODE_ENV",
      "APP_URL",
      "TRUST_PROXY",
      "BUILD_SHA",
      "PORT",
      "KEY",
    ]);
    expect(entries[0]).toMatchObject({
      type: "development \\| test \\| production",
      default: "development",
      required: false,
    });
    expect(entries[1]).toMatchObject({ type: "URL", required: true });
    expect(entries[2]).toMatchObject({ type: "true \\| false", default: "false" });
    expect(entries[3]).toMatchObject({ required: false, doc: "Build sha baked into the image." });
    expect(entries[4]).toMatchObject({ type: "number", default: "587", doc: "the SMTP port" });
    expect(entries[5]).toMatchObject({ type: "base64 (32 bytes)", required: true });
  });

  it("reads comments from .env.example, including commented-out keys", () => {
    const ex = parseEnvExample('A=1   # first\nB="two words"\n# C=   # off by default\n');
    expect(ex.A).toEqual({ value: "1", comment: "first" });
    expect(ex.B).toEqual({ value: "two words", comment: "" });
    expect(ex.C).toEqual({ value: "", comment: "off by default" });
  });

  it("every key in the real schema appears in the committed README table", () => {
    const schema = readFileSync(SCHEMA, "utf8");
    const readme = readFileSync(README, "utf8");
    const table = readme.slice(readme.indexOf(START), readme.indexOf(END));
    const keys = parseSchema(schema).map((e) => e.key);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(table, k).toContain(`| \`${k}\` |`);
    const rendered = renderEnvDocs(schema, readFileSync(ENV_EXAMPLE, "utf8"));
    expect(table + END).toBe(rendered);
  });
});
