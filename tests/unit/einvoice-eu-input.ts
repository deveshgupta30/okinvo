import type { EInvoiceInput } from "@/lib/einvoice/input";

/** The standard UK VAT test invoice: London seller, Manchester buyer, 20% VAT, IBAN. */
export function ukInput(over: Partial<EInvoiceInput> = {}): EInvoiceInput {
  return {
    kind: "INVOICE",
    number: "INV-2026-0042",
    issueDate: "2026-05-01",
    dueDate: "2026-05-31",
    currency: "GBP",
    fxRateToBase: "1",
    taxRegime: "UK_VAT",
    supplyType: "NOT_APPLICABLE",
    isReverseCharge: false,
    documentLocale: "en-GB",
    issuer: {
      legalName: "Jo Bloggs Ltd",
      tradeName: "Bloggs Studio",
      taxIdType: "VAT",
      taxId: "GB123456789",
      email: "jo@bloggs.example",
      phone: "+44 20 7946 0000",
      address: {
        line1: "1 Fleet Street",
        city: "London",
        postalCode: "EC4Y 1AA",
        countryCode: "GB",
      },
      countryCode: "GB",
      electronicAddress: "GB123456789",
      electronicAddressScheme: "0088",
    },
    client: {
      legalName: "Northern Widgets plc",
      taxIdType: "VAT",
      taxId: "GB987654321",
      email: "ap@northern.example",
      address: {
        line1: "9 Deansgate",
        line2: "Suite 4",
        city: "Manchester",
        postalCode: "M3 2BW",
        countryCode: "GB",
      },
      countryCode: "GB",
      electronicAddress: "GB987654321",
      electronicAddressScheme: "9932",
      paymentTermsDays: 30,
    },
    lines: [
      {
        position: 1,
        description: "Consulting",
        unitType: "HOUR",
        quantity: "10.000",
        unitPrice: "100.00",
        lineSubtotal: "1000.00",
        taxRate: "20",
        taxExempt: false,
        taxAmount: "200.00",
        lineTotal: "1200.00",
      },
      {
        position: 2,
        description: "Printed manual",
        unitType: "UNIT",
        quantity: "3.000",
        unitPrice: "25.00",
        lineSubtotal: "75.00",
        taxRate: "0",
        taxExempt: false,
        taxAmount: "0.00",
        lineTotal: "75.00",
        sku: "MAN-01",
      },
    ],
    taxLines: [{ taxType: "VAT", rate: "20", taxableAmount: "1000.00", taxAmount: "200.00" }],
    totals: {
      subtotal: "1075.00",
      discountAmount: "0.00",
      taxableAmount: "1075.00",
      taxAmount: "200.00",
      roundingAdjustment: "0.00",
      total: "1275.00",
      tdsRate: "0",
      tdsExpected: "0.00",
    },
    paymentMethods: [
      {
        name: "Barclays business account",
        type: "BANK_TRANSFER",
        lines: [
          { label: "Account holder", value: "Jo Bloggs Ltd" },
          { label: "IBAN", value: "GB29NWBK60161331926819" },
          { label: "SWIFT/BIC", value: "NWBKGB2L" },
        ],
      },
    ],
    poReference: "PO-7781",
    buyerReference: "COST-CENTRE-12",
    notes: "Thank you for your business.",
    ...over,
  };
}

/** A credit note against the standard invoice: the consulting line credited in full. */
export function ukCreditNoteInput(): EInvoiceInput {
  const inv = ukInput();
  return {
    ...inv,
    kind: "CREDIT_NOTE",
    number: "CN-2026-0003",
    issueDate: "2026-05-10",
    dueDate: undefined,
    poReference: undefined,
    notes: "Credit for cancelled consulting.",
    creditedInvoice: { number: inv.number, issueDate: inv.issueDate },
    lines: [inv.lines[0]!],
    taxLines: [{ taxType: "VAT", rate: "20", taxableAmount: "1000.00", taxAmount: "200.00" }],
    totals: {
      subtotal: "1000.00",
      discountAmount: "0.00",
      taxableAmount: "1000.00",
      taxAmount: "200.00",
      roundingAdjustment: "0.00",
      total: "1200.00",
      tdsRate: "0",
      tdsExpected: "0.00",
    },
  };
}

/** Reverse-charge variant: a B2B cross-border service where the buyer accounts for VAT. */
export function ukReverseChargeInput(): EInvoiceInput {
  const inv = ukInput();
  return ukInput({
    isReverseCharge: true,
    supplyType: "REVERSE_CHARGE",
    client: {
      ...inv.client,
      countryCode: "IE",
      taxId: "IE1234567T",
      electronicAddress: "IE1234567T",
      electronicAddressScheme: "9935",
    },
    lines: [{ ...inv.lines[0]!, taxRate: "0", taxAmount: "0.00", lineTotal: "1000.00" }],
    taxLines: [],
    totals: {
      ...inv.totals,
      subtotal: "1000.00",
      taxableAmount: "1000.00",
      taxAmount: "0.00",
      total: "1000.00",
    },
  });
}
