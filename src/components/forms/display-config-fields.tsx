import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import type { DisplayConfig } from "@/lib/schemas";

/** Every display toggle name; its label is `invoices.display.fields.<key>` in the catalogue. */
type DisplayKey = {
  [G in keyof DisplayConfig]: keyof DisplayConfig[G];
}[keyof DisplayConfig];

/**
 * Checkbox matrix over the display config; names are `<prefix>.<group>.<key>`. Uncontrolled by
 * default (profile form); pass `onChange` to drive it from state (invoice builder).
 */
export function DisplayConfigFields({
  prefix,
  config,
  onChange,
}: {
  prefix: string;
  config: DisplayConfig;
  onChange?: (config: DisplayConfig) => void;
}) {
  const t = useTranslations("invoices.display");
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {(Object.keys(config) as (keyof DisplayConfig)[]).map((group) => (
        <fieldset key={group} className="flex flex-col gap-2">
          <legend className="mb-2 text-app-label text-ink-subtle">{t(`groups.${group}`)}</legend>
          {Object.entries(config[group]).map(([key, on]) => (
            <Checkbox
              key={key}
              name={`${prefix}.${group}.${key}`}
              label={t(`fields.${key as DisplayKey}`)}
              {...(onChange
                ? {
                    checked: on,
                    onChange: (e) =>
                      onChange({
                        ...config,
                        [group]: { ...config[group], [key]: e.target.checked },
                      } as DisplayConfig),
                  }
                : { defaultChecked: on })}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}
