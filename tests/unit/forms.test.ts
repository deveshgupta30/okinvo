import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fBool, fDecimal, fInt, fOptional, formToObject, parseForm } from "@/lib/forms";

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("formToObject", () => {
  it("nests dotted keys and collects repeated keys into arrays", () => {
    expect(
      formToObject(
        fd([
          ["label", "Main"],
          ["address.line1", "1 Street"],
          ["address.city", "Bengaluru"],
          ["paymentMethodIds", "a"],
          ["paymentMethodIds", "b"],
          ["items[0].description", "Design"],
          ["items[1].description", "Build"],
        ]),
      ),
    ).toEqual({
      label: "Main",
      address: { line1: "1 Street", city: "Bengaluru" },
      paymentMethodIds: ["a", "b"],
      items: [{ description: "Design" }, { description: "Build" }],
    });
  });
  it("ignores File entries and Next's internal $ACTION fields", () => {
    const f = fd([
      ["$ACTION_ID_x", "y"],
      ["name", "n"],
    ]);
    f.append("file", new Blob(["x"]), "x.txt");
    expect(formToObject(f)).toEqual({ name: "n" });
  });
});

describe("parseForm", () => {
  const schema = z.object({
    name: z.string().min(1, "required"),
    active: fBool,
    rate: fDecimal(2),
    qty: fDecimal(3),
    days: fInt,
    note: fOptional(z.string().max(5)),
    address: z.object({ city: z.string().min(1) }),
  });
  it("coerces checkbox, decimal and integer fields", () => {
    const r = parseForm(
      schema,
      fd([
        ["name", "A"],
        ["active", "on"],
        ["rate", "1,500.5"],
        ["qty", "2"],
        ["days", "30"],
        ["note", ""],
        ["address.city", "X"],
      ]),
    );
    expect(r).toEqual({
      ok: true,
      data: {
        name: "A",
        active: true,
        rate: "1500.50",
        qty: "2.000",
        days: 30,
        address: { city: "X" },
      },
    });
  });
  it("reports field errors keyed by dotted path", () => {
    const r = parseForm(
      schema,
      fd([
        ["name", ""],
        ["rate", "abc"],
        ["qty", "1.2345"],
        ["days", "x"],
        ["note", "toolong"],
        ["address.city", ""],
      ]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual([
      "address.city",
      "days",
      "name",
      "note",
      "qty",
      "rate",
    ]);
    expect(r.fieldErrors.name).toEqual(["required"]);
  });
  it("treats a missing checkbox as false and rejects negative money by schema", () => {
    const r = parseForm(
      schema,
      fd([
        ["name", "A"],
        ["rate", "-1"],
        ["qty", "1"],
        ["days", "1"],
        ["address.city", "X"],
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.active).toBe(false);
    expect(r.data.rate).toBe("-1.00");
  });
});
