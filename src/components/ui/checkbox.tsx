"use client";

import * as React from "react";
import { Checkbox as BeuiCheckbox } from "@/components/motion/checkbox";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<React.ComponentProps<"input">, "type"> & {
  label: React.ReactNode;
  description?: React.ReactNode;
};

/**
 * The shared checkbox: beui's drawn checkmark (a `role="checkbox"` button that carries the id,
 * so labels and tests reach it) in front of a visually hidden native checkbox that carries the
 * name and value for form posts. Consumers keep `name`, `checked` / `defaultChecked` and the
 * native `onChange(event)` contract.
 */
export function Checkbox({
  className,
  label,
  description,
  id,
  checked,
  defaultChecked,
  onChange,
  disabled,
  name,
  value,
  required,
  ...rest
}: CheckboxProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const controlled = checked !== undefined;
  const [own, setOwn] = React.useState(Boolean(defaultChecked));
  const current = controlled ? Boolean(checked) : own;
  const hidden = React.useRef<HTMLInputElement | null>(null);

  const toggle = (next: boolean) => {
    if (!controlled) setOwn(next);
    const el = hidden.current;
    if (!el) return;
    el.checked = next;
    onChange?.({ target: el, currentTarget: el } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <span className={cn("inline-flex items-start gap-2", className)}>
      <BeuiCheckbox
        id={inputId}
        checked={current}
        onCheckedChange={toggle}
        className="mt-[1px]"
        {...(disabled !== undefined ? { disabled } : {})}
        {...(rest["aria-describedby"] ? { "aria-describedby": rest["aria-describedby"] } : {})}
      />
      <input
        ref={hidden}
        type="checkbox"
        name={name}
        value={value}
        checked={current}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        {...rest}
      />
      <label
        htmlFor={inputId}
        className={cn("flex flex-col", disabled ? "cursor-not-allowed" : "cursor-pointer")}
      >
        <span className="text-app-body text-ink">{label}</span>
        {description ? (
          <span className="text-app-caption text-ink-subtle">{description}</span>
        ) : null}
      </label>
    </span>
  );
}
