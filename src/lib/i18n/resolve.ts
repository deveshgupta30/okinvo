import { canonicalLocale, DEFAULT_LOCALE, LANGUAGES, type LanguageTag } from "./languages";

/**
 * Which UI language a request gets (spec §8.1): the signed-in user's stored choice, then the
 * `okinvo.locale` cookie, then the best Accept-Language match, then English (US). Every step
 * ignores values outside the language table.
 */
export interface LocaleSources {
  user?: string | null | undefined;
  cookie?: string | null | undefined;
  acceptLanguage?: string | null | undefined;
}

const TAG = /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/;

/** Accept-Language tags ordered by quality (ties keep header order); wildcards and junk dropped. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  const entries: { tag: string; q: number; i: number }[] = [];
  header.split(",").forEach((part, i) => {
    const [rawTag = "", ...params] = part.trim().split(";");
    const tag = rawTag.trim();
    if (!tag || tag === "*" || !TAG.test(tag)) return;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
      if (m) q = Number(m[1]);
    }
    if (!(q > 0)) return;
    entries.push({ tag, q, i });
  });
  return entries.sort((a, b) => b.q - a.q || a.i - b.i).map((e) => e.tag);
}

/**
 * The first candidate that names a supported language: an exact tag (case-insensitive), else the
 * first table entry sharing its language subtag (`de-AT` → `de`, `fr` → `fr-CA`).
 */
export function matchLocale(candidates: readonly string[]): LanguageTag | undefined {
  for (const candidate of candidates) {
    const exact = canonicalLocale(candidate);
    if (exact) return exact;
    const base = candidate.split("-")[0]!.toLowerCase();
    const baseOf = (tag: string) => tag.split("-")[0]!.toLowerCase();
    if (baseOf(DEFAULT_LOCALE) === base) return DEFAULT_LOCALE; // "en" means the default English
    const sameLanguage = LANGUAGES.find((l) => baseOf(l.tag) === base);
    if (sameLanguage) return sameLanguage.tag;
  }
  return undefined;
}

export function resolveLocale(sources: LocaleSources): LanguageTag {
  const fromUser = sources.user ? canonicalLocale(sources.user) : undefined;
  if (fromUser) return fromUser;
  const fromCookie = sources.cookie ? canonicalLocale(sources.cookie) : undefined;
  if (fromCookie) return fromCookie;
  return matchLocale(parseAcceptLanguage(sources.acceptLanguage)) ?? DEFAULT_LOCALE;
}
