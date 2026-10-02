import * as React from "react";
import {
  INPUT_CHARSET_MESSAGE,
  KEYBOARD_INPUT_PATTERN,
  stripToKeyboard,
} from "@/lib/input-charset";
import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<"input"> & { invalid?: boolean };

/** Text-like types whose value is kept to the keyboard charset (SPEC.md §6.6). */
const GUARDED_TYPES: ReadonlySet<string> = new Set(["text", "search", "email", "url", "tel"]);

/**
 * Strips disallowed characters as they are typed or pasted, keeping the caret in place, then
 * hands the (clean) event on. Passwords are not guarded: they are hashed, never rendered.
 */
export function guardTextInput<E extends HTMLInputElement | HTMLTextAreaElement>(
  onChange: React.ChangeEventHandler<E> | undefined,
): React.ChangeEventHandler<E> {
  return (e) => {
    const el = e.target;
    const clean = stripToKeyboard(el.value);
    if (clean !== el.value) {
      const end = el.selectionEnd ?? clean.length;
      const caret = Math.max(0, end - (el.value.length - clean.length));
      el.value = clean;
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        // some input types refuse selection ranges; the value is what matters
      }
    }
    onChange?.(e);
  };
}

export function Input({ className, invalid, type = "text", onChange, ...props }: InputProps) {
  const guarded = GUARDED_TYPES.has(type);
  return (
    <input
      type={type}
      data-slot="input"
      aria-invalid={invalid || props["aria-invalid"]}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-surface-1 px-3 text-app-body text-ink transition-colors duration-150 outline-none placeholder:text-ink-tertiary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-semantic-danger",
        type === "number" && "text-right font-mono tabular-nums",
        className,
      )}
      {...(guarded ? { pattern: KEYBOARD_INPUT_PATTERN, title: INPUT_CHARSET_MESSAGE } : {})}
      {...props}
      onChange={guarded ? guardTextInput(onChange) : onChange}
    />
  );
}
