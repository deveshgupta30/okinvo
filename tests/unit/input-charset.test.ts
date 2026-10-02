import { describe, expect, it } from "vitest";
import { parseForm, parseObject } from "@/lib/forms";
import {
  assertKeyboardInput,
  findDisallowed,
  firstDisallowed,
  INPUT_CHARSET_MESSAGE,
  isKeyboardText,
  KEYBOARD_CHARS,
  KEYBOARD_INPUT_PATTERN,
  stripToKeyboard,
} from "@/lib/input-charset";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { z } from "zod";

/**
 * Every text field accepts only standard keyboard characters (SPEC.md §8.4). The set is the
 * owner's list verbatim plus space, tab and newline; backslash and pipe are not on it.
 */
describe("keyboard charset", () => {
  it("is exactly the listed characters plus keyboard whitespace", () => {
    expect(KEYBOARD_CHARS).toBe(
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`~!@#$%^&*()_-+=}]{[\"':;?/>.<,",
    );
    expect(isKeyboardText(KEYBOARD_CHARS)).toBe(true);
    expect(isKeyboardText("line one\nline two\ttabbed, spaced")).toBe(true);
    expect(isKeyboardText("")).toBe(true);
  });

  it("rejects everything else, including backslash, pipe and look-alikes", () => {
    for (const bad of ["\\", "|", "—", "–", "“", "’", "ß", "é", "₹", "日", "​", "\u0000"]) {
      expect(isKeyboardText(`abc${bad}def`), JSON.stringify(bad)).toBe(false);
      expect(firstDisallowed(`abc${bad}def`)).toBe(bad);
    }
    expect(stripToKeyboard("Müller — Co|\\ 1")).toBe("Mller  Co 1");
  });

  it("the HTML pattern accepts the single-line set and nothing more", () => {
    const re = new RegExp(`^(?:${KEYBOARD_INPUT_PATTERN})$`);
    expect(re.test(KEYBOARD_CHARS + " ")).toBe(true);
    expect(re.test("a—b")).toBe(false);
    expect(re.test("a\\b")).toBe(false);
    expect(re.test("a|b")).toBe(false);
  });

  it("finds offending strings and keys anywhere in a submitted value", () => {
    expect(findDisallowed({ a: "ok", b: { c: ["fine", "bad—"] } })).toEqual([
      { path: "b.c.1", char: "—" },
    ]);
    expect(findDisallowed({ ké: "x" })).toEqual([{ path: "ké", char: "é" }]);
    expect(findDisallowed("plain")).toEqual([]);
    expect(() => assertKeyboardInput({ note: "fine" })).not.toThrow();
    expect(() => assertKeyboardInput({ note: "curly “quote”" })).toThrow(INPUT_CHARSET_MESSAGE);
  });
});

describe("parseForm / parseObject enforce the charset before the schema", () => {
  it("returns a field error on the offending path and keeps other Zod errors", () => {
    const fd = new FormData();
    fd.append("displayName", "Ács & Co.");
    fd.append("email", "not-an-email");
    const r = parseForm(ClientInputSchema, fd);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.displayName).toEqual([INPUT_CHARSET_MESSAGE]);
    expect(r.fieldErrors.email?.length).toBeGreaterThan(0);
    expect(r.message).toBe(INPUT_CHARSET_MESSAGE);
  });

  it("accepts keyboard text and nested objects", () => {
    const schema = z.object({ notes: z.string(), tags: z.array(z.string()) });
    const r = parseObject(schema, { notes: "Paid by NEFT; ref #42 (Q2)", tags: ["a", "b-c"] });
    expect(r.ok).toBe(true);
    const bad = parseObject(schema, { notes: "ok", tags: ["a", "b–c"] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors["tags.1"]).toEqual([INPUT_CHARSET_MESSAGE]);
  });
});
