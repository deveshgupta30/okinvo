import type { LabelKey } from "@/lib/schemas/template-config";
import base from "../../../messages/en-US.json";
import { canonicalLocale, DEFAULT_LOCALE } from "./languages";

/**
 * The fixed strings a document prints in its own language (SPEC §4.10): the `documents`
 * namespace of a catalogue minus the app's `documents.ui` screens. Templates read labels from
 * here (behind their own overrides), the title rules pick from `title`, and `text` holds the
 * page footer, the verification caption and the watermarks.
 */
export interface DocumentMessages {
  labels: Record<LabelKey, string>;
  title: { taxInvoice: string; billOfSupply: string; invoice: string; creditNote: string };
  text: {
    pageOf: string;
    scanToVerify: string;
    taxId: string;
    void: string;
    draftWatermark: string;
    /** "{days} days", the payment terms beside the Terms label. */
    paymentTermsDays: string;
    /** E-invoice registration (spec §9e). */
    irn: string;
    ackNo: string;
    ackDate: string;
    einvoiceCancelled: string;
  };
}

const pick = (ns: Record<string, unknown>): DocumentMessages => {
  const { ui: _ui, ...rest } = ns;
  return rest as unknown as DocumentMessages;
};

/** en-US, the source of truth; also the fallback for every missing string. */
export const DEFAULT_DOCUMENT_MESSAGES: DocumentMessages = pick(base.documents);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `fallback` with every string the overlay provides laid over it; the shape is the fallback's. */
function overlay(fallback: Record<string, unknown>, over: unknown): Record<string, unknown> {
  if (!isRecord(over)) return fallback;
  const out: Record<string, unknown> = { ...fallback };
  for (const [key, value] of Object.entries(fallback)) {
    const o = over[key];
    if (isRecord(value)) out[key] = overlay(value, o);
    else if (typeof o === "string" && o.length > 0) out[key] = o;
  }
  return out;
}

const cache = new Map<string, Promise<DocumentMessages>>();

/**
 * The document strings for a language tag, en-US laid underneath so a partial or missing
 * catalogue still prints. Catalogues are loaded the same way the UI loads them, so the bundle
 * carries them without a static import of every file.
 */
export function documentMessages(locale: string): Promise<DocumentMessages> {
  const tag = canonicalLocale(locale) ?? DEFAULT_LOCALE;
  if (tag === DEFAULT_LOCALE) return Promise.resolve(DEFAULT_DOCUMENT_MESSAGES);
  const cached = cache.get(tag);
  if (cached) return cached;
  const pending: Promise<DocumentMessages> = import(`../../../messages/${tag}.json`)
    .then(
      (mod: { default: Record<string, unknown> }) =>
        overlay(
          DEFAULT_DOCUMENT_MESSAGES as unknown as Record<string, unknown>,
          mod.default.documents,
        ) as unknown as DocumentMessages,
    )
    .catch(() => DEFAULT_DOCUMENT_MESSAGES);
  cache.set(tag, pending);
  return pending;
}
