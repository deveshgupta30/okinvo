import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toGstEInvoice } from "@/lib/einvoice/gst/build";
import { GstEInvoiceSchema } from "@/lib/einvoice/gst/schema";
import type { EInvoiceInput } from "@/lib/einvoice/input";

/**
 * India GST e-invoice JSON (INV-01 v1.1, spec §9e): the standard test invoice matches its
 * golden fixture; inter-state supplies carry IGST; exports under LUT are EXPWOP with export
 * details; the totals reconcile with the invoice; and the IRP's rules reject what it would.
 */
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "einvoice", name), "utf8"));

/** The standard intra-state test invoice: Karnataka seller, Karnataka buyer, 18% GST, 10% TDS. */
export function standardInput(over: Partial<EInvoiceInput> = {}): EInvoiceInput {
  return {
    kind: "INVOICE",
    number: "INV/26-27/007",
    issueDate: "2026-04-15",
    dueDate: "2026-04-30",
    currency: "INR",
    fxRateToBase: "1",
    taxRegime: "INDIA_GST",
    supplyType: "INTRA_STATE",
    isReverseCharge: false,
    placeOfSupply: "Karnataka (29)",
    documentLocale: "en-US",
    issuer: {
      legalName: "Asha Rao",
      tradeName: "Asha Rao Design",
      gstin: "29ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      email: "asha@example.com",
      phone: "+91 98765 43210",
      address: {
        line1: "14 Lavelle Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        countryCode: "IN",
      },
      countryCode: "IN",
      gstStateCode: "29",
    },
    client: {
      legalName: "Acme Ltd",
      taxIdType: "GSTIN",
      taxId: "29AAAAA0000A1Z5",
      email: "accounts@acme.example",
      address: {
        line1: "2 Client Road",
        line2: "Floor 3",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560002",
        countryCode: "IN",
      },
      countryCode: "IN",
      gstStateCode: "29",
      paymentTermsDays: 15,
    },
    lines: [
      {
        position: 1,
        description: "Design work",
        sacHsnCode: "998314",
        unitType: "HOUR",
        quantity: "10.000",
        unitPrice: "1000.00",
        lineSubtotal: "10000.00",
        taxRate: "18",
        taxExempt: false,
        taxAmount: "1800.00",
        lineTotal: "11800.00",
      },
      {
        position: 2,
        description: "Branded notebook",
        sacHsnCode: "4820",
        unitType: "UNIT",
        quantity: "5.000",
        unitPrice: "100.00",
        lineSubtotal: "500.00",
        taxRate: "18",
        taxExempt: false,
        taxAmount: "90.00",
        lineTotal: "590.00",
        sku: "NB-01",
      },
    ],
    taxLines: [
      { taxType: "CGST", rate: "9", taxableAmount: "10500.00", taxAmount: "945.00" },
      { taxType: "SGST", rate: "9", taxableAmount: "10500.00", taxAmount: "945.00" },
    ],
    totals: {
      subtotal: "10500.00",
      discountAmount: "0.00",
      taxableAmount: "10500.00",
      taxAmount: "1890.00",
      roundingAdjustment: "0.00",
      total: "12390.00",
      tdsRate: "10",
      tdsExpected: "1050.00",
    },
    paymentMethods: [
      {
        name: "HDFC current account",
        type: "BANK_TRANSFER",
        lines: [
          { label: "Account holder", value: "Asha Rao" },
          { label: "Account number", value: "50100123456789" },
          { label: "IFSC", value: "HDFC0001234" },
        ],
      },
    ],
    poReference: "PO-2026-118",
    ...over,
  };
}

describe("toGstEInvoice", () => {
  it("matches the golden fixture for the standard intra-state invoice", () => {
    const json = toGstEInvoice(standardInput());
    expect(json).toEqual(fixture("gst-standard.json"));
    expect(GstEInvoiceSchema.safeParse(json).success).toBe(true);
  });

  it("splits intra-state tax into CGST and SGST and reconciles the totals", () => {
    const json = toGstEInvoice(standardInput());
    expect(json.TranDtls.SupTyp).toBe("B2B");
    expect(json.ItemList[0]?.CgstAmt).toBe(900);
    expect(json.ItemList[0]?.SgstAmt).toBe(900);
    expect(json.ItemList[0]?.IgstAmt).toBe(0);
    expect(json.ValDtls.AssVal).toBe(10500);
    expect(json.ValDtls.CgstVal).toBe(945);
    expect(json.ValDtls.SgstVal).toBe(945);
    expect(json.ValDtls.IgstVal).toBe(0);
    expect(json.ValDtls.RndOffAmt).toBe(0);
    // TDS is the buyer's deduction, never subtracted from the invoice value
    expect(json.ValDtls.TotInvVal).toBe(12390);
    expect(json.ItemList.map((i) => i.TotItemVal)).toEqual([11800, 590]);
  });

  it("carries IGST for an inter-state supply", () => {
    const json = toGstEInvoice(
      standardInput({
        supplyType: "INTER_STATE",
        placeOfSupply: "Maharashtra (27)",
        client: { ...standardInput().client, taxId: "27AAAAA0000A1Z5", gstStateCode: "27" },
        taxLines: [
          { taxType: "IGST", rate: "18", taxableAmount: "10500.00", taxAmount: "1890.00" },
        ],
      }),
    );
    expect(json.BuyerDtls.Pos).toBe("27");
    expect(json.BuyerDtls.Stcd).toBe("27");
    expect(json.ItemList[0]?.IgstAmt).toBe(1800);
    expect(json.ItemList[0]?.CgstAmt).toBe(0);
    expect(json.ValDtls.IgstVal).toBe(1890);
    expect(json.ValDtls.CgstVal).toBe(0);
  });

  it("marks an export under LUT as EXPWOP with export details and an unregistered buyer", () => {
    const json = toGstEInvoice(
      standardInput({
        supplyType: "EXPORT_LUT",
        currency: "USD",
        fxRateToBase: "83.5",
        placeOfSupply: "United States",
        lutNumber: "AD290326000001X",
        client: {
          legalName: "Globex Corp",
          address: {
            line1: "1 Market St",
            city: "San Francisco",
            postalCode: "94105",
            countryCode: "US",
          },
          countryCode: "US",
          paymentTermsDays: 30,
        },
        lines: [
          {
            ...standardInput().lines[0]!,
            unitPrice: "100.00",
            lineSubtotal: "1000.00",
            taxRate: "0",
            taxAmount: "0.00",
            lineTotal: "1000.00",
          },
        ],
        taxLines: [],
        totals: {
          subtotal: "1000.00",
          discountAmount: "0.00",
          taxableAmount: "1000.00",
          taxAmount: "0.00",
          roundingAdjustment: "0.00",
          total: "1000.00",
          tdsRate: "0",
          tdsExpected: "0.00",
        },
      }),
    );
    expect(json.TranDtls.SupTyp).toBe("EXPWOP");
    expect(json.BuyerDtls.Gstin).toBe("URP");
    expect(json.BuyerDtls.Pos).toBe("96");
    expect(json.BuyerDtls.Stcd).toBe("96");
    expect(json.BuyerDtls.Pin).toBe(999999);
    expect(json.ExpDtls).toEqual({ RefClm: "N", ForCur: "USD", CntCode: "US" });
    expect(json.ValDtls.TotInvVal).toBe(1000);
  });

  it("marks a reverse-charge supply and a discounted, rounded invoice correctly", () => {
    const json = toGstEInvoice(
      standardInput({
        isReverseCharge: true,
        supplyType: "REVERSE_CHARGE",
        totals: {
          subtotal: "10500.00",
          discountAmount: "500.00",
          taxableAmount: "10000.00",
          taxAmount: "1800.00",
          roundingAdjustment: "0.40",
          total: "11800.40",
          tdsRate: "0",
          tdsExpected: "0.00",
        },
        taxLines: [
          { taxType: "CGST", rate: "9", taxableAmount: "10000.00", taxAmount: "900.00" },
          { taxType: "SGST", rate: "9", taxableAmount: "10000.00", taxAmount: "900.00" },
        ],
      }),
    );
    expect(json.TranDtls.RegRev).toBe("Y");
    expect(json.ValDtls.Discount).toBe(500);
    expect(json.ValDtls.AssVal).toBe(10000);
    expect(json.ValDtls.RndOffAmt).toBe(0.4);
    expect(json.ValDtls.TotInvVal).toBe(11800.4);
    // the discount is apportioned over the lines so the items reconcile with the assessable value
    expect(json.ItemList.reduce((n, i) => n + i.AssAmt, 0)).toBeCloseTo(10000, 2);
  });

  it("maps units, service flags and the payment details", () => {
    const json = toGstEInvoice(standardInput());
    expect(json.ItemList[0]?.IsServc).toBe("Y");
    expect(json.ItemList[0]?.Unit).toBe("OTH");
    expect(json.ItemList[1]?.IsServc).toBe("N");
    expect(json.ItemList[1]?.Unit).toBe("NOS");
    expect(json.DocDtls).toEqual({ Typ: "INV", No: "INV/26-27/007", Dt: "15/04/2026" });
    expect(json.PayDtls).toEqual({
      Nm: "Asha Rao",
      AccDet: "50100123456789",
      Mode: "Bank transfer",
      FinInsBr: "HDFC0001234",
      PayTerm: "15",
    });
  });

  it("rejects an issuer without a GSTIN, a PIN that is not 6 digits and a 3-digit HSN", () => {
    expect(() =>
      toGstEInvoice(standardInput({ issuer: { ...standardInput().issuer, gstin: undefined } })),
    ).toThrow(/GSTIN/);
    expect(() =>
      toGstEInvoice(
        standardInput({
          issuer: {
            ...standardInput().issuer,
            address: { ...standardInput().issuer.address!, postalCode: "5600" },
          },
        }),
      ),
    ).toThrow(/Pin/);
    expect(() =>
      toGstEInvoice(
        standardInput({ lines: [{ ...standardInput().lines[0]!, sacHsnCode: "998" }] }),
      ),
    ).toThrow(/HsnCd/);
    expect(() => toGstEInvoice(standardInput({ taxRegime: "UK_VAT" }))).toThrow(/GST/);
  });
});
