import type { Address, PaymentMethodsSnapshot, TaxRegime } from "@/lib/schemas";
import type { UnitType } from "@/lib/schemas/service-input";
import type { SupplyType } from "@/lib/tax";
import type { InvoiceDto } from "@/server/dal/invoices";

/**
 * The issued document as every e-invoice builder sees it (spec §9e): a projection of the
 * invoice's snapshots and totals, never of live rows, so a registered e-invoice matches the PDF
 * that was issued. Money stays decimal strings here; a builder converts at its own boundary.
 */
export interface EInvoiceParty {
  legalName: string;
  tradeName?: string | undefined;
  gstin?: string | undefined;
  pan?: string | undefined;
  taxIdType?: "GSTIN" | "VAT" | "EIN" | "OTHER" | undefined;
  taxId?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  /** The structured address frozen at issue; older documents only have the printed lines. */
  address?: Address | undefined;
  addressLines?: string[] | undefined;
  countryCode: string;
  stateCode?: string | undefined;
  gstStateCode?: string | undefined;
  electronicAddress?: string | undefined;
  electronicAddressScheme?: string | undefined;
  paymentTermsDays?: number | undefined;
}

export interface EInvoiceLine {
  position: number;
  description: string;
  sacHsnCode?: string | undefined;
  unitType: UnitType;
  quantity: string;
  unitPrice: string;
  lineSubtotal: string;
  taxRate: string;
  taxExempt: boolean;
  taxAmount: string;
  lineTotal: string;
  sku?: string | undefined;
}

export interface EInvoiceTaxLine {
  taxType: "CGST" | "SGST" | "IGST" | "VAT" | "SALES_TAX" | "OTHER";
  rate: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface EInvoiceTotals {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  roundingAdjustment: string;
  total: string;
  tdsRate: string;
  tdsExpected: string;
}

export interface EInvoiceInput {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issueDate: string;
  dueDate?: string | undefined;
  currency: string;
  fxRateToBase: string;
  taxRegime: TaxRegime;
  supplyType: SupplyType;
  isReverseCharge: boolean;
  placeOfSupply?: string | undefined;
  lutNumber?: string | undefined;
  documentLocale: string;
  issuer: EInvoiceParty;
  client: EInvoiceParty;
  lines: EInvoiceLine[];
  taxLines: EInvoiceTaxLine[];
  totals: EInvoiceTotals;
  paymentMethods: PaymentMethodsSnapshot;
  poReference?: string | undefined;
  buyerReference?: string | undefined;
  notes?: string | undefined;
}

const def = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

/** An issued invoice's snapshots and totals as e-invoice input; drafts have no snapshots. */
export function einvoiceInputFromInvoice(inv: InvoiceDto): EInvoiceInput {
  if (!inv.issuerSnapshot || !inv.clientSnapshot || !inv.number) {
    throw new Error("Only issued invoices have the snapshots an e-invoice is built from.");
  }
  const i = inv.issuerSnapshot;
  const c = inv.clientSnapshot;
  return {
    kind: "INVOICE",
    number: inv.number,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    fxRateToBase: inv.fxRateToBase,
    taxRegime: inv.taxRegime,
    supplyType: inv.supplyType,
    isReverseCharge: inv.isReverseCharge,
    placeOfSupply: def(inv.placeOfSupply),
    lutNumber: def(inv.lutNumber),
    documentLocale: inv.documentLocale,
    issuer: {
      legalName: i.legalName,
      tradeName: i.tradeName,
      gstin: i.gstin,
      pan: i.pan,
      email: i.email,
      phone: i.phone,
      address: i.address,
      addressLines: i.addressLines,
      countryCode: i.countryCode,
      stateCode: i.stateCode,
      gstStateCode: i.gstStateCode,
      electronicAddress: i.electronicAddress,
      electronicAddressScheme: i.electronicAddressScheme,
    },
    client: {
      legalName: c.displayName,
      taxIdType: c.taxIdType,
      taxId: c.taxId,
      email: c.email,
      phone: c.phone,
      address: c.address,
      addressLines: c.billingAddressLines,
      countryCode: c.countryCode,
      stateCode: c.stateCode,
      gstStateCode: c.gstStateCode,
      electronicAddress: c.electronicAddress,
      electronicAddressScheme: c.electronicAddressScheme,
      paymentTermsDays: c.paymentTermsDays,
    },
    lines: inv.items.map((it) => ({
      position: it.position,
      description: it.description,
      sacHsnCode: def(it.sacHsnCode),
      unitType: it.unitType,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineSubtotal: it.lineSubtotal,
      taxRate: it.taxRate,
      taxExempt: it.taxExempt,
      taxAmount: it.taxAmount,
      lineTotal: it.lineTotal,
      sku: def(it.sku),
    })),
    taxLines: inv.taxLines.map((t) => ({
      taxType: t.taxType,
      rate: t.rate,
      taxableAmount: t.taxableAmount,
      taxAmount: t.taxAmount,
    })),
    totals: {
      subtotal: inv.subtotal,
      discountAmount: inv.discountAmount,
      taxableAmount: inv.taxableAmount,
      taxAmount: inv.taxAmount,
      roundingAdjustment: inv.roundingAdjustment,
      total: inv.total,
      tdsRate: inv.tdsRate,
      tdsExpected: inv.tdsExpected,
    },
    paymentMethods: inv.paymentMethodsSnapshot ?? [],
    poReference: def(inv.poReference),
    buyerReference: c.buyerReference,
    notes: def(inv.notes),
  };
}
