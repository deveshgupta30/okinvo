import { describe, expect, it } from "vitest";
import { resolveSmtpConfigFrom, type SmtpEnv } from "@/lib/email/transport";

const envNone: SmtpEnv = {
  SMTP_HOST: undefined,
  SMTP_PORT: 587,
  SMTP_SECURITY: "starttls",
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_FROM: undefined,
  SMTP_FROM_NAME: undefined,
  SMTP_REPLY_TO: undefined,
};
const envFull: SmtpEnv = {
  ...envNone,
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "env-user",
  SMTP_PASSWORD: "env-pass",
  SMTP_FROM: "env@example.com",
  SMTP_FROM_NAME: "Env Sender",
};
const decrypt = (enc: string) => enc.replace("enc:", "");

describe("resolveSmtpConfigFrom", () => {
  it("prefers Settings → Email over the environment and decrypts the stored password", () => {
    const r = resolveSmtpConfigFrom(
      {
        host: "mail.settings.test",
        port: 465,
        security: "tls",
        user: "u",
        passwordEnc: "enc:secret",
        from: "me@settings.test",
        fromName: "Me",
        replyTo: "reply@settings.test",
      },
      envFull,
      decrypt,
    );
    expect(r).toEqual({
      source: "settings",
      host: "mail.settings.test",
      port: 465,
      security: "tls",
      user: "u",
      password: "secret",
      from: "me@settings.test",
      fromName: "Me",
      replyTo: "reply@settings.test",
    });
  });
  it("falls back to the environment when nothing is stored", () => {
    const r = resolveSmtpConfigFrom(null, envFull, decrypt);
    expect(r).toMatchObject({
      source: "env",
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      user: "env-user",
      password: "env-pass",
      from: "env@example.com",
      fromName: "Env Sender",
    });
    expect(r?.replyTo).toBeUndefined();
  });
  it("is null when neither is configured, and ignores an env without a host or from", () => {
    expect(resolveSmtpConfigFrom(null, envNone, decrypt)).toBeNull();
    expect(resolveSmtpConfigFrom(null, { ...envFull, SMTP_FROM: undefined }, decrypt)).toBeNull();
  });
  it("keeps a stored config without credentials (open relay on a LAN)", () => {
    const r = resolveSmtpConfigFrom(
      { host: "relay.lan", port: 25, security: "none", from: "a@b.c" },
      envFull,
      decrypt,
    );
    expect(r).toMatchObject({ source: "settings", host: "relay.lan", port: 25, security: "none" });
    expect(r?.user).toBeUndefined();
    expect(r?.password).toBeUndefined();
  });
});
