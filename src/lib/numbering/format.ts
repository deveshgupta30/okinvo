import { z } from "zod";
import { isDateString, type DateString } from "@/lib/dates";
import { fiscalYearShort } from "./fiscal-year";

/**
 * Document-number formats (SPEC.md §4.2): tokens `{FY}` (26-27), `{FYYYY}` (2026-27), `{YYYY}`,
 * `{YY}`, `{MM}`, `{SEQ}` and `{SEQ:n}` (zero-padded to n, 1-9). Defaults are `INV/{FY}/{SEQ:3}`
 * and `CN/{FY}/{SEQ:3}`. Only `allocateDocumentNumber()` (DAL, Task 12) may obtain the sequence;
 * this module is the pure formatting half. Browser-safe.
 */

export const NUMBER_FORMAT_MAX_LENGTH = 40;

/** One known token, with the capture holding the token body (e.g. "SEQ:3"). */
const KNOWN_TOKEN_SOURCE = String.raw`\{(FYYYY|FY|YYYY|YY|MM|SEQ|SEQ:[1-9])\}`;
const KNOWN_TOKEN_RE = new RegExp(`^${KNOWN_TOKEN_SOURCE}$`);
const ANY_TOKEN_RE = /\{[^{}]*\}/g;
const SEQ_TOKEN_RE = /\{SEQ(?::[1-9])?\}/;
const YEAR_TOKEN_RE = /\{(FYYYY|FY|YYYY|YY)\}/;
/** True when the format carries a fiscal-year token (`{FY}` / `{FYYYY}`), not just a calendar year. */
export const hasFiscalYearToken = (format: string): boolean => /\{(FYYYY|FY)\}/.test(format);
const ALLOWED_CHARS_RE = /^[A-Za-z0-9/_\-.{}:]+$/;

export interface DocumentNumberParts {
  date: DateString;
  fiscalYear: string;
  seq: number;
}

/**
 * Render a number format. Unknown tokens (and `{SEQ:n}` with n outside 1-9) are left verbatim so
 * a mistake is visible rather than silently dropped; `NumberFormatSchema` rejects them up front.
 */
export function formatDocumentNumber(format: string, p: DocumentNumberParts): string {
  if (!isDateString(p.date)) throw new RangeError(`Not a calendar date: ${p.date}`);
  if (!Number.isSafeInteger(p.seq) || p.seq < 0) {
    throw new RangeError(`Sequence must be a non-negative integer, got ${p.seq}`);
  }
  const yyyy = p.date.slice(0, 4);
  const mm = p.date.slice(5, 7);
  const seq = String(p.seq);
  return format.replace(new RegExp(KNOWN_TOKEN_SOURCE, "g"), (_match, token: string) => {
    switch (token) {
      case "FY":
        return fiscalYearShort(p.fiscalYear);
      case "FYYYY":
        return p.fiscalYear;
      case "YYYY":
        return yyyy;
      case "YY":
        return yyyy.slice(2);
      case "MM":
        return mm;
      case "SEQ":
        return seq;
      default:
        // "SEQ:n" - padding never truncates a wider sequence.
        return seq.padStart(Number(token.slice("SEQ:".length)), "0");
    }
  });
}

/**
 * A number format: ≤ 40 characters from `[A-Za-z0-9/_\-.{}:]`, containing `{SEQ}` or `{SEQ:n}`
 * and a year token, and no unknown or unbalanced `{…}` tokens.
 */
export const NumberFormatSchema: z.ZodType<string> = z
  .string()
  .min(1, "number format is required")
  .max(
    NUMBER_FORMAT_MAX_LENGTH,
    `number format must be at most ${NUMBER_FORMAT_MAX_LENGTH} characters`,
  )
  .regex(ALLOWED_CHARS_RE, "only letters, digits and / _ - . { } : are allowed")
  .superRefine((format, ctx) => {
    if (!SEQ_TOKEN_RE.test(format)) {
      ctx.addIssue({ code: "custom", message: "must contain {SEQ} or {SEQ:n} (n from 1 to 9)" });
    }
    // Sequences restart every fiscal year, so without a year token numbers repeat next year.
    if (!YEAR_TOKEN_RE.test(format)) {
      ctx.addIssue({
        code: "custom",
        message: "must contain a year token: {FY}, {FYYYY}, {YYYY} or {YY}",
      });
    }
    for (const token of format.match(ANY_TOKEN_RE) ?? []) {
      if (!KNOWN_TOKEN_RE.test(token)) {
        ctx.addIssue({ code: "custom", message: `unknown token ${token}` });
      }
    }
    if (/[{}]/.test(format.replace(ANY_TOKEN_RE, ""))) {
      ctx.addIssue({ code: "custom", message: "unbalanced braces" });
    }
  });

/** "INV/26-27/001" → "INV-26-27-001": a file-name stem with no path separators. */
export function safeFileStem(number: string): string {
  const stem = number
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return stem || "document";
}
