"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectInput,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/motion/multi-select";
import { containsFilter } from "@/components/ui/combobox-field";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * A searchable multi select on beui's multi-select (addendum §3), used for the issuer-profile
 * tags of catalogue items. Every chosen value is posted as its own hidden input under `name`,
 * exactly like the checkbox group it replaces, so the server actions do not change.
 */
export function MultiSelectField({
  name,
  label,
  options,
  defaultValue = [],
  placeholder,
  className,
}: {
  name: string;
  /** The accessible name of the text box and the list. */
  label: string;
  options: MultiSelectOption[];
  defaultValue?: readonly string[];
  placeholder?: string;
  className?: string;
}) {
  const t = useTranslations("ui");
  const [values, setValues] = React.useState<string[]>([...defaultValue]);
  return (
    <div className={cn("relative", className)}>
      <MultiSelect value={values} onValueChange={setValues} filter={containsFilter}>
        <MultiSelectTrigger className="min-h-8 rounded-md border-input bg-surface-1 px-2 py-1 text-app-body text-ink focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/50 hover:border-input">
          <MultiSelectValue
            placeholder={placeholder ?? t("searchOptions")}
            chipClassName="rounded-sm bg-surface-3 text-app-caption text-ink"
          />
          <MultiSelectInput
            aria-label={label}
            placeholder={values.length === 0 ? "" : t("searchOptions")}
            className="h-6 text-app-body placeholder:text-ink-tertiary"
          />
        </MultiSelectTrigger>
        <MultiSelectContent className="rounded-md border-hairline bg-surface-1 text-app-body text-ink shadow-md">
          <MultiSelectList ariaLabel={label} className="max-h-64">
            {options.map((o) => (
              <MultiSelectItem
                key={o.value}
                value={o.value}
                textValue={o.label}
                className="rounded-sm"
              >
                {o.label}
              </MultiSelectItem>
            ))}
            <MultiSelectEmpty className="text-app-caption text-ink-subtle">
              {t("noMatches")}
            </MultiSelectEmpty>
          </MultiSelectList>
        </MultiSelectContent>
      </MultiSelect>
      {values.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
    </div>
  );
}
