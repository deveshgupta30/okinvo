import type { RenderInput } from "@/lib/documents/view-model";
import { D, toMoneyString } from "@/lib/money";
import type { DisplayConfig } from "@/lib/schemas";
import type { CreditNoteDto } from "@/server/dal/credit-notes";
import type { InvoiceDto } from "@/server/dal/invoices";
import { creditNoteTaxLines } from "./apportion";

/**
 * Renderer input for a credit note. Issued notes render from their frozen snapshot; drafts and
 * the builder's live preview render from the invoice's snapshots plus the typed amount.
 */
export function creditNoteRenderInput(p: {
  invoice: Pick<
    InvoiceDto,
    | "number"
    | "issueDate"
    | "currency"
    | "taxRegime"
    | "supplyType"
    | "placeOfSupply"
    | "issuerSnapshot"
    | "clientSnapshot"
    | "taxLines"
  >;
  reason: string;
  subtotal: string;
  issueDate: string;
  displayConfig: DisplayConfig;
  status?: "DRAFT" | "ISSUED" | "VOID";
  number?: string | null;
  verificationToken?: string;
}): RenderInput {
  const c = p.invoice.currency;
  const safeSubtotal = /^-?\d+(\.\d+)?$/.test(p.subtotal.replace(/[,\s]/g, ""))
    ? p.subtotal.replace(/[,\s]/g, "")
    : "0";
  const credit = creditNoteTaxLines(
    p.invoice.taxLines.map((t) => ({
      taxType: t.taxType,
      rate: D(t.rate),
      taxableAmount: D(t.taxableAmount),
    })),
    D(safeSubtotal).lt(0) ? D(0) : D(safeSubtotal),
    c,
  );
  const issuer = p.invoice.issuerSnapshot ?? {
    type: "INDIVIDUAL",
    legalName: "",
    addressLines: [],
    countryCode: "IN",
    locale: "en-IN",
    baseCurrency: c,
  };
  const client = p.invoice.clientSnapshot ?? {
    displayName: "",
    billingAddressLines: [],
    countryCode: "IN",
    paymentTermsDays: 0,
  };
  return {
    kind: "CREDIT_NOTE",
    status: p.status ?? "DRAFT",
    number: p.number ?? null,
    issueDate: p.issueDate,
    dueDate: null,
    currency: c,
    locale: issuer.locale,
    issuer,
    client,
    paymentMethods: [],
    taxRegime: p.invoice.taxRegime,
    supplyType: p.invoice.supplyType,
    placeOfSupply: p.invoice.placeOfSupply,
    isReverseCharge: false,
    lutNumber: null,
    items: [],
    taxLines: credit.taxLines.map((t) => ({
      taxType: t.taxType,
      rate: t.rate.toString(),
      taxableAmount: toMoneyString(t.taxableAmount, c),
      taxAmount: toMoneyString(t.taxAmount, c),
    })),
    subtotal: toMoneyString(safeSubtotal, c),
    discountType: null,
    discountValue: null,
    discountAmount: toMoneyString(0, c),
    taxableAmount: toMoneyString(safeSubtotal, c),
    taxAmount: toMoneyString(credit.taxAmount, c),
    roundingAdjustment: toMoneyString(0, c),
    total: toMoneyString(credit.total, c),
    tdsRate: "0",
    tdsExpected: toMoneyString(0, c),
    poReference: null,
    notes: null,
    terms: null,
    displayConfig: p.displayConfig,
    replaces: null,
    verificationToken: p.verificationToken ?? "preview",
    creditNote: {
      reason: p.reason,
      againstNumber: p.invoice.number ?? "",
      againstDate: p.invoice.issueDate,
    },
  };
}

/** Issued credit notes render from their snapshot, never from the live invoice. */
export function creditNoteRenderInputFromSnapshot(cn: CreditNoteDto): RenderInput {
  if (!cn.snapshot) throw new Error("credit note has no snapshot");
  return {
    kind: "CREDIT_NOTE",
    status: cn.status,
    number: cn.number,
    issueDate: cn.issueDate,
    dueDate: null,
    currency: cn.currency,
    locale: cn.snapshot.issuer.locale,
    issuer: cn.snapshot.issuer,
    client: cn.snapshot.client,
    paymentMethods: [],
    taxRegime: cn.snapshot.invoice.taxRegime,
    supplyType: cn.supplyType,
    placeOfSupply: cn.snapshot.invoice.placeOfSupply ?? null,
    isReverseCharge: false,
    lutNumber: null,
    items: [],
    taxLines: cn.taxLines,
    subtotal: cn.subtotal,
    discountType: null,
    discountValue: null,
    discountAmount: toMoneyString(0, cn.currency),
    taxableAmount: cn.subtotal,
    taxAmount: cn.taxAmount,
    roundingAdjustment: toMoneyString(0, cn.currency),
    total: cn.total,
    tdsRate: "0",
    tdsExpected: toMoneyString(0, cn.currency),
    poReference: null,
    notes: null,
    terms: null,
    displayConfig: cn.displayConfig,
    replaces: null,
    verificationToken: cn.verificationToken,
    creditNote: {
      reason: cn.reason,
      againstNumber: cn.snapshot.invoice.number,
      againstDate: cn.snapshot.invoice.issueDate,
    },
  };
}
