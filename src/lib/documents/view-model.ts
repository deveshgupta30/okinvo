import type { DateString } from "@/lib/dates";
import {
  amountInWords,
  formatAmount,
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
} from "@/lib/format";
import { D } from "@/lib/money";
import {
  resolveLabels,
  type ClientSnapshot,
  type DisplayConfig,
  type IssuerSnapshot,
  type LabelKey,
  type PaymentMethodsSnapshot,
  type TemplateConfig,
} from "@/lib/schemas";
import { UNIT_LABELS, type UnitType } from "@/lib/schemas/service-input";
import { SUPPLY_STATEMENTS, type SupplyType, type TaxRegime, type TaxType } from "@/lib/tax";

/**
 * Everything the renderers need, already formatted for the document's locale. The HTML live
 * preview and the PDF both consume this object, so what you see is what prints (v2 §12.1).
 */
export interface RenderItem {
  id?: string;
  serviceItemId?: string | null;
  position: number;
  description: string;
  sacHsnCode: string | null;
  unitType: UnitType;
  quantity: string;
  unitPrice: string;
  lineSubtotal: string;
  taxRate: string;
  taxExempt?: boolean | undefined;
  taxAmount: string;
  lineTotal: string;
}

export interface RenderTaxLine {
  taxType: TaxType;
  rate: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface RenderInput {
  kind: "INVOICE" | "CREDIT_NOTE";
  status: "DRAFT" | "ISSUED" | "VOID";
  number: string | null;
  issueDate: DateString;
  dueDate?: DateString | null;
  currency: string;
  locale: string;
  issuer: IssuerSnapshot;
  client: ClientSnapshot;
  paymentMethods: PaymentMethodsSnapshot;
  taxRegime: TaxRegime;
  supplyType: SupplyType;
  placeOfSupply: string | null;
  isReverseCharge: boolean;
  lutNumber: string | null;
  items: RenderItem[];
  taxLines: RenderTaxLine[];
  subtotal: string;
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: string | null;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  roundingAdjustment: string;
  total: string;
  tdsRate: string;
  tdsExpected: string;
  poReference: string | null;
  notes: string | null;
  terms: string | null;
  displayConfig: DisplayConfig;
  replaces?: { number: string | null } | null;
  verificationToken: string;
  creditNote?: { reason: string; againstNumber: string; againstDate: DateString } | undefined;
}

export interface TotalsRow {
  key: string;
  label: string;
  value: string;
  emphasis?: boolean;
}

export interface ViewModelItem {
  position: number;
  description: string;
  sacHsnCode?: string;
  qty: string;
  unit: string;
  rate: string;
  taxRate: string;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
}

export interface DocumentViewModel {
  kind: "INVOICE" | "CREDIT_NOTE";
  isDraft: boolean;
  isVoid: boolean;
  title: string;
  number: string | null;
  watermark?: string;
  issueDate: string;
  dueDate?: string;
  paymentTerms?: string;
  currency: string;
  locale: string;
  labels: Record<LabelKey, string>;
  issuer: IssuerSnapshot & { logoUrl?: string; signatureUrl?: string; stampUrl?: string };
  client: ClientSnapshot;
  placeOfSupply?: string;
  supplyStatement?: string;
  replaces?: string;
  poReference?: string;
  columns: { sac: boolean; qty: boolean; rate: boolean; tax: boolean };
  items: ViewModelItem[];
  totals: { rows: TotalsRow[]; amountInWords?: string; amountDue: string; amountDueLabel: string };
  paymentMethods: PaymentMethodsSnapshot;
  notes?: string;
  terms?: string;
  verifyUrl?: string;
  /** PNG data URL of the verification QR; filled by the server for PDFs and issued previews. */
  qrDataUrl?: string;
  creditNote?: { reason: string; againstNumber: string; againstDate: string };
  showLogo: boolean;
  showSignature: boolean;
  showStamp: boolean;
  headerNote?: string;
  footer?: string;
  signatureCaption: string;
}

export interface ViewModelOptions {
  appUrl: string;
  assetUrl: (assetId: string) => string;
  config: TemplateConfig;
  draft: boolean;
  qrDataUrl?: string;
}

const EXPORT_OR_RC: ReadonlySet<SupplyType> = new Set([
  "EXPORT_LUT",
  "EXPORT_WITH_TAX",
  "REVERSE_CHARGE",
]);

/** SPEC §4.17: GST-appropriate automatic title unless the config sets a custom one. */
export function documentTitle(input: RenderInput, config: TemplateConfig): string {
  if (config.title.mode === "custom" && config.title.custom?.trim())
    return config.title.custom.trim();
  if (input.kind === "CREDIT_NOTE") return "CREDIT NOTE";
  if (input.taxRegime !== "INDIA_GST" || !input.issuer.gstin) return "INVOICE";
  if (input.supplyType === "NOT_APPLICABLE") return "INVOICE";
  if (EXPORT_OR_RC.has(input.supplyType)) return "TAX INVOICE";
  const allZero = input.items.length > 0 && input.items.every((i) => D(i.taxRate).isZero());
  return allZero ? "BILL OF SUPPLY" : "TAX INVOICE";
}

function supplyStatement(input: RenderInput): string | undefined {
  if (!input.displayConfig.document.showSupplyStatement) return undefined;
  if (input.taxRegime === "UK_VAT") {
    return input.isReverseCharge ? SUPPLY_STATEMENTS.UK_REVERSE_CHARGE : undefined;
  }
  if (input.taxRegime !== "INDIA_GST") return undefined;
  switch (input.supplyType) {
    case "EXPORT_LUT":
    case "EXPORT_WITH_TAX":
    case "REVERSE_CHARGE":
      return SUPPLY_STATEMENTS[input.supplyType];
    case "NOT_APPLICABLE":
      return input.issuer.gstin ? undefined : SUPPLY_STATEMENTS.NOT_APPLICABLE;
    default:
      return undefined;
  }
}

export function buildDocumentViewModel(input: RenderInput, o: ViewModelOptions): DocumentViewModel {
  const { currency, locale, displayConfig: d } = input;
  const labels = resolveLabels(o.config);
  const money = (v: string) => formatMoney(v, currency, locale);
  const amount = (v: string) => formatAmount(v, currency, locale);
  const isDraft = o.draft || input.status === "DRAFT";
  const isCredit = input.kind === "CREDIT_NOTE";

  const rows: TotalsRow[] = [];
  const t = o.config.totals;
  if (isCredit) {
    rows.push({ key: "subtotal", label: "Credit amount", value: money(input.subtotal) });
  } else {
    if (t.showSubtotal)
      rows.push({ key: "subtotal", label: labels.subtotal, value: money(input.subtotal) });
    if (t.showDiscount && !D(input.discountAmount).isZero()) {
      const suffix =
        input.discountType === "PERCENT" && input.discountValue
          ? ` (${formatPercent(input.discountValue)})`
          : "";
      rows.push({
        key: "discount",
        label: `${labels.discount}${suffix}`,
        value: `−${money(input.discountAmount)}`,
      });
      rows.push({ key: "taxable", label: labels.taxable, value: money(input.taxableAmount) });
    }
  }
  if (t.showTaxLines) {
    for (const line of input.taxLines) {
      rows.push({
        key: `tax-${line.taxType}-${line.rate}`,
        label: `${line.taxType} ${formatPercent(line.rate)}`,
        value: money(line.taxAmount),
      });
    }
  }
  if (
    !isCredit &&
    t.showRounding &&
    d.document.showRoundingLine &&
    !D(input.roundingAdjustment).isZero()
  ) {
    const adj = D(input.roundingAdjustment);
    rows.push({
      key: "rounding",
      label: labels.rounding,
      value: `${adj.isNegative() ? "−" : "+"}${money(adj.abs().toString())}`,
    });
  }
  rows.push({ key: "total", label: labels.total, value: money(input.total), emphasis: true });
  if (!isCredit && t.showTdsExpected && d.document.showTdsBreakdown && D(input.tdsRate).gt(0)) {
    rows.push({
      key: "tds",
      label: `${labels.tdsExpected} (${formatPercent(input.tdsRate)})`,
      value: money(input.tdsExpected),
    });
    rows.push({
      key: "net",
      label: labels.netExpected,
      value: money(D(input.total).minus(D(input.tdsExpected)).toString()),
    });
  }

  const showWords = d.document.showAmountInWords && t.amountInWords !== "hidden";
  const verifyUrl =
    !isDraft && input.status !== "DRAFT" && d.document.showQrVerification
      ? `${o.appUrl.replace(/\/$/, "")}/verify/${input.verificationToken}`
      : undefined;

  const issuer: DocumentViewModel["issuer"] = { ...input.issuer };
  if (d.issuer.showLogo && input.issuer.logoAssetId)
    issuer.logoUrl = o.assetUrl(input.issuer.logoAssetId);
  if (d.issuer.showSignature && input.issuer.signatureAssetId) {
    issuer.signatureUrl = o.assetUrl(input.issuer.signatureAssetId);
  }
  if (d.issuer.showStamp && input.issuer.stampAssetId)
    issuer.stampUrl = o.assetUrl(input.issuer.stampAssetId);

  const vm: DocumentViewModel = {
    kind: input.kind,
    isDraft,
    isVoid: input.status === "VOID",
    title: documentTitle(input, o.config),
    number: isDraft ? null : input.number,
    issueDate: formatDate(input.issueDate, locale),
    currency,
    locale,
    labels,
    issuer,
    client: input.client,
    columns: {
      sac: d.document.showSacCodeColumn,
      qty: d.document.showQuantityColumn,
      rate: d.document.showUnitPriceColumn,
      tax: d.document.showTaxColumn,
    },
    items: input.items.map((i) => ({
      position: i.position,
      description: i.description,
      ...(i.sacHsnCode ? { sacHsnCode: i.sacHsnCode } : {}),
      qty: formatQuantity(i.quantity, locale),
      unit: UNIT_LABELS[i.unitType] ?? i.unitType,
      rate: amount(i.unitPrice),
      taxRate: i.taxExempt ? "Exempt" : formatPercent(i.taxRate),
      taxAmount: amount(i.taxAmount),
      lineSubtotal: amount(i.lineSubtotal),
      lineTotal: amount(i.lineTotal),
    })),
    totals: {
      rows,
      amountDue: money(input.total),
      amountDueLabel: isCredit ? labels.total : labels.amountDue,
      ...(showWords ? { amountInWords: amountInWords(input.total, currency, locale) } : {}),
    },
    paymentMethods: isCredit ? [] : input.paymentMethods,
    showLogo: d.issuer.showLogo,
    showSignature: d.issuer.showSignature,
    showStamp: d.issuer.showStamp,
    signatureCaption: o.config.text.signatureCaption?.trim() || labels.signature,
  };
  if (isDraft) vm.watermark = o.config.text.draftWatermark;
  if (!isCredit && d.document.showDueDate && input.dueDate)
    vm.dueDate = formatDate(input.dueDate, locale);
  if (!isCredit && d.document.showPaymentTerms)
    vm.paymentTerms = `${input.client.paymentTermsDays} days`;
  if (input.taxRegime === "INDIA_GST" && d.document.showPlaceOfSupply && input.placeOfSupply) {
    vm.placeOfSupply = input.placeOfSupply;
  }
  const statement = supplyStatement(input);
  if (statement) vm.supplyStatement = statement;
  if (d.document.showReplacesReference && input.replaces?.number)
    vm.replaces = `Replaces ${input.replaces.number}`;
  if (input.poReference) vm.poReference = input.poReference;
  if (d.document.showNotes && input.notes?.trim()) vm.notes = input.notes.trim();
  if (d.document.showTerms && input.terms?.trim()) vm.terms = input.terms.trim();
  if (verifyUrl) vm.verifyUrl = verifyUrl;
  if (verifyUrl && o.qrDataUrl) vm.qrDataUrl = o.qrDataUrl;
  if (input.creditNote) {
    vm.creditNote = {
      reason: input.creditNote.reason,
      againstNumber: input.creditNote.againstNumber,
      againstDate: formatDate(input.creditNote.againstDate, locale),
    };
  }
  if (o.config.text.headerNote?.trim()) vm.headerNote = o.config.text.headerNote.trim();
  if (o.config.text.footer?.trim()) vm.footer = o.config.text.footer.trim();
  return vm;
}
