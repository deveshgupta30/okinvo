import { DateStringSchema, type DateString } from "@/lib/dates";
import type { RenderInput } from "@/lib/documents/view-model";
import { D, toMoneyString } from "@/lib/money";
import { fiscalYearOf } from "@/lib/numbering";
import {
  CurrencySchema,
  type ClientSnapshot,
  type DisplayConfig,
  type IssuerSnapshot,
  type PaymentMethodsSnapshot,
} from "@/lib/schemas";
import type { UnitType } from "@/lib/schemas/service-input";
import type { TaxRegime } from "@/lib/tax";
import type { ClientDto } from "@/server/dal/clients";
import type { PaymentMethodDto } from "@/server/dal/payment-methods";
import type { ProfileDto } from "@/server/dal/profiles";
import { computeInvoice, placeOfSupplyFor } from "./compute";
import { buildSnapshots } from "./snapshots";

/** The builder's form state, all strings (what the inputs hold), before Zod sees it. */
export interface BuilderItem {
  description: string;
  sacHsnCode: string;
  unitType: UnitType;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  taxExempt?: boolean;
  serviceItemId?: string;
}

export interface BuilderValues {
  issuerProfileId: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  taxRegime: TaxRegime;
  isReverseCharge: boolean;
  fxRateToBase: string;
  items: BuilderItem[];
  discountType: "" | "AMOUNT" | "PERCENT";
  discountValue: string;
  roundingAdjustment: string;
  tdsRate: string;
  paymentMethodIds: string[];
  displayConfig: DisplayConfig;
  poReference: string;
  notes: string;
  terms: string;
}

export interface PreviewContext {
  profile: ProfileDto | null;
  client: ClientDto | null;
  methods: PaymentMethodDto[];
}

export interface PreviewTotals {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  roundingAdjustment: string;
  total: string;
  tdsExpected: string;
  netExpected: string;
}

export interface PreviewResult {
  input: RenderInput;
  totals: PreviewTotals;
  warnings: string[];
}

const DEC_RE = /^-?\d+(\.\d+)?$/;

function num(raw: string, label: string, warnings: string[], fallback = "0"): string {
  const v = raw.replace(/[,\s]/g, "");
  if (v === "") return fallback;
  if (!DEC_RE.test(v)) {
    warnings.push(`${label} is not a number.`);
    return fallback;
  }
  return v;
}

const isBlankRow = (i: BuilderItem) =>
  !i.description.trim() && !i.quantity.trim() && !i.unitPrice.trim();

/**
 * Runs the same computation the server will run on save, tolerating half-typed input: blank rows
 * are skipped and unparseable numbers count as zero with a warning, so the preview never crashes
 * mid-keystroke (plan R5).
 */
export function previewFromBuilder(values: BuilderValues, ctx: PreviewContext): PreviewResult {
  const warnings: string[] = [];
  const { profile, client } = ctx;
  if (!profile) warnings.push("Choose an issuer profile.");
  if (!client) warnings.push("Choose a client.");

  const currencyParsed = CurrencySchema.safeParse(
    values.currency || client?.currency || profile?.baseCurrency || "INR",
  );
  const currency = currencyParsed.success ? currencyParsed.data : "INR";
  if (!currencyParsed.success) warnings.push("Currency is not supported.");

  const issueDate: DateString = DateStringSchema.safeParse(values.issueDate).success
    ? values.issueDate
    : "";
  if (!issueDate) warnings.push("Issue date is incomplete.");
  const fiscalYear =
    issueDate && profile ? fiscalYearOf(issueDate, profile.fiscalYearStartMonth) : "";

  const rows = values.items
    .map((item, idx) => ({ item, position: idx + 1 }))
    .filter(({ item }) => !isBlankRow(item));
  const items = rows.map(({ item, position }) => ({
    position,
    quantity: num(item.quantity, `Line ${position} quantity`, warnings),
    unitPrice: num(item.unitPrice, `Line ${position} rate`, warnings),
    taxRate: num(item.taxRate, `Line ${position} tax rate`, warnings),
    taxExempt: item.taxExempt ?? false,
  }));
  const discountValue =
    values.discountType && values.discountValue.trim()
      ? num(values.discountValue, "Discount", warnings)
      : null;
  const roundingAdjustment = values.roundingAdjustment.trim()
    ? num(values.roundingAdjustment, "Rounding adjustment", warnings)
    : null;
  const tdsRate = num(values.tdsRate, "TDS rate", warnings);

  const issuerTax = {
    countryCode: profile?.countryCode ?? "",
    gstStateCode: profile?.gstStateCode ?? null,
    gstin: profile?.gstin ?? null,
    lutNumber: profile?.lutNumber ?? null,
    lutFiscalYear: profile?.lutFiscalYear ?? null,
    ukVatNumber: profile?.ukVatNumber ?? null,
  };
  const clientTax = {
    countryCode: client?.countryCode ?? "",
    gstStateCode: client?.gstStateCode ?? null,
  };

  let computed;
  try {
    computed = computeInvoice(
      {
        currency,
        items,
        discount:
          values.discountType && discountValue !== null
            ? { type: values.discountType, value: discountValue }
            : null,
        roundingAdjustment,
        tdsRate,
        taxRegime: values.taxRegime,
        isReverseCharge: values.isReverseCharge,
        fiscalYear,
      },
      issuerTax,
      clientTax,
    );
  } catch (e) {
    warnings.push((e as Error).message);
    computed = computeInvoice(
      {
        currency,
        items: [],
        discount: null,
        roundingAdjustment: null,
        tdsRate: "0",
        taxRegime: values.taxRegime,
        isReverseCharge: false,
        fiscalYear,
      },
      issuerTax,
      clientTax,
    );
  }
  const t = computed.totals;
  const m = (v: Parameters<typeof toMoneyString>[0]) => toMoneyString(v, currency);

  // Snapshots exactly as issue would build them; placeholders while parties are missing.
  const display = values.displayConfig;
  let issuer: IssuerSnapshot = {
    type: "INDIVIDUAL",
    legalName: "",
    addressLines: [],
    countryCode: "IN",
    locale: profile?.locale ?? "en-IN",
    baseCurrency: profile?.baseCurrency ?? currency,
  };
  let clientSnap: ClientSnapshot = {
    displayName: "",
    billingAddressLines: [],
    countryCode: "IN",
    paymentTermsDays: client?.paymentTermsDays ?? 0,
  };
  let paymentMethods: PaymentMethodsSnapshot = [];
  const chosen = values.paymentMethodIds
    .map((id) => ctx.methods.find((x) => x.id === id))
    .filter((x): x is PaymentMethodDto => Boolean(x));
  if (profile && client) {
    try {
      const snap = buildSnapshots({
        issuer: profile,
        client,
        methods: chosen.map((x) => ({
          name: x.name,
          type: x.type,
          instructions: x.instructions,
          lines: x.lines ?? [],
        })),
        display,
        lutApplies: computed.tax.supplyType === "EXPORT_LUT",
      });
      issuer = snap.issuer;
      clientSnap = snap.client;
      paymentMethods = snap.paymentMethods;
    } catch (e) {
      warnings.push(`Preview could not build the parties: ${(e as Error).message}`);
    }
  }

  const input: RenderInput = {
    kind: "INVOICE",
    status: "DRAFT",
    number: null,
    issueDate: issueDate || "2000-01-01",
    dueDate: DateStringSchema.safeParse(values.dueDate).success ? values.dueDate : null,
    currency,
    locale: profile?.locale ?? "en-IN",
    issuer,
    client: clientSnap,
    paymentMethods,
    taxRegime: values.taxRegime,
    supplyType: computed.tax.supplyType,
    placeOfSupply: client ? placeOfSupplyFor(values.taxRegime, clientTax) : null,
    isReverseCharge: values.isReverseCharge,
    lutNumber: computed.tax.supplyType === "EXPORT_LUT" ? (profile?.lutNumber ?? null) : null,
    items: rows.map(({ item, position }) => {
      const line = t.items.find((l) => l.position === position);
      const src = items.find((i) => i.position === position);
      return {
        position,
        serviceItemId: item.serviceItemId ?? null,
        description: item.description,
        sacHsnCode: item.sacHsnCode.trim() || null,
        unitType: item.unitType,
        quantity: D(src?.quantity ?? "0").toFixed(3),
        unitPrice: m(src?.unitPrice ?? "0"),
        lineSubtotal: m(line?.lineSubtotal ?? "0"),
        taxRate: src?.taxRate ?? "0",
        taxExempt: src?.taxExempt ?? false,
        taxAmount: m(line?.taxAmount ?? "0"),
        lineTotal: m(line?.lineTotal ?? "0"),
      };
    }),
    taxLines: computed.tax.taxLines.map((l) => ({
      taxType: l.taxType,
      rate: l.rate.toString(),
      taxableAmount: m(l.taxableAmount),
      taxAmount: m(l.taxAmount),
    })),
    subtotal: m(t.subtotal),
    discountType: values.discountType || null,
    discountValue: discountValue !== null ? m(discountValue) : null,
    discountAmount: m(t.discountAmount),
    taxableAmount: m(t.taxableAmount),
    taxAmount: m(t.taxAmount),
    roundingAdjustment: m(t.roundingAdjustment),
    total: m(t.total),
    tdsRate,
    tdsExpected: m(t.tdsExpected),
    poReference: values.poReference.trim() || null,
    notes: values.notes.trim() || null,
    terms: values.terms.trim() || null,
    displayConfig: display,
    replaces: null,
    verificationToken: "preview",
  };

  return {
    input,
    totals: {
      subtotal: m(t.subtotal),
      discountAmount: m(t.discountAmount),
      taxableAmount: m(t.taxableAmount),
      taxAmount: m(t.taxAmount),
      roundingAdjustment: m(t.roundingAdjustment),
      total: m(t.total),
      tdsExpected: m(t.tdsExpected),
      netExpected: m(t.netExpected),
    },
    warnings,
  };
}
