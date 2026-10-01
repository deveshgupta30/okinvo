import type { FieldErrors, ParseResult } from "@/lib/forms";
import { isDalError } from "@/server/dal/errors";

/** What `useActionState` receives back from a form action. Success redirects, so it never returns. */
export type ActionState = {
  ok: false;
  fieldErrors: FieldErrors;
  message: string;
  /** Submitted values (dotted keys), so the form can re-render what the person typed. */
  values: Record<string, string>;
} | null;

export function valuesOf(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string" || k.startsWith("$ACTION")) continue;
    out[k] = k in out ? `${out[k]},${v}` : v;
  }
  return out;
}

export function failedParse(
  result: Extract<ParseResult<unknown>, { ok: false }>,
  formData: FormData,
): ActionState {
  return {
    ok: false,
    fieldErrors: result.fieldErrors,
    message: result.message,
    values: valuesOf(formData),
  };
}

export function failedWith(error: unknown, formData: FormData): ActionState {
  if (isDalError(error)) {
    return {
      ok: false,
      fieldErrors: error.fieldErrors ?? {},
      message: error.message,
      values: valuesOf(formData),
    };
  }
  throw error;
}

export function errorMessage(error: unknown): string {
  return isDalError(error) ? error.message : "Something went wrong.";
}

export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}
