import { DEFAULT_LOCALE } from "./languages";

/** A message catalogue: nested namespaces of ICU strings (`messages/<locale>.json`). */
export type Messages = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The base catalogue (en-US) with a locale's strings laid over it, so a partial or generated
 * catalogue still renders every key. Keys starting with `@@` are file metadata, never messages.
 */
export function mergeMessages(base: Messages, overlay: Messages | undefined): Messages {
  const out: Messages = {};
  for (const [key, value] of Object.entries(base)) {
    if (key.startsWith("@@")) continue;
    out[key] = isRecord(value) ? mergeMessages(value, undefined) : value;
  }
  if (!overlay) return out;
  for (const [key, value] of Object.entries(overlay)) {
    if (key.startsWith("@@")) continue;
    const current = out[key];
    out[key] =
      isRecord(value) && isRecord(current)
        ? mergeMessages(current, value)
        : isRecord(value)
          ? mergeMessages(value, undefined)
          : value;
  }
  return out;
}

async function readCatalogue(locale: string): Promise<Messages | undefined> {
  try {
    const mod = (await import(`../../../messages/${locale}.json`)) as { default: Messages };
    return mod.default;
  } catch {
    return undefined;
  }
}

/** The merged messages for a locale; a locale without a file gets the base catalogue. */
export async function loadMessages(locale: string): Promise<Messages> {
  const base = (await readCatalogue(DEFAULT_LOCALE)) ?? {};
  const overlay = locale === DEFAULT_LOCALE ? undefined : await readCatalogue(locale);
  return mergeMessages(base, overlay);
}
