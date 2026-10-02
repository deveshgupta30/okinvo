import { describe, expect, it } from "vitest";
import {
  previewFromBuilder,
  type BuilderValues,
  type BuilderProfile,
} from "@/lib/invoices/client-preview";
import { DEFAULT_DISPLAY_CONFIG, mergeDisplayConfig } from "@/lib/schemas";
import type { ClientDto } from "@/server/dal/clients";
import type { PaymentMethodDto } from "@/server/dal/payment-methods";

const profile: BuilderProfile = {
  id: "p1",
  type: "INDIVIDUAL",
  isDefault: true,
  label: "Main",
  legalName: "Asha Rao",
  tradeName: null,
  designation: null,
  email: "asha@example.com",
  phone: null,
  website: null,
  address: { line1: "1 Street", city: "Bengaluru", countryCode: "IN" },
  countryCode: "IN",
  stateCode: "KA",
  gstStateCode: "29",
  panNumber: "ABCDE1234F",
  gstin: "29ABCDE1234F1Z5",
  hasGstin: true,
  cinNumber: null,
  ukVatNumber: null,
  lutNumber: null,
  lutFiscalYear: null,
  baseCurrency: "INR",
  locale: "en-IN",
  fiscalYearStartMonth: 4,
  defaultTaxRegime: "INDIA_GST",
  defaultTdsRate: "10",
  defaultDisplayConfig: DEFAULT_DISPLAY_CONFIG,
  defaultNotes: null,
  defaultTerms: null,
  logoAssetId: null,
  signatureAssetId: null,
  stampAssetId: null,
  archivedAt: null,
};

const client: ClientDto = {
  id: "c1",
  displayName: "Acme Ltd",
  contactPerson: null,
  email: "acme@example.com",
  phone: null,
  billingAddress: { line1: "2 Road", city: "Mumbai", countryCode: "IN" },
  shippingAddress: null,
  countryCode: "IN",
  stateCode: "MH",
  gstStateCode: "27",
  taxIdType: "GSTIN",
  taxId: "27AAAAA0000A1Z5",
  currency: "INR",
  paymentTermsDays: 15,
  defaultTdsRate: null,
  notes: null,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const method: PaymentMethodDto = {
  id: "m1",
  name: "Bank",
  type: "BANK_TRANSFER",
  currency: null,
  isDefault: true,
  isActive: true,
  instructions: null,
  details: { type: "BANK_TRANSFER", accountNumber: "0001" },
  lines: [{ label: "Account number", value: "0001" }],
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const values: BuilderValues = {
  issuerProfileId: "p1",
  clientId: "c1",
  issueDate: "2026-04-15",
  dueDate: "2026-04-30",
  currency: "INR",
  taxRegime: "INDIA_GST",
  isReverseCharge: false,
  fxRateToBase: "1",
  items: [
    {
      description: "Design",
      sacHsnCode: "998314",
      unitType: "HOUR",
      quantity: "10",
      unitPrice: "1000",
      taxRate: "18",
    },
    {
      description: "",
      sacHsnCode: "",
      unitType: "HOUR",
      quantity: "",
      unitPrice: "",
      taxRate: "18",
    },
  ],
  discountType: "PERCENT",
  discountValue: "10",
  roundingAdjustment: "",
  tdsRate: "10",
  paymentMethodIds: ["m1"],
  displayConfig: mergeDisplayConfig({ document: { showTdsBreakdown: true } }),
  poReference: "",
  notes: "",
  terms: "",
};

describe("previewFromBuilder", () => {
  it("computes totals with the same engine the server uses and builds a draft render input", () => {
    const r = previewFromBuilder(values, { profile, client, methods: [method] });
    expect(r.totals).toMatchObject({
      subtotal: "10000.00",
      discountAmount: "1000.00",
      taxableAmount: "9000.00",
      taxAmount: "1620.00",
      total: "10620.00",
      tdsExpected: "900.00",
    });
    expect(r.input.status).toBe("DRAFT");
    expect(r.input.supplyType).toBe("INTER_STATE");
    expect(r.input.placeOfSupply).toBe("Maharashtra (27)");
    expect(r.input.taxLines.map((t) => `${t.taxType} ${t.taxAmount}`)).toEqual(["IGST 1620.00"]);
    // The blank second row is ignored in the preview and reported, not crashed on.
    expect(r.input.items).toHaveLength(1);
    expect(r.input.items[0]?.lineTotal).toBe("11620.00"); // tax on the discounted base
    expect(r.input.paymentMethods[0]?.lines[0]?.value).toBe("0001");
    expect(r.input.issuer.gstin).toBe("29ABCDE1234F1Z5");
    expect(r.input.issuer.pan).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it("flags unparseable numbers and missing parties without throwing", () => {
    const r = previewFromBuilder(
      { ...values, items: [{ ...values.items[0]!, quantity: "abc" }], clientId: "" },
      { profile, client: null, methods: [] },
    );
    expect(r.totals.total).toBe("0.00");
    expect(r.warnings.join(" ")).toMatch(/quantity/i);
    expect(r.input.client.displayName).toBe("");
  });
});
