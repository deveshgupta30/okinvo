import { z } from "zod";
import { DateStringSchema, compareDates } from "@/lib/dates";
import { fBool, fDecimal, fOptional } from "@/lib/forms";
import { D, minorUnits } from "@/lib/money";
import { GST_RATES, UK_VAT_RATES } from "@/lib/tax";
import { CurrencySchema } from "./currency";
import { DisplayConfigSchema } from "./display-config";
import { UNIT_TYPES } from "./service-input";
import { TAX_REGIMES } from "./snapshots";

const inRange = (min: number, max: number) => (v: string) => {
  const d = D(v);
  return d.gte(min) && d.lte(max);
};

export const InvoiceItemInputSchema = z.object({
  description: z.string().trim().min(1, "required").max(500),
  sacHsnCode: fOptional(z.string().trim().max(10)),
  unitType: z.enum(UNIT_TYPES),
  quantity: fDecimal(3)
    .refine((v) => D(v).gt(0), { message: "must be greater than zero" })
    .refine((v) => D(v).lte("999999.999"), { message: "must be at most 999,999.999" }),
  unitPrice: fDecimal(2)
    .refine((v) => D(v).gte(0), { message: "must not be negative" })
    .refine((v) => D(v).lte("99999999.99"), { message: "must be at most 99,999,999.99" }),
  taxRate: fDecimal(2).refine(inRange(0, 100), { message: "must be between 0 and 100" }),
  /** UK VAT exempt supply: no VAT, shown as "Exempt" instead of a rate. Absent means taxable. */
  taxExempt: fBool.optional(),
  serviceItemId: fOptional(z.string().max(64)),
});
export type InvoiceItemInput = z.infer<typeof InvoiceItemInputSchema>;

export const DiscountInputSchema = z.object({
  type: z.enum(["AMOUNT", "PERCENT"]),
  value: fDecimal(2).refine((v) => D(v).gte(0), { message: "must not be negative" }),
});

export const InvoiceDraftInputSchema = z
  .object({
    issuerProfileId: z.string().min(1, "choose an issuer profile"),
    clientId: z.string().min(1, "choose a client"),
    issueDate: DateStringSchema,
    dueDate: DateStringSchema,
    currency: CurrencySchema,
    taxRegime: z.enum(TAX_REGIMES),
    isReverseCharge: fBool,
    fxRateToBase: fDecimal(8)
      .refine((v) => D(v).gt(0), { message: "must be greater than zero" })
      .default("1.00000000"),
    items: z.array(InvoiceItemInputSchema).min(1, "add at least one line").max(200),
    discount: DiscountInputSchema.nullable().optional(),
    roundingAdjustment: fOptional(
      fDecimal(2).refine((v) => D(v).abs().lt(1), { message: "must be less than one unit" }),
    ),
    tdsRate: fDecimal(2)
      .refine(inRange(0, 100), { message: "must be between 0 and 100" })
      .default("0.00"),
    paymentMethodIds: z.array(z.string().min(1)).max(10).default([]),
    displayConfig: DisplayConfigSchema,
    poReference: fOptional(z.string().trim().max(80)),
    notes: fOptional(z.string().trim().max(2000)),
    terms: fOptional(z.string().trim().max(2000)),
  })
  .superRefine((v, ctx) => {
    if (compareDates(v.dueDate, v.issueDate) < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "must not be before the issue date",
      });
    }
    // Money columns hold 12 integer digits: refuse an invoice that could not be stored.
    const subtotal = v.items.reduce((s, i) => s.plus(D(i.quantity).mul(i.unitPrice)), D(0));
    if (subtotal.gt("999999999999.99")) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "the invoice is too large: line subtotals must total at most 999,999,999,999.99",
      });
    }
    if (
      v.roundingAdjustment !== undefined &&
      minorUnits(v.currency) === 0 &&
      !D(v.roundingAdjustment).isZero()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["roundingAdjustment"],
        message: `not applicable: ${v.currency} has no minor units to round away`,
      });
    }
    const allowed =
      v.taxRegime === "INDIA_GST" ? GST_RATES : v.taxRegime === "UK_VAT" ? UK_VAT_RATES : null;
    if (allowed) {
      v.items.forEach((item, i) => {
        if (!allowed.some((r) => D(r).eq(item.taxRate))) {
          ctx.addIssue({
            code: "custom",
            path: ["items", i, "taxRate"],
            message: `must be one of ${allowed.join(", ")}%`,
          });
        }
      });
    }
    if (v.discount?.type === "PERCENT" && D(v.discount.value).gt(100)) {
      ctx.addIssue({ code: "custom", path: ["discount", "value"], message: "at most 100%" });
    }
  });

export type InvoiceDraftInput = z.infer<typeof InvoiceDraftInputSchema>;

/** Register filters (query string → typed). `status` is the derived display status. */
export const InvoiceFiltersSchema = z.object({
  fy: fOptional(z.string().regex(/^\d{4}(-\d{2})?$/)),
  from: fOptional(DateStringSchema),
  to: fOptional(DateStringSchema),
  issuerProfileId: fOptional(z.string()),
  clientId: fOptional(z.string()),
  status: fOptional(
    z.enum(["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]),
  ),
  currency: fOptional(CurrencySchema),
  q: fOptional(z.string().trim().max(80)),
  page: z.coerce.number().int().min(1).default(1),
});
export type InvoiceFilters = z.infer<typeof InvoiceFiltersSchema>;
