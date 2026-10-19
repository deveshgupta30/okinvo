import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Flag } from "@/components/flags/flag";
import { renderEnvDocs } from "../../scripts/env-docs.mjs";
import { usedKeys } from "../../scripts/i18n-check.mjs";
import { mergeInto } from "../../scripts/i18n-merge.mjs";

/** Fixes for the CodeQL findings in the dev scripts and the flag image. */
describe("script hardening", () => {
  it("i18n-merge refuses __proto__ and friends instead of polluting Object.prototype", () => {
    const fragment = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"a":{"constructor":{"prototype":{"x":"y"}}}}',
    ) as Record<string, unknown>;
    const conflicts = mergeInto({}, fragment);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(conflicts).toEqual(["__proto__: reserved key", "a.constructor: reserved key"]);
  });

  it("i18n-check escapes every $ of a binding name, not just the first", () => {
    const src = 'const t$$ = useTranslations("ns");\nt$$("a.b");\n';
    expect(usedKeys(src, "x.tsx")).toEqual([["ns.a.b", "x.tsx:2"]]);
  });

  it("env-docs escapes backslashes in notes before the table pipes", () => {
    const schema = String.raw`
const objectSchema = z
  .object({
    /** Path like C:\dir\|x on Windows. */
    DIR: z.string().default("a|b"),
  })
  .superRefine(() => {});
`;
    const out = renderEnvDocs(schema, "");
    expect(out).toContain(String.raw`| Path like C:\\dir\\\|x on Windows. |`);
    expect(out).toContain(String.raw`| ${"`"}a\|b${"`"} |`);
  });

  it("flag images come from the fixed set, whatever the case of the code", () => {
    const html = renderToStaticMarkup(createElement(Flag, { code: "us" }));
    expect(html).toContain('src="/flags/us.svg"');
    expect(renderToStaticMarkup(createElement(Flag, { code: "FR" }))).toBe("");
  });
});
