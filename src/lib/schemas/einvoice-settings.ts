import { z } from "zod";
import { fOptional } from "@/lib/forms";
import { EINVOICE_CONNECTORS } from "./einvoice-state";
import { GSTIN_RE } from "./profile-input";

/**
 * `AppSetting['einvoice']` (spec §9e): per issuer profile, which connector registers Indian
 * e-invoices and which EU profile the CII/UBL outputs follow. NIC GSP credentials are stored
 * only as the ciphertext `src/lib/crypto` produces (`*Enc`); this module never sees a plaintext
 * secret. Browser-safe.
 */
export const NIC_ENVS = ["sandbox", "production"] as const;
export type NicEnv = (typeof NIC_ENVS)[number];

/** The NIC IRP API base URLs per environment (e-invoice API v1.03). */
export const NIC_BASE_URLS: Record<NicEnv, string> = {
  sandbox: "https://einv-apisandbox.nic.in",
  production: "https://einvoice1.gst.gov.in",
};

export const EU_PROFILES = ["EN16931"] as const;

const ciphertext = z.string().min(1).max(4000);

export const NicCredentialsSchema = z
  .object({
    env: z.enum(NIC_ENVS),
    baseUrl: z.url(),
    clientId: z.string().trim().min(1).max(200),
    clientSecretEnc: ciphertext,
    username: z.string().trim().min(1).max(200),
    passwordEnc: ciphertext,
    gstin: z.string().regex(GSTIN_RE, "not a valid GSTIN"),
  })
  .strict();
export type NicCredentials = z.infer<typeof NicCredentialsSchema>;

export const EInvoiceProfileSettingsSchema = z
  .object({
    india: z
      .object({
        connector: z.enum(EINVOICE_CONNECTORS),
        nic: NicCredentialsSchema.optional(),
      })
      .strict()
      .superRefine((v, ctx) => {
        if (v.connector === "nic" && !v.nic)
          ctx.addIssue({ code: "custom", path: ["nic"], message: "NIC credentials required" });
      })
      .optional(),
    eu: z
      .object({ profile: z.enum(EU_PROFILES) })
      .strict()
      .optional(),
  })
  .strict();
export type EInvoiceProfileSettings = z.infer<typeof EInvoiceProfileSettingsSchema>;

export const EInvoiceSettingsSchema = z.object({
  /** Keyed by issuer profile id. */
  profiles: z.record(z.string(), EInvoiceProfileSettingsSchema).default({}),
});
export type EInvoiceSettings = z.infer<typeof EInvoiceSettingsSchema>;

/**
 * Settings → E-invoicing form, one profile at a time. Blank secrets keep what is stored; the
 * DAL encrypts the new ones. The NIC base URL follows the environment unless overridden.
 */
export const EInvoiceProfileSettingsInputSchema = z
  .object({
    profileId: z.string().min(1, "choose a profile"),
    indiaConnector: fOptional(z.enum(EINVOICE_CONNECTORS)),
    nicEnv: fOptional(z.enum(NIC_ENVS)),
    nicBaseUrl: fOptional(z.url("must be a URL")),
    nicClientId: fOptional(z.string().trim().max(200)),
    nicClientSecret: fOptional(z.string().max(500)),
    nicUsername: fOptional(z.string().trim().max(200)),
    nicPassword: fOptional(z.string().max(500)),
    nicGstin: fOptional(z.string().trim().toUpperCase().regex(GSTIN_RE, "not a valid GSTIN")),
    euProfile: fOptional(z.enum(EU_PROFILES)),
  })
  .superRefine((v, ctx) => {
    if (v.indiaConnector !== "nic") return;
    for (const key of ["nicEnv", "nicClientId", "nicUsername", "nicGstin"] as const) {
      if (!v[key]) ctx.addIssue({ code: "custom", path: [key], message: "required for NIC" });
    }
  });
export type EInvoiceProfileSettingsInput = z.infer<typeof EInvoiceProfileSettingsInputSchema>;
