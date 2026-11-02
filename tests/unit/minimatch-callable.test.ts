import { createRequire } from "node:module";
import { ESLint, type Linter } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * pnpm.overrides moves every minimatch to 11 (GHSA-g3hv-75wg-m249) and hands the dependants that
 * still use the minimatch 3 API vendor/minimatch-callable. The eslint rules below reach minimatch
 * only through glob options the repo config never sets, and exceljs never globs on its own, so
 * neither `pnpm lint` nor the export tests would notice them breaking.
 */
describe("minimatch-callable", () => {
  const probe = [
    'import x from "./a/b";',
    "export function P() {",
    '  return <label htmlFor="a"><span>Name</span><CustomInput /></label>;',
    "}",
    "void x;",
  ].join("\n");

  it.each<[string, Linter.RuleEntry]>([
    [
      "jsx-a11y/label-has-associated-control",
      ["error", { controlComponents: ["Custom*"], depth: 3 }],
    ],
    ["import/no-internal-modules", ["error", { allow: ["**/a/*"] }]],
    ["react/jsx-pascal-case", ["error", { ignore: ["foo*"] }]],
  ])("%s runs on minimatch 11", { timeout: 30_000 }, async (rule, options) => {
    const eslint = new ESLint({ overrideConfig: { rules: { [rule]: options } } });
    const [result] = await eslint.lintText(probe, { filePath: "src/probe.tsx" });
    expect(result?.messages.filter((m) => m.fatal)).toEqual([]);
  });

  it("glob 7, as exceljs reaches it, still matches", async () => {
    // exceljs -> archiver -> archiver-utils -> glob 7
    let req = createRequire(import.meta.url);
    for (const pkg of ["exceljs", "archiver", "archiver-utils"]) {
      req = createRequire(req.resolve(`${pkg}/package.json`));
    }
    const glob = req("glob") as {
      sync: (pattern: string, options?: object) => string[];
      (pattern: string, options: object, cb: (err: Error | null, files: string[]) => void): void;
    };
    const opts = { cwd: "tests/unit" };
    const expected = ["minimatch-callable.test.ts", "script-hardening.test.ts"];
    expect(glob.sync("{minimatch-callable,script-*}.test.ts", opts).sort()).toEqual(expected);
    expect(glob.sync("../**/minimatch-callable.test.ts", opts)).toEqual([
      "../unit/minimatch-callable.test.ts",
    ]);
    const notS = glob.sync("[!s]*.test.ts", opts);
    expect(notS).toContain("minimatch-callable.test.ts");
    expect(notS).not.toContain("script-hardening.test.ts");
    const files = await new Promise<string[]>((resolve, reject) =>
      glob("script-hardening.test.*", opts, (err, found) => (err ? reject(err) : resolve(found))),
    );
    expect(files).toEqual(["script-hardening.test.ts"]);
  });
});
