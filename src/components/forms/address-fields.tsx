import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/forms";
import type { Address } from "@/lib/schemas";

/** Address block without the country (the owning form has one country select for everything). */
export function AddressFields({
  prefix,
  defaults,
  values,
  errors,
  hideState,
}: {
  prefix: string;
  defaults?: Partial<Address> | null | undefined;
  values?: Record<string, string> | undefined;
  errors?: FieldErrors | undefined;
  hideState?: boolean;
}) {
  const val = (k: keyof Address) => values?.[`${prefix}.${k}`] ?? defaults?.[k] ?? "";
  const err = (k: keyof Address) => errors?.[`${prefix}.${k}`];
  return (
    <FieldGroup>
      <Field label="Address line 1" htmlFor={`${prefix}.line1`} error={err("line1")} required>
        <Input id={`${prefix}.line1`} name={`${prefix}.line1`} defaultValue={val("line1")} />
      </Field>
      <Field label="Address line 2" htmlFor={`${prefix}.line2`} error={err("line2")}>
        <Input id={`${prefix}.line2`} name={`${prefix}.line2`} defaultValue={val("line2")} />
      </Field>
      <Field label="City" htmlFor={`${prefix}.city`} error={err("city")} required>
        <Input id={`${prefix}.city`} name={`${prefix}.city`} defaultValue={val("city")} />
      </Field>
      {hideState ? null : (
        <Field label="State / region" htmlFor={`${prefix}.state`} error={err("state")}>
          <Input id={`${prefix}.state`} name={`${prefix}.state`} defaultValue={val("state")} />
        </Field>
      )}
      <Field label="Postal code" htmlFor={`${prefix}.postalCode`} error={err("postalCode")}>
        <Input
          id={`${prefix}.postalCode`}
          name={`${prefix}.postalCode`}
          defaultValue={val("postalCode")}
        />
      </Field>
    </FieldGroup>
  );
}
