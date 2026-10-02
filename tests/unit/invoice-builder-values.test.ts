import { describe, expect, it } from "vitest";
import { valuesFromInvoice } from "@/server/dal/invoice-builder";
import type { InvoiceDto } from "@/server/dal/invoices";

/** Re-opening a draft must carry every line flag the editor can set, including UK VAT exempt. */
function fakeInvoice(overrides: Partial<InvoiceDto["items"][number]>): InvoiceDto {
  return {
    issuerProfileId: "p1",
    clientId: "c1",
    issueDate: "2026-04-01",
    dueDate: "2026-05-01",
    currency: "GBP",
    taxRegime: "UK_VAT",
    isReverseCharge: false,
    fxRateToBase: "1",
    items: [
      {
        description: "Consulting",
        sacHsnCode: null,
        unitType: "HOUR",
        quantity: "2.000",
        unitPrice: "100.00",
        taxRate: "0",
        taxExempt: false,
        serviceItemId: null,
        ...overrides,
      },
    ],
    discountType: null,
    discountValue: null,
    roundingAdjustment: "0.00",
    tdsRate: "0",
    paymentMethodIds: [],
    displayConfig: {} as InvoiceDto["displayConfig"],
    poReference: null,
    notes: null,
    terms: null,
  } as unknown as InvoiceDto;
}

describe("valuesFromInvoice", () => {
  it("keeps an exempt line exempt", () => {
    const values = valuesFromInvoice(fakeInvoice({ taxExempt: true }));
    expect(values.items[0]?.taxExempt).toBe(true);
  });

  it("keeps a taxable zero-rated line non-exempt", () => {
    const values = valuesFromInvoice(fakeInvoice({ taxExempt: false }));
    expect(values.items[0]?.taxExempt).toBe(false);
  });
});
