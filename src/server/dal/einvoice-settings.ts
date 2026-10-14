import "server-only";
import { decryptField, encryptField } from "@/lib/crypto";
import { fieldKey } from "@/lib/crypto/key";
import { prisma } from "@/lib/db";
import {
  EInvoiceSettingsSchema,
  NIC_BASE_URLS,
  type EInvoiceProfileSettings,
  type EInvoiceProfileSettingsInput,
  type EInvoiceSettings,
  type NicCredentials,
} from "@/lib/schemas/einvoice-settings";
import type { Actor } from "@/server/actor";
import { requireRole } from "./authz";
import { InvariantError } from "./errors";
import { getSetting, putSetting } from "./settings";

/** What the settings page shows for one profile: everything but the secrets, which read as "stored". */
export interface EInvoiceProfileSettingsView {
  profileId: string;
  india?: {
    connector: "manual" | "nic";
    nic?: {
      env: NicCredentials["env"];
      baseUrl: string;
      clientId: string;
      username: string;
      gstin: string;
      hasClientSecret: boolean;
      hasPassword: boolean;
      hasPublicKey: boolean;
    };
  };
  eu?: { profile: "EN16931" };
}

async function load(): Promise<EInvoiceSettings> {
  return (await getSetting(prisma, "einvoice", EInvoiceSettingsSchema)) ?? { profiles: {} };
}

function view(
  profileId: string,
  s: EInvoiceProfileSettings | undefined,
): EInvoiceProfileSettingsView {
  const out: EInvoiceProfileSettingsView = { profileId };
  if (s?.india) {
    out.india = { connector: s.india.connector };
    if (s.india.nic) {
      const n = s.india.nic;
      out.india.nic = {
        env: n.env,
        baseUrl: n.baseUrl,
        clientId: n.clientId,
        username: n.username,
        gstin: n.gstin,
        hasClientSecret: Boolean(n.clientSecretEnc),
        hasPassword: Boolean(n.passwordEnc),
        hasPublicKey: Boolean(n.publicKeyPem),
      };
    }
  }
  if (s?.eu) out.eu = { profile: s.eu.profile };
  return out;
}

/** The redacted settings of every profile (OWNER); profiles without settings read as empty. */
export async function getEInvoiceSettings(
  actor: Actor,
  profileIds: string[],
): Promise<EInvoiceProfileSettingsView[]> {
  requireRole(actor, "OWNER");
  const all = await load();
  return profileIds.map((id) => view(id, all.profiles[id]));
}

/**
 * Saves one profile's settings (OWNER, audited with the secrets redacted). Blank secrets keep
 * the stored ciphertext; a connector switched off drops its credentials.
 */
export async function saveEInvoiceProfileSettings(
  actor: Actor,
  input: EInvoiceProfileSettingsInput,
): Promise<EInvoiceProfileSettingsView> {
  requireRole(actor, "OWNER");
  const all = await load();
  const existing = all.profiles[input.profileId];
  const next: EInvoiceProfileSettings = {};
  if (input.indiaConnector === "manual") next.india = { connector: "manual" };
  if (input.indiaConnector === "nic") {
    const env = input.nicEnv ?? "sandbox";
    const prior = existing?.india?.nic;
    const key = fieldKey();
    const clientSecretEnc = input.nicClientSecret
      ? encryptField(input.nicClientSecret, key)
      : prior?.clientSecretEnc;
    const passwordEnc = input.nicPassword
      ? encryptField(input.nicPassword, key)
      : prior?.passwordEnc;
    const publicKeyPem = input.nicPublicKeyPem || prior?.publicKeyPem;
    if (!clientSecretEnc || !passwordEnc || !publicKeyPem) {
      throw new InvariantError(
        "The NIC client secret, password and the IRP public key are required the first time.",
      );
    }
    next.india = {
      connector: "nic",
      nic: {
        env,
        baseUrl: input.nicBaseUrl ?? NIC_BASE_URLS[env],
        clientId: input.nicClientId ?? "",
        clientSecretEnc,
        username: input.nicUsername ?? "",
        passwordEnc,
        gstin: input.nicGstin ?? "",
        publicKeyPem,
      },
    };
  }
  if (input.euProfile) next.eu = { profile: input.euProfile };
  const profiles = { ...all.profiles };
  if (Object.keys(next).length === 0) delete profiles[input.profileId];
  else profiles[input.profileId] = next;
  await prisma.$transaction((tx) =>
    putSetting(tx, actor, "einvoice", { profiles }, EInvoiceSettingsSchema),
  );
  return view(input.profileId, profiles[input.profileId]);
}

/** The NIC credentials of a profile in plaintext, for the connector only; null when unset. */
export async function resolveNicCredentials(profileId: string): Promise<
  | (Omit<NicCredentials, "clientSecretEnc" | "passwordEnc"> & {
      clientSecret: string;
      password: string;
    })
  | null
> {
  const all = await load();
  const nic = all.profiles[profileId]?.india?.nic;
  if (!nic) return null;
  const key = fieldKey();
  const { clientSecretEnc, passwordEnc, ...rest } = nic;
  return {
    ...rest,
    clientSecret: decryptField(clientSecretEnc, key),
    password: decryptField(passwordEnc, key),
  };
}

/** Which Indian connector a profile uses (no secrets); null when none is configured. */
export async function einvoiceConnectorFor(profileId: string): Promise<"manual" | "nic" | null> {
  const all = await load();
  return all.profiles[profileId]?.india?.connector ?? null;
}

/** The EU profile a document's CII/UBL output follows; null when e-invoicing is off for the profile. */
export async function euProfileFor(profileId: string): Promise<"EN16931" | null> {
  const all = await load();
  return all.profiles[profileId]?.eu?.profile ?? null;
}
