"use client";

import * as React from "react";
import { Switch as BeuiSwitch } from "@/components/motion/switch";
import { cn } from "@/lib/utils";

export type SwitchProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Visible label; also the accessible name of the switch. */
  label: string;
};

/**
 * Boolean setting: beui's spring switch (`role="switch"`) in front of a visually hidden native
 * checkbox that carries the name for form posts. Same contract as Checkbox.
 */
export function Switch({
  className,
  label,
  checked,
  defaultChecked,
  onChange,
  disabled,
  name,
  value,
  ...rest
}: SwitchProps) {
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
    <span className={cn("inline-flex items-center", className)}>
      <BeuiSwitch
        checked={current}
        onCheckedChange={toggle}
        label={label}
        {...(disabled !== undefined ? { disabled } : {})}
      />
      <input
        ref={hidden}
        type="checkbox"
        name={name}
        value={value}
        checked={current}
        disabled={disabled}
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        {...rest}
      />
    </span>
  );
}
