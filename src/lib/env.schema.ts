import { z } from "zod";
import { parseAllowedEmails, type AllowList } from "@/server/allow-list";

const optional = z.string().trim().min(1).optional();

const base64Bytes = (bytes: number) =>
  z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, "base64").length === bytes;
      } catch {
        return false;
      }
    },
    { message: `must be ${bytes} random bytes, base64-encoded (scripts/gen-secrets.sh)` },
  );

/** dotenv `KEY=` lines arrive as "" — treat them as unset so optionals and defaults apply. */
const stripEmpty = (input: unknown): unknown => {
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      ([, v]) => !(typeof v === "string" && v.trim() === ""),
    ),
  );
};

const objectSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
    TRUST_PROXY: z.stringbool().default(false),

    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "must be a postgres:// or postgresql:// URL"),

    AUTH_SECRET: z
      .string()
      .min(32, "at least 32 characters")
      .refine((v) => !v.startsWith("replace-me"), {
        message: "still the .env.example placeholder — run scripts/gen-secrets.sh",
      }),
    AUTH_ALLOWED_EMAILS: z.string().default(""),
    AUTH_PASSWORD_SIGNIN: z.stringbool().default(false), // email+password (allow-list still applies); e2e/CI and IdP-less owners
    AUTH_LINKING_TRUSTED_PROVIDERS: z.string().default("google,github"),
    AUTH_GOOGLE_ID: optional,
    AUTH_GOOGLE_SECRET: optional,
    AUTH_GITHUB_ID: optional,
    AUTH_GITHUB_SECRET: optional,
    AUTH_KEYCLOAK_ISSUER: optional,
    AUTH_KEYCLOAK_ID: optional,
    AUTH_KEYCLOAK_SECRET: optional,
    AUTH_CASDOOR_ISSUER: optional,
    AUTH_CASDOOR_ID: optional,
    AUTH_CASDOOR_SECRET: optional,
    AUTH_OIDC_ISSUER: optional,
    AUTH_OIDC_ID: optional,
    AUTH_OIDC_SECRET: optional,
    AUTH_OIDC_NAME: z.string().default("Enterprise SSO"),

    FIELD_ENCRYPTION_KEY: base64Bytes(32),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_ROOT: z.string().default("./.data/storage"),
    S3_ENDPOINT: optional,
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().default("okinvo"),
    S3_ACCESS_KEY: optional,
    S3_SECRET_KEY: optional,

    /** `last-backup.json` written by the backup service; Settings → Data shows it when present. */
    BACKUP_STATUS_FILE: optional,

    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURITY: z.enum(["starttls", "tls", "none"]).default("starttls"),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    SMTP_FROM: optional,
    SMTP_FROM_NAME: optional,
    SMTP_REPLY_TO: optional,

    RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).default("memory"),
    /** Build provenance baked into the image (docker/Dockerfile ARG → ENV); shown on Settings → Status. */
    OKINVO_BUILD_SHA: optional,
    OKINVO_BUILD_DATE: optional,
    UPLOAD_MAX_IMAGE_MB: z.coerce.number().positive().default(2),
    UPLOAD_MAX_RECEIPT_MB: z.coerce.number().positive().default(10),
  })
  .superRefine((v, ctx) => {
    // A malformed allow-list is a configuration error in every environment; only its
    // emptiness is production-specific.
    let list: AllowList | undefined;
    try {
      list = parseAllowedEmails(v.AUTH_ALLOWED_EMAILS);
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_ALLOWED_EMAILS"],
        message: (e as Error).message,
      });
    }
    if (v.NODE_ENV === "production") {
      if (list && list.emails.size + list.domains.size === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_ALLOWED_EMAILS"],
          message: "required in production: nobody could sign in",
        });
      }
      const anyProvider =
        v.AUTH_PASSWORD_SIGNIN ||
        (v.AUTH_GOOGLE_ID && v.AUTH_GOOGLE_SECRET) ||
        (v.AUTH_GITHUB_ID && v.AUTH_GITHUB_SECRET) ||
        (v.AUTH_KEYCLOAK_ISSUER && v.AUTH_KEYCLOAK_ID && v.AUTH_KEYCLOAK_SECRET) ||
        (v.AUTH_CASDOOR_ISSUER && v.AUTH_CASDOOR_ID && v.AUTH_CASDOOR_SECRET) ||
        (v.AUTH_OIDC_ISSUER && v.AUTH_OIDC_ID && v.AUTH_OIDC_SECRET);
      if (!anyProvider) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_GOOGLE_ID"],
          message:
            "configure at least one sign-in method (Google, GitHub, Keycloak, Casdoor, OIDC or AUTH_PASSWORD_SIGNIN=true)",
        });
      }
    }
    if (v.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const) {
        if (!v[key]) {
          ctx.addIssue({ code: "custom", path: [key], message: "required when STORAGE_DRIVER=s3" });
        }
      }
    }
  })
  // Runs only when every check above passed, so parseAllowedEmails cannot throw here.
  .transform((v) => ({ ...v, allowList: parseAllowedEmails(v.AUTH_ALLOWED_EMAILS) }));

export const serverSchema = z.preprocess(stripEmpty, objectSchema);

export type ServerEnv = z.infer<typeof objectSchema>;
