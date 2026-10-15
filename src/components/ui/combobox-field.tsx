"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/motion/combobox";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra words the filter matches besides the label (a SKU, a company name). */
  keywords?: string[];
  /** Optional group heading; ungrouped options come first. */
  group?: string;
}

/**
 * Plain substring matching over the label and keywords: beui's default is a fuzzy subsequence
 * match, which turns a typed SKU or number into dozens of near misses.
 */
export function containsFilter(_value: string, query: string, keywords: string[]): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return keywords.some((k) => k.toLocaleLowerCase().includes(needle));
}

const TRIGGER =
  "h-8 min-w-0 rounded-md border-input bg-surface-1 px-3 text-app-body text-ink hover:border-input focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/50";
const SURFACE = "rounded-md border-hairline bg-surface-1 text-app-body text-ink shadow-md";

/**
 * A searchable single select on beui's combobox (addendum §3) for long lists: issuer profiles,
 * clients, the catalogue picker. The text box carries the field's id so labels and tests reach
 * it; a hidden input carries `name` so server-action forms post the chosen value.
 */
export function ComboboxField({
  id,
  name,
  label,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  disabled,
  invalid,
  className,
}: {
  id: string;
  name?: string;
  /** The field's visible label: also the text box's accessible name and the list's. */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const t = useTranslations("ui");
  const [own, setOwn] = React.useState(defaultValue ?? "");
  // beui gives the text box its own generated id after spreading props; the field's id must win
  // so the label, the server-action errors and the tests reach the input. React never rewrites
  // an attribute whose prop did not change, so the override sticks.
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  React.useLayoutEffect(() => {
    if (inputRef.current) inputRef.current.id = id;
  }, [id]);
  const current = value ?? own;
  const ungrouped = options.filter((o) => !o.group);
  const groups = new Map<string, ComboboxOption[]>();
  for (const o of options) if (o.group) groups.set(o.group, [...(groups.get(o.group) ?? []), o]);

  const item = (o: ComboboxOption) => (
    <ComboboxItem
      key={o.value}
      value={o.value}
      textValue={o.label}
      {...(o.keywords ? { keywords: o.keywords } : {})}
      className="rounded-sm text-app-body"
    >
      {o.label}
    </ComboboxItem>
  );

  return (
    <div className={cn("relative", className)}>
      <Combobox
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        onValueChange={(next) => {
          setOwn(next);
          onValueChange?.(next);
        }}
        filter={containsFilter}
        {...(disabled ? { disabled: true } : {})}
      >
        <ComboboxTrigger className={cn(TRIGGER, invalid && "border-semantic-danger")}>
          <ComboboxInput
            ref={inputRef}
            aria-label={label}
            {...(invalid ? { "aria-invalid": true } : {})}
            placeholder={placeholder ?? t("searchOptions")}
            className="h-8 text-app-body placeholder:text-ink-tertiary"
          />
        </ComboboxTrigger>
        <ComboboxContent className={SURFACE}>
          <ComboboxList ariaLabel={label} className="max-h-64">
            {ungrouped.map(item)}
            {[...groups].map(([heading, items]) => (
              <ComboboxGroup key={heading}>
                <ComboboxLabel className="text-app-label text-ink-subtle">{heading}</ComboboxLabel>
                {items.map(item)}
              </ComboboxGroup>
            ))}
            <ComboboxEmpty className="text-app-caption text-ink-subtle">
              {t("noMatches")}
            </ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </div>
  );
}
