/**
 * The input charset (SPEC.md §6.6): every text field, on the client and at every server boundary,
 * accepts only the characters on a standard keyboard. Anything else (curly quotes, typographic dashes,
 * accented or non-Latin letters, control characters, zero-width marks) is rejected before a
 * schema sees it. Browser-safe: the shared Input/Textarea components strip as you type.
 *
 * The set is the owner's list verbatim, plus the whitespace a keyboard produces (space, tab,
 * newline). Backslash and the pipe are deliberately not on the list.
 */
export const KEYBOARD_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`~!@#$%^&*()_-+=}]{[\"':;?/>.<,";

export const KEYBOARD_WHITESPACE = " \t\n\r";

const ALLOWED: ReadonlySet<string> = new Set([...KEYBOARD_CHARS, ...KEYBOARD_WHITESPACE]);

export const INPUT_CHARSET_MESSAGE = "Only standard keyboard characters are allowed.";

/** The first character outside the set, or null when the text is clean. */
export function firstDisallowed(text: string): string | null {
  for (const ch of text) if (!ALLOWED.has(ch)) return ch;
  return null;
}

export function isKeyboardText(text: string): boolean {
  return firstDisallowed(text) === null;
}

/** The text with every disallowed character removed (what the client keeps as you type). */
export function stripToKeyboard(text: string): string {
  let out = "";
  for (const ch of text) if (ALLOWED.has(ch)) out += ch;
  return out;
}

/** HTML `pattern` for single-line fields: the keyboard set without tab and newlines. */
export const KEYBOARD_INPUT_PATTERN = "[A-Za-z0-9 `~!@#$%^&*()_\\-+=}\\]{\\[\"':;?/>.<,]*";

export interface DisallowedInput {
  /** Dotted path into the submitted value (empty for a bare string). */
  path: string;
  char: string;
}

/**
 * Walks a submitted value (form object, JSON body, query filters) and lists every string that
 * carries a disallowed character. Keys are checked too: a key is user input in a JSON body.
 */
export function findDisallowed(value: unknown, path: string[] = []): DisallowedInput[] {
  const out: DisallowedInput[] = [];
  const visit = (v: unknown, p: string[]) => {
    if (typeof v === "string") {
      const ch = firstDisallowed(v);
      if (ch !== null) out.push({ path: p.join("."), char: ch });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => visit(item, [...p, String(i)]));
    } else if (v && typeof v === "object") {
      for (const [k, item] of Object.entries(v)) {
        const ch = firstDisallowed(k);
        if (ch !== null) out.push({ path: [...p, k].join("."), char: ch });
        visit(item, [...p, k]);
      }
    }
  };
  visit(value, path);
  return out;
}

export class InputCharsetError extends Error {
  readonly violations: DisallowedInput[];
  constructor(violations: DisallowedInput[]) {
    super(INPUT_CHARSET_MESSAGE);
    this.name = "InputCharsetError";
    this.violations = violations;
  }
}

/** Throws InputCharsetError when any string in the value falls outside the keyboard set. */
export function assertKeyboardInput(value: unknown): void {
  const violations = findDisallowed(value);
  if (violations.length) throw new InputCharsetError(violations);
}
