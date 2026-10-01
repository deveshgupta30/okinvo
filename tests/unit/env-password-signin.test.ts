import { describe, expect, it } from "vitest";
import { serverSchema } from "@/lib/env.schema";

const base = {
  APP_URL: "https://invoices.example.com",
  DATABASE_URL: "postgresql://okinvo:okinvo@127.0.0.1:5432/okinvo",
  AUTH_SECRET: "x".repeat(48),
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

describe("AUTH_PASSWORD_SIGNIN", () => {
  it("is off unless explicitly enabled", () => {
    expect(serverSchema.parse(base).AUTH_PASSWORD_SIGNIN).toBe(false);
    expect(serverSchema.parse({ ...base, AUTH_PASSWORD_SIGNIN: "" }).AUTH_PASSWORD_SIGNIN).toBe(
      false,
    );
    expect(serverSchema.parse({ ...base, AUTH_PASSWORD_SIGNIN: "true" }).AUTH_PASSWORD_SIGNIN).toBe(
      true,
    );
  });
  it("counts as a configured sign-in method in production", () => {
    const r = serverSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      AUTH_ALLOWED_EMAILS: "me@example.com",
      AUTH_PASSWORD_SIGNIN: "true",
    });
    expect(r.success).toBe(true);
  });
});
