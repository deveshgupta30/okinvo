import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/forms";
import {
  EMPTY_LEGAL_OPERATOR,
  LEGAL_REQUIRED_FIELDS,
  LegalOperatorSchema,
  missingLegalFields,
} from "@/lib/schemas/legal-operator";

/** The operator details behind the legal pages (spec §6.4). */
describe("LegalOperatorSchema", () => {
  it("accepts an empty form (a fresh instance) and reports every required field as missing", () => {
    const r = parseForm(LegalOperatorSchema, new FormData());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual(EMPTY_LEGAL_OPERATOR);
    expect(missingLegalFields(r.data)).toEqual([...LEGAL_REQUIRED_FIELDS]);
  });

  it("trims, keeps optional e-mails optional, and validates what is given", () => {
    const fd = new FormData();
    fd.append("legalName", "  Asha Rao  ");
    fd.append("entityType", "INDIVIDUAL");
    fd.append("address", "14 Lavelle Road\nBengaluru 560001");
    fd.append("country", "IN");
    fd.append("contactEmail", "asha@example.com");
    fd.append("privacyEmail", "asha@example.com");
    fd.append("dpoEmail", "");
    fd.append("governingLaw", "the laws of India");
    fd.append("venue", "the courts of Bengaluru, Karnataka");
    fd.append("effectiveDate", "2026-10-03");
    const r = parseForm(LegalOperatorSchema, fd);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.legalName).toBe("Asha Rao");
    expect(r.data.dpoEmail).toBeUndefined();
    expect(missingLegalFields(r.data)).toEqual([]);
  });

  it("rejects a bad e-mail, an unknown country, a bad date and an unknown entity type", () => {
    const bad = (k: string, v: string) => {
      const fd = new FormData();
      fd.append(k, v);
      const r = parseForm(LegalOperatorSchema, fd);
      return r.ok ? [] : Object.keys(r.fieldErrors);
    };
    expect(bad("contactEmail", "nope")).toContain("contactEmail");
    expect(bad("country", "usa")).toContain("country");
    expect(bad("effectiveDate", "03/10/2026")).toContain("effectiveDate");
    expect(bad("entityType", "TRUST")).toContain("entityType");
  });
});
