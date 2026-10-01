import { describe, expect, it } from "vitest";
import { buildDocumentViewModel, type RenderInput } from "@/lib/documents/view-model";
import { DEFAULT_DISPLAY_CONFIG, DEFAULT_TEMPLATE_CONFIG, mergeDisplayConfig } from "@/lib/schemas";

const issued: RenderInput = {
  kind: "INVOICE",
  status: "ISSUED",
  number: "INV/26-27/007",
  issueDate: "2026-04-15",
  dueDate: "2026-04-30",
  currency: "INR",
  locale: "en-IN",
  issuer: {
    type: "INDIVIDUAL",
    legalName: "Asha Rao",
    email: "asha@example.com",
    addressLines: ["1 Test Street", "Bengaluru, Karnataka 560001", "India"],
    countryCode: "IN",
    gstStateCode: "29",
    gstin: "29ABCDE1234F1Z5",
    locale: "en-IN",
    baseCurrency: "INR",
  },
  client: {
    displayName: "Acme Ltd",
    billingAddressLines: ["2 Client Road", "Mumbai, Maharashtra 400001", "India"],
    countryCode: "IN",
    gstStateCode: "27",
    taxIdType: "GSTIN",
    taxId: "27AAAAA0000A1Z5",
    paymentTermsDays: 15,
  },
  paymentMethods: [
    { name: "HDFC current account", type: "BANK_TRANSFER", lines: [{ label: "IFSC", value: "HDFC0001234" }] },
  ],
  taxRegime: "INDIA_GST",
  supplyType: "INTER_STATE",
  placeOfSupply: "Maharashtra (27)",
  isReverseCharge: false,
  lutNumber: null,
  items: [
    {
      id: "i1",
      position: 1,
      serviceItemId: null,
      description: "Design work",
      sacHsnCode: "998314",
      unitType: "HOUR",
      quantity: "10.000",
      unitPrice: "1000.00",
      lineSubtotal: "10000.00",
      taxRate: "18",
      taxAmount: "1800.00",
      lineTotal: "11800.00",
    },
  ],
  taxLines: [{ taxType: "IGST", rate: "18", taxableAmount: "10000.00", taxAmount: "1800.00" }],
  subtotal: "10000.00",
  discountType: null,
  discountValue: null,
  discountAmount: "0.00",
  taxableAmount: "10000.00",
  taxAmount: "1800.00",
  roundingAdjustment: "0.00",
  total: "11800.00",
  tdsRate: "10",
  tdsExpected: "1000.00",
  poReference: "PO-9",
  notes: "Thank you",
  terms: "Net 15",
  displayConfig: mergeDisplayConfig({ document: { showTdsBreakdown: true } }),
  replaces: { number: "INV/26-27/006" },
  verificationToken: "tok123",
};

const opts = {
  appUrl: "https://inv.example.com",
  assetUrl: (id: string) => `/api/assets/${id}`,
  config: DEFAULT_TEMPLATE_CONFIG,
  draft: false,
};

describe("buildDocumentViewModel", () => {
  it("formats an issued GST invoice for its locale", () => {
    const vm = buildDocumentViewModel(issued, opts);
    expect(vm.title).toBe("TAX INVOICE");
    expect(vm.number).toBe("INV/26-27/007");
    expect(vm.isDraft).toBe(false);
    expect(vm.issueDate).toBe("15 Apr 2026");
    expect(vm.dueDate).toBe("30 Apr 2026");
    expect(vm.items[0]).toMatchObject({ qty: "10", rate: "1,000.00", taxRate: "18%", lineTotal: "11,800.00" });
    expect(vm.totals.rows.map((r) => [r.label, r.value])).toEqual([
      ["Subtotal", "₹10,000.00"],
      ["IGST 18%", "₹1,800.00"],
      ["Total", "₹11,800.00"],
      ["TDS expected (10%)", "₹1,000.00"],
      ["Net expected", "₹10,800.00"],
    ]);
    expect(vm.totals.amountInWords).toBe("Rupees Eleven Thousand Eight Hundred Only");
    expect(vm.placeOfSupply).toBe("Maharashtra (27)");
    expect(vm.replaces).toBe("Replaces INV/26-27/006");
    expect(vm.verifyUrl).toBe("https://inv.example.com/verify/tok123");
    expect(vm.columns).toEqual({ sac: true, qty: true, rate: true, tax: true });
    expect(vm.paymentMethods[0]?.lines[0]).toEqual({ label: "IFSC", value: "HDFC0001234" });
  });

  it("marks drafts: watermark, no number, no verification link", () => {
    const vm = buildDocumentViewModel({ ...issued, status: "DRAFT", number: null }, { ...opts, draft: true });
    expect(vm.isDraft).toBe(true);
    expect(vm.number).toBeNull();
    expect(vm.verifyUrl).toBeUndefined();
    expect(vm.watermark).toBe("DRAFT — not a tax invoice");
  });

  it("prints supply statements and hides columns per the display config", () => {
    const vm = buildDocumentViewModel(
      {
        ...issued,
        supplyType: "EXPORT_LUT",
        lutNumber: "AD290426001234X",
        issuer: { ...issued.issuer, lutNumber: "AD290426001234X", lutFiscalYear: "2026-27" },
        taxLines: [],
        taxAmount: "0.00",
        total: "10000.00",
        displayConfig: mergeDisplayConfig({
          document: { showSacCodeColumn: false, showTaxColumn: false, showQrVerification: false },
        }),
      },
      opts,
    );
    expect(vm.supplyStatement).toBe("Supply meant for export under LUT without payment of IGST");
    expect(vm.columns).toEqual({ sac: false, qty: true, rate: true, tax: false });
    expect(vm.verifyUrl).toBeUndefined();
    expect(vm.issuer.lutNumber).toBe("AD290426001234X");
  });

  it("uses a plain title without GST registration and a custom title when configured", () => {
    const vm = buildDocumentViewModel(
      { ...issued, issuer: { ...issued.issuer, gstin: undefined }, supplyType: "NOT_APPLICABLE", taxLines: [] },
      opts,
    );
    expect(vm.title).toBe("INVOICE");
    const custom = buildDocumentViewModel(issued, {
      ...opts,
      config: { ...DEFAULT_TEMPLATE_CONFIG, title: { mode: "custom", custom: "PROFORMA" } },
    });
    expect(custom.title).toBe("PROFORMA");
  });

  it("builds a credit note against an invoice", () => {
    const vm = buildDocumentViewModel(
      {
        ...issued,
        kind: "CREDIT_NOTE",
        number: "CN/26-27/001",
        dueDate: null,
        items: [],
        subtotal: "1000.00",
        taxableAmount: "1000.00",
        taxLines: [{ taxType: "IGST", rate: "18", taxableAmount: "1000.00", taxAmount: "180.00" }],
        taxAmount: "180.00",
        total: "1180.00",
        tdsRate: "0",
        tdsExpected: "0.00",
        creditNote: { reason: "Milestone cancelled", againstNumber: "INV/26-27/007", againstDate: "2026-04-15" },
        displayConfig: DEFAULT_DISPLAY_CONFIG,
      },
      opts,
    );
    expect(vm.title).toBe("CREDIT NOTE");
    expect(vm.creditNote).toEqual({ reason: "Milestone cancelled", againstNumber: "INV/26-27/007", againstDate: "15 Apr 2026" });
    expect(vm.totals.rows.map((r) => r.label)).toEqual(["Credit amount", "IGST 18%", "Total"]);
  });
});
