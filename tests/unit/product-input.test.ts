import { describe, expect, it } from "vitest";
import { ProductInputSchema, SkuSchema } from "@/lib/schemas/product-input";

describe("product input", () => {
  it("accepts a well-formed SKU and trims it", () => {
    expect(SkuSchema.parse(" ABC-001.v2/x_1 ")).toBe("ABC-001.v2/x_1");
  });
  it("rejects spaces, other symbols, empty and over-long SKUs", () => {
    for (const bad of ["AB 01", "AB#01", "", "x".repeat(41), "ümlaut"]) {
      expect(SkuSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("defaults the unit to UNIT and active to true", () => {
    const p = ProductInputSchema.parse({
      sku: "WIDGET-1",
      name: "Widget",
      unitPrice: "12.5",
      currency: "INR",
      defaultTaxRate: "18",
    });
    expect(p).toMatchObject({ unitType: "UNIT", isActive: true, unitPrice: "12.50" });
  });
});
