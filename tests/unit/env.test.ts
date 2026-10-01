import { describe, expect, it } from "vitest";
import { serverSchema } from "@/lib/env.schema";

const KEY32 = Buffer.alloc(32, 7).toString("base64");
const base = {
  APP_URL: "https://invoices.example.com",
  DATABASE_URL: "postgresql://okinvo:okinvo@127.0.0.1:5432/okinvo",
  AUTH_SECRET: "x".repeat(48),
  FIELD_ENCRYPTION_KEY: KEY32,
};

const issuePaths = (input: Record<string, unknown>) => {
  const r = serverSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("serverSchema", () => {
  it("parses a minimal development env with defaults", () => {
    const env = serverSchema.parse(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.STORAGE_LOCAL_ROOT).toBe("./.data/storage");
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.SMTP_PORT).toBe(587);
  });
  it("treats empty strings as unset, as dotenv `KEY=` lines produce them", () => {
    const env = serverSchema.parse({
      ...base,
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      LOG_LEVEL: "",
      SMTP_PORT: "",
      TRUST_PROXY: "",
    });
    expect(env.AUTH_GOOGLE_ID).toBeUndefined();
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.SMTP_PORT).toBe(587);
    expect(env.TRUST_PROXY).toBe(false);
  });
  it("coerces TRUST_PROXY and UPLOAD limits from strings", () => {
    const env = serverSchema.parse({ ...base, TRUST_PROXY: "true", UPLOAD_MAX_IMAGE_MB: "5" });
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.UPLOAD_MAX_IMAGE_MB).toBe(5);
  });
  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => serverSchema.parse({ ...base, DATABASE_URL: "mysql://x" })).toThrow(/postgres/);
  });
  it("rejects the .env.example placeholder secret so an unedited example cannot boot", () => {
    expect(
      issuePaths({ ...base, AUTH_SECRET: "replace-me-with-at-least-32-random-characters" }),
    ).toContain("AUTH_SECRET");
  });
  it("rejects a FIELD_ENCRYPTION_KEY that is not 32 bytes", () => {
    expect(() => serverSchema.parse({ ...base, FIELD_ENCRYPTION_KEY: "short" })).toThrow(
      /32 random bytes/,
    );
  });
  it("exposes the parsed allow-list so callers never re-parse it", () => {
    const env = serverSchema.parse({ ...base, AUTH_ALLOWED_EMAILS: " Me@Example.com, *@Corp.io" });
    expect(env.allowList.emails.has("me@example.com")).toBe(true);
    expect(env.allowList.domains.has("corp.io")).toBe(true);
  });
  it("rejects a malformed allow-list in every environment, not only production", () => {
    expect(issuePaths({ ...base, AUTH_ALLOWED_EMAILS: "*" })).toContain("AUTH_ALLOWED_EMAILS");
    expect(issuePaths({ ...base, AUTH_ALLOWED_EMAILS: "not-an-email" })).toContain(
      "AUTH_ALLOWED_EMAILS",
    );
  });
  it("requires an allow-list and at least one provider in production", () => {
    const paths = issuePaths({ ...base, NODE_ENV: "production" });
    expect(paths).toContain("AUTH_ALLOWED_EMAILS");
    expect(paths).toContain("AUTH_GOOGLE_ID");
  });
  it("reports the missing provider even when the allow-list itself is malformed", () => {
    const paths = issuePaths({ ...base, NODE_ENV: "production", AUTH_ALLOWED_EMAILS: "*" });
    expect(paths).toContain("AUTH_ALLOWED_EMAILS");
    expect(paths).toContain("AUTH_GOOGLE_ID");
  });
  it("accepts production with an allow-list and one provider", () => {
    const env = serverSchema.parse({
      ...base,
      NODE_ENV: "production",
      AUTH_ALLOWED_EMAILS: "me@example.com",
      AUTH_GITHUB_ID: "id",
      AUTH_GITHUB_SECRET: "secret",
    });
    expect(env.NODE_ENV).toBe("production");
  });
  it("requires S3 settings when STORAGE_DRIVER=s3", () => {
    expect(issuePaths({ ...base, STORAGE_DRIVER: "s3" })).toContain("S3_ACCESS_KEY");
  });
});
