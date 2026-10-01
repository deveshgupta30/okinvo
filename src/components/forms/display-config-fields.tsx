import { Checkbox } from "@/components/ui/checkbox";
import type { DisplayConfig } from "@/lib/schemas";

const GROUP_LABELS: Record<keyof DisplayConfig, string> = {
  issuer: "Issuer details",
  client: "Client details",
  document: "Document sections",
};

export function labelForDisplayKey(key: string): string {
  const words = key
    .replace(/^show/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** Checkbox matrix over the display config; names are `<prefix>.<group>.<key>`. */
export function DisplayConfigFields({ prefix, config }: { prefix: string; config: DisplayConfig }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {(Object.keys(config) as (keyof DisplayConfig)[]).map((group) => (
        <fieldset key={group} className="flex flex-col gap-2">
          <legend className="mb-2 text-app-label text-ink-subtle">{GROUP_LABELS[group]}</legend>
          {Object.entries(config[group]).map(([key, on]) => (
            <Checkbox
              key={key}
              name={`${prefix}.${group}.${key}`}
              defaultChecked={on}
              label={labelForDisplayKey(key)}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}
