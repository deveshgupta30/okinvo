import "server-only";
import { decryptField, encryptField } from "@/lib/crypto";
import { fieldKey } from "@/lib/crypto/key";
import { prisma, type Tx } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_DISPLAY_CONFIG,
  mergeDisplayConfig,
  mergeTemplateConfig,
  type Address,
  type DisplayConfig,
  type TemplateConfig,
} from "@/lib/schemas";
import { type ProfileInput } from "@/lib/schemas/profile-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { InvariantError, NotFoundError } from "./errors";
import { requireRole } from "./authz";

const ASSET_INCLUDE = {
  logo: { select: { storageKey: true } },
  signature: { select: { storageKey: true } },
  stamp: { select: { storageKey: true } },
} satisfies Prisma.IssuerProfileInclude;

type Row = Prisma.IssuerProfileGetPayload<object>;
type RowWithAssets = Prisma.IssuerProfileGetPayload<{ include: typeof ASSET_INCLUDE }>;
const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export interface ProfileDto {
  id: string;
  type: "INDIVIDUAL" | "COMPANY";
  isDefault: boolean;
  label: string;
  legalName: string;
  tradeName: string | null;
  designation: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  address: Address;
  countryCode: string;
  stateCode: string | null;
  gstStateCode: string | null;
  panNumber: string | null;
  gstin: string | null;
  cinNumber: string | null;
  ukVatNumber: string | null;
  usTaxId: string | null;
  lutNumber: string | null;
  lutFiscalYear: string | null;
  baseCurrency: string;
  locale: string;
  fiscalYearStartMonth: number;
  invoiceNumberFormat: string;
  creditNoteNumberFormat: string;
  defaultTaxRegime: "INDIA_GST" | "UK_VAT" | "US_SALES_TAX" | "NONE";
  defaultTdsRate: string | null;
  defaultDisplayConfig: DisplayConfig;
  defaultNotes: string | null;
  defaultTerms: string | null;
  emailCc: string[];
  emailBcc: string[];
  emailInvoiceSubject: string | null;
  emailInvoiceBody: string | null;
  emailCreditNoteSubject: string | null;
  emailCreditNoteBody: string | null;
  templateConfigOverride: TemplateConfig | null;
  logoAssetId: string | null;
  signatureAssetId: string | null;
  stampAssetId: string | null;
  logoKey: string | null;
  signatureKey: string | null;
  stampKey: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const splitList = (s: string | null): string[] =>
  s
    ? s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

function toDto(row: RowWithAssets): ProfileDto {
  return {
    id: row.id,
    type: row.type,
    isDefault: row.isDefault,
    label: row.label,
    legalName: row.legalName,
    tradeName: row.tradeName,
    designation: row.designation,
    email: row.email,
    phone: row.phone,
    website: row.website,
    address: row.address as Address,
    countryCode: row.countryCode,
    stateCode: row.stateCode,
    gstStateCode: row.gstStateCode,
    panNumber: row.panNumber,
    gstin: row.gstin,
    cinNumber: row.cinNumber,
    ukVatNumber: row.ukVatNumber,
    usTaxId: row.usTaxIdEnc ? decryptField(row.usTaxIdEnc, fieldKey()) : null,
    lutNumber: row.lutNumber,
    lutFiscalYear: row.lutFiscalYear,
    baseCurrency: row.baseCurrency,
    locale: row.locale,
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    invoiceNumberFormat: row.invoiceNumberFormat,
    creditNoteNumberFormat: row.creditNoteNumberFormat,
    defaultTaxRegime: row.defaultTaxRegime,
    defaultTdsRate: row.defaultTdsRate?.toString() ?? null,
    defaultDisplayConfig: mergeDisplayConfig(row.defaultDisplayConfig),
    defaultNotes: row.defaultNotes,
    defaultTerms: row.defaultTerms,
    emailCc: splitList(row.emailCc),
    emailBcc: splitList(row.emailBcc),
    emailInvoiceSubject: row.emailInvoiceSubject,
    emailInvoiceBody: row.emailInvoiceBody,
    emailCreditNoteSubject: row.emailCreditNoteSubject,
    emailCreditNoteBody: row.emailCreditNoteBody,
    templateConfigOverride: row.templateConfigOverride
      ? mergeTemplateConfig(row.templateConfigOverride)
      : null,
    logoAssetId: row.logoAssetId,
    signatureAssetId: row.signatureAssetId,
    stampAssetId: row.stampAssetId,
    logoKey: row.logo?.storageKey ?? null,
    signatureKey: row.signature?.storageKey ?? null,
    stampKey: row.stamp?.storageKey ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toData(input: ProfileInput) {
  return {
    type: input.type,
    label: input.label,
    legalName: input.legalName,
    tradeName: input.tradeName ?? null,
    designation: input.designation ?? null,
    email: input.email,
    phone: input.phone ?? null,
    website: input.website ?? null,
    address: json(input.address),
    countryCode: input.countryCode,
    stateCode: input.stateCode ?? null,
    gstStateCode: input.gstStateCode ?? null,
    panNumber: input.panNumber ?? null,
    gstin: input.gstin ?? null,
    cinNumber: input.cinNumber ?? null,
    ukVatNumber: input.ukVatNumber ?? null,
    usTaxIdEnc: input.usTaxId ? encryptField(input.usTaxId, fieldKey()) : null,
    lutNumber: input.lutNumber ?? null,
    lutFiscalYear: input.lutFiscalYear ?? null,
    baseCurrency: input.baseCurrency,
    locale: input.locale,
    fiscalYearStartMonth: input.fiscalYearStartMonth,
    invoiceNumberFormat: input.invoiceNumberFormat,
    creditNoteNumberFormat: input.creditNoteNumberFormat,
    defaultTaxRegime: input.defaultTaxRegime,
    defaultTdsRate: input.defaultTdsRate ?? null,
    defaultDisplayConfig: json(input.defaultDisplayConfig ?? DEFAULT_DISPLAY_CONFIG),
    defaultNotes: input.defaultNotes ?? null,
    defaultTerms: input.defaultTerms ?? null,
    emailCc: input.emailCc.length ? input.emailCc.join(",") : null,
    emailBcc: input.emailBcc.length ? input.emailBcc.join(",") : null,
    emailInvoiceSubject: input.emailInvoiceSubject ?? null,
    emailInvoiceBody: input.emailInvoiceBody ?? null,
    emailCreditNoteSubject: input.emailCreditNoteSubject ?? null,
    emailCreditNoteBody: input.emailCreditNoteBody ?? null,
    templateConfigOverride: input.templateConfigOverride
      ? json(input.templateConfigOverride)
      : Prisma.DbNull,
    logoAssetId: input.logoAssetId ?? null,
    signatureAssetId: input.signatureAssetId ?? null,
    stampAssetId: input.stampAssetId ?? null,
  };
}

/** Audit view: the stored row minus noise; encrypted keys are redacted by audit() itself. */
function auditView(row: Row): Record<string, unknown> {
  const { createdAt: _c, updatedAt: _u, ...rest } = row;
  return rest as Record<string, unknown>;
}

async function load(tx: Tx, id: string): Promise<RowWithAssets> {
  const row = await tx.issuerProfile.findUnique({ where: { id }, include: ASSET_INCLUDE });
  if (!row) throw new NotFoundError("Issuer profile", id);
  return row;
}

export async function listProfiles(
  _actor: Actor,
  o: { includeArchived?: boolean } = {},
): Promise<ProfileDto[]> {
  const rows = await prisma.issuerProfile.findMany({
    where: o.includeArchived ? { archivedAt: {} } : {},
    include: ASSET_INCLUDE,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

export async function getProfile(_actor: Actor, id: string): Promise<ProfileDto> {
  return toDto(await load(prisma, id));
}

export async function getDefaultProfile(_actor: Actor): Promise<ProfileDto | null> {
  const row = await prisma.issuerProfile.findFirst({
    where: { isDefault: true },
    include: ASSET_INCLUDE,
  });
  return row ? toDto(row) : null;
}

export async function createProfile(actor: Actor, input: ProfileInput): Promise<ProfileDto> {
  requireRole(actor, "OWNER");
  return prisma.$transaction(async (tx) => {
    // "Exactly one non-archived profile is default at any time" (SPEC §4.2): the first profile, or
    // the first one created while no default exists, takes the role.
    const defaults = await tx.issuerProfile.count({ where: { isDefault: true } });
    const row = await tx.issuerProfile.create({
      data: { ...toData(input), isDefault: defaults === 0 },
      include: ASSET_INCLUDE,
    });
    await audit(tx, actor, "profile.created", "IssuerProfile", row.id, {
      summary: `Created profile ${row.label}`,
      after: auditView(row),
    });
    return toDto(row);
  });
}

export async function updateProfile(
  actor: Actor,
  id: string,
  input: ProfileInput,
): Promise<ProfileDto> {
  requireRole(actor, "OWNER");
  return prisma.$transaction(async (tx) => {
    const before = await load(tx, id);
    const row = await tx.issuerProfile.update({
      where: { id },
      data: toData(input),
      include: ASSET_INCLUDE,
    });
    const diff = diffForAudit(auditView(before), auditView(row));
    await audit(tx, actor, "profile.updated", "IssuerProfile", id, {
      summary: `Updated profile ${row.label}`,
      before: diff.before,
      after: diff.after,
    });
    return toDto(row);
  });
}

export async function setDefaultProfile(actor: Actor, id: string): Promise<void> {
  requireRole(actor, "OWNER");
  await prisma.$transaction(async (tx) => {
    const target = await load(tx, id);
    if (target.archivedAt) throw new InvariantError("An archived profile cannot be the default");
    await tx.issuerProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    await tx.issuerProfile.update({ where: { id }, data: { isDefault: true } });
    await audit(tx, actor, "profile.default_set", "IssuerProfile", id, {
      summary: `${target.label} is now the default profile`,
    });
  });
}

/** Archiving hides the profile from pickers; existing documents are unaffected (SPEC §4.2). */
export async function archiveProfile(actor: Actor, id: string): Promise<void> {
  requireRole(actor, "OWNER");
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.archivedAt) return;
    await tx.issuerProfile.update({
      where: { id },
      data: { archivedAt: new Date(), isDefault: false },
    });
    if (row.isDefault) {
      // Keep "exactly one non-archived default" true whenever another profile remains.
      const next = await tx.issuerProfile.findFirst({ orderBy: { createdAt: "asc" } });
      if (next)
        await tx.issuerProfile.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await audit(tx, actor, "profile.archived", "IssuerProfile", id, {
      summary: `Archived profile ${row.label}`,
    });
  });
}

export async function unarchiveProfile(actor: Actor, id: string): Promise<void> {
  requireRole(actor, "OWNER");
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (!row.archivedAt) return;
    const active = await tx.issuerProfile.count();
    await tx.issuerProfile.update({
      where: { id },
      data: { archivedAt: null, isDefault: active === 0 },
    });
    await audit(tx, actor, "profile.unarchived", "IssuerProfile", id, {
      summary: `Restored profile ${row.label}`,
    });
  });
}

/** Deletion is only possible while nothing references the profile (SPEC §4.2). */
export async function deleteProfile(actor: Actor, id: string): Promise<void> {
  requireRole(actor, "OWNER");
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    const invoices = await tx.invoice.count({ where: { issuerProfileId: id } });
    const creditNotes = await tx.creditNote.count({ where: { issuerProfileId: id } });
    if (invoices + creditNotes > 0) {
      throw new InvariantError(
        "This profile has invoices or credit notes; archive it instead of deleting.",
      );
    }
    await tx.documentSequence.deleteMany({ where: { issuerProfileId: id } });
    await tx.issuerProfile.delete({ where: { id } });
    if (row.isDefault) {
      const next = await tx.issuerProfile.findFirst({ orderBy: { createdAt: "asc" } });
      if (next)
        await tx.issuerProfile.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    await audit(tx, actor, "profile.deleted", "IssuerProfile", id, {
      summary: `Deleted profile ${row.label}`,
      before: auditView(row),
    });
  });
}
