"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { Input as BeuiInput } from "@/components/motion/input";
import { KEYBOARD_INPUT_PATTERN, stripToKeyboard } from "@/lib/input-charset";
import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<"input"> & { invalid?: boolean };

/** Text-like types whose value is kept to the keyboard charset (SPEC.md §6.6). */
const GUARDED_TYPES: ReadonlySet<string> = new Set(["text", "search", "email", "url", "tel"]);

/**
 * Strips disallowed characters as they are typed or pasted, keeping the caret in place, then
 * hands the (clean) event on. Passwords are not guarded: they are hashed, never rendered.
 * Used by Textarea, which stays a native element.
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

const FIELD =
  "h-8 rounded-md border-input bg-surface-1 transition-colors duration-150 data-[state=focused]:border-primary data-[state=focused]:ring-2 data-[state=focused]:ring-ring/50 data-[state=error]:border-semantic-danger data-[state=error]:ring-0 disabled:opacity-50";
const INNER =
  "h-8 px-3 text-app-body text-ink placeholder:text-ink-tertiary disabled:cursor-not-allowed";

/**
 * The shared text input: the beui field (focus and error motion) around a native input that
 * keeps its id, name, pattern and form semantics, with the keyboard-charset guard applied to
 * every text-like type. Consumers keep the native `onChange(event)` contract.
 */
export function Input({
  className,
  invalid,
  type = "text",
  onChange,
  value,
  defaultValue,
  ref,
  ...props
}: InputProps) {
  const t = useTranslations("ui");
  const guarded = GUARDED_TYPES.has(type);
  const inner = React.useRef<HTMLInputElement | null>(null);
  const controlled = value !== undefined;
  const [own, setOwn] = React.useState(() => (defaultValue == null ? "" : String(defaultValue)));
  const shown = controlled ? (value == null ? "" : String(value)) : own;

  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const handle = (next: string) => {
    const clean = guarded ? stripToKeyboard(next) : next;
    if (!controlled) setOwn(clean);
    const el = inner.current;
    if (!el) return;
    if (el.value !== clean) el.value = clean;
    // Consumers read `e.target.value` / `e.currentTarget`; the native element is the target.
    onChange?.({ target: el, currentTarget: el } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <BeuiInput
      ref={setRef}
      type={type}
      value={shown}
      onChange={handle}
      error={Boolean(invalid || props["aria-invalid"])}
      className={cn("min-w-0", className)}
      classNames={{
        root: "gap-0",
        field: FIELD,
        input: cn(INNER, type === "number" && "text-right font-mono tabular-nums", className),
      }}
      data-slot="input"
      {...(guarded ? { pattern: KEYBOARD_INPUT_PATTERN, title: t("inputCharset") } : {})}
      {...props}
    />
  );
}
