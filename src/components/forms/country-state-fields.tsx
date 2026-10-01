"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COUNTRIES, INDIAN_STATES, indianStateByIso } from "@/lib/countries";
import type { FieldErrors } from "@/lib/forms";

/**
 * Country + state. For India the state is a picker that also fills the GST state code
 * (SPEC §4.2/§4.3); elsewhere it is free text. Field names: countryCode, stateCode, gstStateCode.
 */
export function CountryStateFields({
  country,
  state,
  gstStateCode,
  errors,
}: {
  country: string;
  state: string;
  gstStateCode: string;
  errors?: FieldErrors | undefined;
}) {
  const [cc, setCc] = useState(country || "IN");
  const [iso, setIso] = useState(state);
  const gst = cc === "IN" ? (indianStateByIso(iso)?.gst ?? gstStateCode) : "";
  const known = COUNTRIES.some((c) => c.code === cc);
  return (
    <>
      <Field label="Country" htmlFor="countryCode" error={errors?.countryCode} required>
        <Select
          id="countryCode"
          name="countryCode"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
          {!known ? <option value={cc}>{cc}</option> : null}
        </Select>
      </Field>
      {cc === "IN" ? (
        <Field
          label="State"
          htmlFor="stateCode"
          error={errors?.stateCode ?? errors?.gstStateCode}
          hint={gst ? `GST state code ${gst}` : "Pick the state for the GST state code"}
        >
          <Select
            id="stateCode"
            name="stateCode"
            value={iso}
            onChange={(e) => setIso(e.target.value)}
          >
            <option value="">—</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.iso} value={s.iso}>
                {s.name}
              </option>
            ))}
          </Select>
          <input type="hidden" name="gstStateCode" value={gst} />
        </Field>
      ) : (
        <Field label="State / region code" htmlFor="stateCode" error={errors?.stateCode}>
          <Input
            id="stateCode"
            name="stateCode"
            value={iso}
            onChange={(e) => setIso(e.target.value)}
            placeholder="e.g. CA"
          />
        </Field>
      )}
    </>
  );
}
