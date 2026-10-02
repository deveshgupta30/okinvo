import { z } from "zod";
import { D } from "@/lib/money";
import { DEFAULT_DISPLAY_CONFIG, type DisplayConfig } from "@/lib/schemas/display-config";
import { parseEmailList } from "@/lib/schemas/smtp";

/**
 * FormData → plain object → Zod. Server actions call `parseForm(schema, formData)` and return
 * `{ ok: false, fieldErrors }` to the form instead of throwing (v2 §10).
 */
export type FieldErrors = Record<string, string[]>;

export type ParseResult<T> =
  { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors; message: string };

type Node = Record<string, unknown> | unknown[];

function setPath(root: Record<string, unknown>, path: string, value: string): void {
  // "items[0].description" → ["items", "0", "description"]
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let node: Node = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]!;
    const last = i === parts.length - 1;
    const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]!);
    if (Array.isArray(node)) {
      const idx = Number(key);
      if (last) {
        node[idx] = value;
      } else {
        node[idx] ??= nextIsIndex ? [] : {};
        node = node[idx] as Node;
      }
    } else {
      if (last) {
        const existing = node[key];
        if (existing === undefined) node[key] = value;
        else if (Array.isArray(existing)) existing.push(value);
        else node[key] = [existing, value];
      } else {
        node[key] ??= nextIsIndex ? [] : {};
        node = node[key] as Node;
      }
    }
  }
}

/** Dotted/indexed keys nest; repeated keys become arrays; files and Next internals are dropped. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("$ACTION")) continue;
    setPath(out, key, value);
  }
  return out;
}

export function parseForm<T>(schema: z.ZodType<T>, formData: FormData): ParseResult<T> {
  return parseObject(schema, formToObject(formData));
}

export function parseObject<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors, message: "Please correct the highlighted fields." };
}

// ───── field coercions for HTML forms ─────

/** Checkbox: present ("on"/"true") → true; absent → false. */
export const fBool = z.preprocess(
  (v) => v === true || v === "on" || v === "true" || v === "1",
  z.boolean(),
);

/** "" and null mean "not provided" for optional inputs. */
export function fOptional<S extends z.ZodType>(schema: S) {
  return z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    schema.optional(),
  );
}

/** Decimal text with up to `places` fraction digits; grouping commas/spaces tolerated; normalised. */
export function fDecimal(places: number) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[,\s]/g, "") : v),
    z
      .string()
      .regex(/^-?\d+(\.\d+)?$/, "must be a number")
      .refine((v) => (v.split(".")[1]?.length ?? 0) <= places, {
        message: `at most ${places} decimal places`,
      })
      .transform((v) => D(v).toFixed(places)),
  );
}

export const fInt = z.preprocess(
  (v) => (typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v),
  z.number().int("must be a whole number"),
);

/** A textarea of addresses separated by commas, semicolons or newlines. */
export const fEmailList = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string") return v;
    try {
      return parseEmailList(v);
    } catch (e) {
      return [(e as Error).message];
    }
  },
  z.array(z.email("contains an invalid address")).max(10),
);

export function fieldError(errors: FieldErrors | undefined, key: string): string[] | undefined {
  return errors?.[key];
}

/** Display-config checkboxes are named `<prefix>.<group>.<key>`; presence means true. */
export function readDisplayConfigFromForm(formData: FormData, prefix: string): DisplayConfig {
  const out: Record<string, Record<string, boolean>> = {};
  for (const [group, keys] of Object.entries(DEFAULT_DISPLAY_CONFIG)) {
    out[group] = {};
    for (const key of Object.keys(keys)) {
      out[group][key] = formData.has(`${prefix}.${group}.${key}`);
    }
  }
  return out as unknown as DisplayConfig;
}

/** Checkbox groups post one string, several strings, or nothing: always an array of ids. */
export const fIdList = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string().trim().min(1).max(64)).max(50),
);
