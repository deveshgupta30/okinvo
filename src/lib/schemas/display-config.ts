import { z } from "zod";

/**
 * Per-invoice display config (SPEC.md §4.6 "Display config"): which issuer fields, client fields,
 * columns and sections print. Reproduces the v1 plan §6 `InvoiceDisplayConfig` interface verbatim
 * plus the five `document.*` additions from v2 §7.3. Stored in `Invoice.displayConfig` and
 * `IssuerProfile.defaultDisplayConfig`. Browser-safe: runs in the live preview.
 */

const IssuerDisplaySchema = z.object({
  showLogo: z.boolean(),
  showTradeName: z.boolean(),
  showDesignation: z.boolean(),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  showWebsite: z.boolean(),
  showFullAddress: z.boolean(),
  showPan: z.boolean(),
  showGstin: z.boolean(),
  showCin: z.boolean(),
  showLut: z.boolean(),
  showSignature: z.boolean(),
  showStamp: z.boolean(),
});

const ClientDisplaySchema = z.object({
  showContactPerson: z.boolean(),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  showBillingAddress: z.boolean(),
  showShippingAddress: z.boolean(),
  showTaxIdentifier: z.boolean(),
  showPlaceOfSupply: z.boolean(),
});

const DocumentDisplaySchema = z.object({
  showDueDate: z.boolean(),
  showPaymentTerms: z.boolean(),
  showSacCodeColumn: z.boolean(),
  showQuantityColumn: z.boolean(),
  showUnitPriceColumn: z.boolean(),
  showTaxColumn: z.boolean(),
  showTdsBreakdown: z.boolean(),
  showQrVerification: z.boolean(),
  showNotes: z.boolean(),
  showTerms: z.boolean(),
  // v2 §7.3 additions
  showReplacesReference: z.boolean(),
  showAmountInWords: z.boolean(),
  showPlaceOfSupply: z.boolean(),
  showSupplyStatement: z.boolean(),
  showRoundingLine: z.boolean(),
  showSku: z.boolean(),
});

export const DisplayConfigSchema = z.object({
  issuer: IssuerDisplaySchema,
  client: ClientDisplaySchema,
  document: DocumentDisplaySchema,
});

export type DisplayConfig = z.infer<typeof DisplayConfigSchema>;

// ───────────────────────── shared helpers (also used by template-config) ─────────────────────────

export type PlainObject = Record<string, unknown>;

export function isPlainObject(v: unknown): v is PlainObject {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Deep-merge `patch` over `base`: nested plain objects merge recursively, everything else
 * (arrays, primitives, null) replaces. `undefined` values in the patch are ignored so a partial
 * form payload keeps the base value. Neither argument is mutated.
 */
export function deepMerge(base: PlainObject, patch: PlainObject): PlainObject {
  const out: PlainObject = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || UNSAFE_KEYS.has(key)) continue;
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return out;
}

/** Recursively freezes a defaults object so consumers cannot mutate it by accident. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) deepFreeze(inner);
  }
  return value;
}

/**
 * Merge an arbitrary partial over `defaults` and validate it with `schema`. `null`/`undefined`
 * yield the defaults (a `Json?` column that was never set); anything invalid throws a ZodError.
 */
export function mergeWithDefaults<T extends PlainObject>(
  schema: z.ZodType<T>,
  defaults: T,
  partial: unknown,
): T {
  if (partial === null || partial === undefined) return schema.parse(defaults);
  const merged = isPlainObject(partial) ? deepMerge(defaults, partial) : partial;
  return schema.parse(merged);
}

// ───────────────────────── defaults ─────────────────────────

/** All true except issuer.showPan, issuer.showStamp, client.showShippingAddress, document.showTdsBreakdown. */
export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = deepFreeze({
  issuer: {
    showLogo: true,
    showTradeName: true,
    showDesignation: true,
    showEmail: true,
    showPhone: true,
    showWebsite: true,
    showFullAddress: true,
    showPan: false,
    showGstin: true,
    showCin: true,
    showLut: true,
    showSignature: true,
    showStamp: false,
  },
  client: {
    showContactPerson: true,
    showEmail: true,
    showPhone: true,
    showBillingAddress: true,
    showShippingAddress: false,
    showTaxIdentifier: true,
    showPlaceOfSupply: true,
  },
  document: {
    showDueDate: true,
    showPaymentTerms: true,
    showSacCodeColumn: true,
    showQuantityColumn: true,
    showUnitPriceColumn: true,
    showTaxColumn: true,
    showTdsBreakdown: false,
    showQrVerification: true,
    showNotes: true,
    showTerms: true,
    showReplacesReference: true,
    showAmountInWords: true,
    showPlaceOfSupply: true,
    showSupplyStatement: true,
    showRoundingLine: true,
    showSku: true,
  },
});

/** Deep-merge a partial config over the defaults, then parse. Throws on invalid input. */
export function mergeDisplayConfig(partial: unknown): DisplayConfig {
  return mergeWithDefaults(DisplayConfigSchema, DEFAULT_DISPLAY_CONFIG, partial);
}
