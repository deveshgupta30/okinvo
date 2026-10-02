import { z } from "zod";
import { FONT_IDS } from "@/lib/documents/fonts/catalog";
import { deepFreeze, mergeWithDefaults } from "./display-config";

/**
 * Document template configuration (SPEC.md §4.17, IMPLEMENTATION_PLAN_v2.md §12.2). Stored in
 * `AppSetting['documentTemplate']`, `IssuerProfile.templateConfigOverride` and frozen into
 * `Invoice.templateSnapshot` / `CreditNote.templateSnapshot` at issue. Parameters only: no
 * user markup, CSS or fonts reach the renderer, colours are hex-validated and every text field
 * is length-capped. Browser-safe: drives the live preview.
 */

export const TEMPLATE_IDS = ["ledger", "classic", "compact"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const LABEL_KEYS = [
  "billTo",
  "shipTo",
  "invoice",
  "creditNote",
  "issueDate",
  "dueDate",
  "number",
  "description",
  "sacHsn",
  "qty",
  "unit",
  "rate",
  "tax",
  "amount",
  "subtotal",
  "discount",
  "taxable",
  "total",
  "amountDue",
  "tdsExpected",
  "netExpected",
  "rounding",
  "paymentDetails",
  "notes",
  "terms",
  "placeOfSupply",
  "poReference",
  "amountInWords",
  "signature",
] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb colour");

export const FontIdSchema = z.enum(FONT_IDS);
export type FontId = z.infer<typeof FontIdSchema>;

/**
 * Heading/body font pair. v1 stored a single string ("inter", "ibm-plex-sans",
 * "source-serif-4+inter"); snapshots on issued documents still carry it, so a string maps to a
 * pair: "a+b" is heading a + body b, "a" alone is both.
 */
export const FontPairSchema = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const [heading, body] = v.split("+");
    return { heading, body: body ?? heading };
  },
  z.object({ heading: FontIdSchema, body: FontIdSchema }),
);

export const TemplateConfigSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS),
  paper: z.object({ size: z.enum(["A4", "LETTER"]), margins: z.enum(["normal", "narrow"]) }),
  colors: z.object({ accent: hexColor, text: hexColor }),
  font: FontPairSchema,
  logo: z.object({
    position: z.enum(["left", "right", "center"]),
    heightMm: z.number().min(8).max(40),
  }),
  title: z
    .object({ mode: z.enum(["auto", "custom"]), custom: z.string().max(40).optional() })
    .superRefine((t, ctx) => {
      if (t.mode === "custom" && !t.custom?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["custom"],
          message: "custom title text is required when the title mode is custom",
        });
      }
    }),
  // Zod 4: `z.record(enum, …)` is exhaustive; `partialRecord` is the optional-keys form.
  labels: z.partialRecord(z.enum(LABEL_KEYS), z.string().max(40)),
  table: z.object({ style: z.enum(["ruled", "zebra", "plain"]) }),
  totals: z.object({
    showSubtotal: z.boolean(),
    showDiscount: z.boolean(),
    showTaxLines: z.boolean(),
    showTdsExpected: z.boolean(),
    showRounding: z.boolean(),
    amountInWords: z.enum(["below-total", "footer", "hidden"]),
  }),
  text: z.object({
    headerNote: z.string().max(300).optional(),
    footer: z.string().max(300).optional(),
    signatureCaption: z.string().max(60).optional(),
    draftWatermark: z.string().max(40),
  }),
  qr: z.object({ position: z.enum(["header", "footer", "beside-totals"]) }),
  pageNumbers: z.boolean(),
});

export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = deepFreeze({
  templateId: "ledger",
  paper: { size: "A4", margins: "normal" },
  colors: { accent: "#5e6ad2", text: "#1a1a1a" },
  font: { heading: "inter", body: "inter" },
  logo: { position: "left", heightMm: 16 },
  title: { mode: "auto" },
  labels: {},
  table: { style: "ruled" },
  totals: {
    showSubtotal: true,
    showDiscount: true,
    showTaxLines: true,
    showTdsExpected: true,
    showRounding: true,
    amountInWords: "below-total",
  },
  text: { draftWatermark: "DRAFT — not a tax invoice" },
  qr: { position: "footer" },
  pageNumbers: true,
});

/** Deep-merge a partial config over the defaults, then parse. Throws on invalid input. */
export function mergeTemplateConfig(partial: unknown): TemplateConfig {
  return mergeWithDefaults(TemplateConfigSchema, DEFAULT_TEMPLATE_CONFIG, partial);
}

export const DEFAULT_LABELS: Record<LabelKey, string> = deepFreeze({
  billTo: "Bill to",
  shipTo: "Ship to",
  invoice: "Invoice",
  creditNote: "Credit note",
  issueDate: "Issue date",
  dueDate: "Due date",
  number: "Number",
  description: "Description",
  sacHsn: "SAC/HSN",
  qty: "Qty",
  unit: "Unit",
  rate: "Rate",
  tax: "Tax",
  amount: "Amount",
  subtotal: "Subtotal",
  discount: "Discount",
  taxable: "Taxable amount",
  total: "Total",
  amountDue: "Amount due",
  tdsExpected: "TDS expected",
  netExpected: "Net expected",
  rounding: "Rounding",
  paymentDetails: "Payment details",
  notes: "Notes",
  terms: "Terms",
  placeOfSupply: "Place of supply",
  poReference: "PO reference",
  amountInWords: "Amount in words",
  signature: "Authorised signatory",
});

/** Defaults with the config's overrides applied for the keys it names. Returns a fresh object. */
export function resolveLabels(config: TemplateConfig): Record<LabelKey, string> {
  const out: Record<LabelKey, string> = { ...DEFAULT_LABELS };
  for (const key of LABEL_KEYS) {
    const value = config.labels[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
