import "server-only";
import { addDays, todayIn } from "@/lib/dates";
import { prisma } from "@/lib/db";
import type { BuilderProfile, BuilderValues } from "@/lib/invoices/client-preview";
import type { TemplateConfig } from "@/lib/schemas";
import type { Actor } from "@/server/actor";
import { listClients, type ClientDto } from "./clients";
import { getInvoice, type InvoiceDto } from "./invoices";
import { listPaymentMethods, type PaymentMethodDto } from "./payment-methods";
import { listProfiles, type ProfileDto } from "./profiles";
import { listServices, type ServiceDto } from "./services";
import { resolveTemplateConfig } from "./templates";

export type { BuilderProfile } from "@/lib/invoices/client-preview";

/** Projects a profile onto what the browser may see (see `BuilderProfile`). */
export function toBuilderProfile(p: ProfileDto): BuilderProfile {
  const {
    usTaxId: _usTaxId,
    emailCc: _emailCc,
    emailBcc: _emailBcc,
    emailInvoiceSubject: _emailInvoiceSubject,
    emailInvoiceBody: _emailInvoiceBody,
    emailCreditNoteSubject: _emailCreditNoteSubject,
    emailCreditNoteBody: _emailCreditNoteBody,
    templateConfigOverride: _templateConfigOverride,
    invoiceNumberFormat: _invoiceNumberFormat,
    creditNoteNumberFormat: _creditNoteNumberFormat,
    logoKey: _logoKey,
    signatureKey: _signatureKey,
    stampKey: _stampKey,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = p;
  return { ...rest, hasGstin: p.gstin !== null && p.gstin !== "" };
}

/** Everything the builder needs in one serialisable object. */
export interface BuilderContext {
  profiles: BuilderProfile[];
  clients: ClientDto[];
  services: ServiceDto[];
  methods: PaymentMethodDto[];
  templateConfigs: Record<string, TemplateConfig>;
  initial: BuilderValues;
  today: string;
}

export function valuesFromInvoice(inv: InvoiceDto): BuilderValues {
  return {
    issuerProfileId: inv.issuerProfileId,
    clientId: inv.clientId,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    taxRegime: inv.taxRegime,
    isReverseCharge: inv.isReverseCharge,
    fxRateToBase: inv.fxRateToBase,
    items: inv.items.map((i) => ({
      description: i.description,
      sacHsnCode: i.sacHsnCode ?? "",
      unitType: i.unitType,
      quantity: i.quantity.replace(/\.?0+$/, ""),
      unitPrice: i.unitPrice,
      taxRate: i.taxRate,
      taxExempt: i.taxExempt,
      ...(i.serviceItemId ? { serviceItemId: i.serviceItemId } : {}),
    })),
    discountType: inv.discountType ?? "",
    discountValue: inv.discountValue ?? "",
    roundingAdjustment:
      inv.roundingAdjustment === "0.00" || inv.roundingAdjustment === "0"
        ? ""
        : inv.roundingAdjustment,
    tdsRate: inv.tdsRate,
    paymentMethodIds: inv.paymentMethodIds,
    displayConfig: inv.displayConfig,
    poReference: inv.poReference ?? "",
    notes: inv.notes ?? "",
    terms: inv.terms ?? "",
  };
}

export async function builderContext(
  actor: Actor,
  o: { invoiceId?: string | null; clientId?: string | null; issuerProfileId?: string | null },
): Promise<BuilderContext> {
  const [fullProfiles, clients, services, methods] = await Promise.all([
    listProfiles(actor),
    listClients(actor),
    listServices(actor, { activeOnly: true }),
    listPaymentMethods(actor, { activeOnly: true, decrypt: true }),
  ]);
  const profiles = fullProfiles.map(toBuilderProfile);
  const today = todayIn(actor.timezone);
  const templateConfigs: Record<string, TemplateConfig> = {};
  for (const p of profiles) templateConfigs[p.id] = await resolveTemplateConfig(prisma, p.id);

  let initial: BuilderValues;
  if (o.invoiceId) {
    const inv = await getInvoice(actor, o.invoiceId);
    initial = valuesFromInvoice(inv);
    // An archived party still edits; make sure its row is present for the pickers.
    if (!profiles.some((p) => p.id === inv.issuerProfileId)) {
      const { getProfile } = await import("./profiles");
      profiles.push(toBuilderProfile(await getProfile(actor, inv.issuerProfileId)));
    }
    if (!clients.some((c) => c.id === inv.clientId)) {
      const { getClient } = await import("./clients");
      clients.push(await getClient(actor, inv.clientId));
    }
    if (!templateConfigs[inv.issuerProfileId]) {
      templateConfigs[inv.issuerProfileId] = await resolveTemplateConfig(
        prisma,
        inv.issuerProfileId,
      );
    }
  } else {
    const profile =
      profiles.find((p) => p.id === o.issuerProfileId) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0] ??
      null;
    const client = clients.find((c) => c.id === o.clientId) ?? null;
    const terms = client?.paymentTermsDays ?? 30;
    initial = {
      issuerProfileId: profile?.id ?? "",
      clientId: client?.id ?? "",
      issueDate: today,
      dueDate: addDays(today, terms),
      currency: client?.currency ?? profile?.baseCurrency ?? "INR",
      taxRegime: profile?.defaultTaxRegime ?? "INDIA_GST",
      isReverseCharge: false,
      fxRateToBase: "1",
      items: [],
      discountType: "",
      discountValue: "",
      roundingAdjustment: "",
      tdsRate: client?.defaultTdsRate ?? profile?.defaultTdsRate ?? "0",
      paymentMethodIds: methods.filter((m) => m.isDefault).map((m) => m.id),
      displayConfig:
        profile?.defaultDisplayConfig ?? (await import("@/lib/schemas")).DEFAULT_DISPLAY_CONFIG,
      poReference: "",
      notes: profile?.defaultNotes ?? "",
      terms: profile?.defaultTerms ?? "",
    };
  }
  return { profiles, clients, services, methods, templateConfigs, initial, today };
}
