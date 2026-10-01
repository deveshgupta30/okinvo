import { describe, expect, it } from "vitest";
import { isValidRoundingAdjustment, suggestRoundingAdjustment } from "@/lib/invoices";
import { D } from "@/lib/money";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { computeTax } from "@/lib/tax";

/** Rules added after the whole-branch review: bounds, zero-decimal rounding, UK VAT exempt lines. */
const base = {
  issuerProfileId: "p",
  clientId: "c",
  issueDate: "2026-05-01",
  dueDate: "2026-05-31",
  currency: "INR",
  taxRegime: "INDIA_GST",
  displayConfig: DEFAULT_DISPLAY_CONFIG,
};
const item = (quantity: string, unitPrice: string) => ({
  description: "Work",
  unitType: "HOUR",
  quantity,
  unitPrice,
  taxRate: "18",
});

describe("line bounds", () => {
  it("accepts a six-figure quantity and an eight-figure unit price (on separate lines)", () => {
    expect(
      InvoiceDraftInputSchema.safeParse({
        ...base,
        items: [item("999999.999", "100"), item("1", "99999999.99")],
      }).success,
    ).toBe(true);
  });
  it("rejects a quantity above 999,999.999 and a price above 99,999,999.99 as field errors", () => {
    const q = InvoiceDraftInputSchema.safeParse({ ...base, items: [item("1000000", "10")] });
    expect(q.success).toBe(false);
    expect(q.error?.issues.map((i) => i.path.join("."))).toContain("items.0.quantity");
    const p = InvoiceDraftInputSchema.safeParse({ ...base, items: [item("1", "100000000")] });
    expect(p.success).toBe(false);
    expect(p.error?.issues.map((i) => i.path.join("."))).toContain("items.0.unitPrice");
  });
  it("rejects a line whose subtotal would not fit the money column (12 integer digits)", () => {
    const r = InvoiceDraftInputSchema.safeParse({
      ...base,
      items: [item("999999.999", "99999999.99"), item("999999.999", "99999999.99")],
    });
    // Each line alone fits; the invoice subtotal (≈ 2 × 10^14) does not.
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message).join(" ")).toMatch(/too large/i);
  });
});

describe("rounding adjustment and zero-decimal currencies", () => {
  it("allows a sub-unit nudge for INR and nothing but zero for JPY", () => {
    expect(isValidRoundingAdjustment(D("0.40"), "INR")).toBe(true);
    expect(isValidRoundingAdjustment(D("-0.60"), "INR")).toBe(true);
    expect(isValidRoundingAdjustment(D("1"), "INR")).toBe(false);
    expect(isValidRoundingAdjustment(D("0"), "JPY")).toBe(true);
    expect(isValidRoundingAdjustment(D("0.40"), "JPY")).toBe(false);
    expect(suggestRoundingAdjustment(D("1500.40"), "JPY").isZero()).toBe(true);
  });
  it("the draft schema refuses a rounding adjustment on a zero-decimal currency", () => {
    const r = InvoiceDraftInputSchema.safeParse({
      ...base,
      currency: "JPY",
      items: [item("1", "1000")],
      roundingAdjustment: "0.40",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("roundingAdjustment");
  });
});

describe("UK VAT exempt lines", () => {
  const ctx = {
    regime: "UK_VAT" as const,
    currency: "GBP",
    fiscalYear: "2026",
    isReverseCharge: false,
    issuer: { countryCode: "GB", ukVatNumber: "GB123456789" },
    client: { countryCode: "GB" },
  };
  it("charges nothing on an exempt line and keeps it out of the VAT rows", () => {
    const r = computeTax(ctx, [
      { position: 1, taxableAmount: D("100"), taxRate: D("20") },
      { position: 2, taxableAmount: D("50"), taxRate: D("0"), exempt: true },
    ]);
    expect(r.lines).toEqual([
      { position: 1, taxAmount: D("20") },
      { position: 2, taxAmount: D("0") },
    ]);
    expect(r.taxLines.map((t) => `${t.taxType} ${t.rate} ${t.taxableAmount}`)).toEqual([
      "VAT 20 100",
    ]);
  });
  it("the draft schema accepts taxExempt on a line", () => {
    const r = InvoiceDraftInputSchema.safeParse({
      ...base,
      currency: "GBP",
      taxRegime: "UK_VAT",
      items: [{ ...item("1", "100"), taxRate: "0", taxExempt: "on" }],
    });
    expect(r.success).toBe(true);
    expect(r.data?.items[0]?.taxExempt).toBe(true);
  });
});
