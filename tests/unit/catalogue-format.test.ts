import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { mergeMessages } from "@/lib/i18n/messages";

/**
 * Every string of every catalogue formats with the arguments its en-US counterpart declares
 * (spec §8.2), every select branch included: a generated catalogue that turns a branch body
 * into a placeholder, drops a plural `other` or breaks ICU syntax fails here, not in front of
 * a user.
 */
type Tree = { [k: string]: string | Tree };
const dir = join(process.cwd(), "messages");
const read = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree;
function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    k.startsWith("@@")
      ? []
      : typeof v === "string"
        ? [[prefix + k, v] as [string, string]]
        : leaves(v, `${prefix}${k}.`),
  );
}
/** Argument values from the en-US string: numbers for plurals, functions for tags, text otherwise. */
export function valuesFor(source: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const args = /\{\s*([A-Za-z0-9_]+)\s*(?:,\s*(plural|selectordinal|select|number|date|time))?/g;
  for (const m of source.matchAll(args)) {
    const [, name, kind] = m;
    if (!name) continue;
    values[name] =
      kind === "plural" || kind === "selectordinal" || kind === "number"
        ? 2
        : kind === "date" || kind === "time"
          ? new Date(0)
          : kind === "select"
            ? "other"
            : `[${name}]`;
  }
  for (const m of source.matchAll(/<([A-Za-z0-9_]+)>/g)) {
    const [, tag] = m;
    if (tag) values[tag] = (chunks: unknown) => chunks;
  }
  return values;
}
/** Every branch keyword of every select in the en-US string, so each body is formatted once. */
export function selectBranches(source: string): [string, string[]][] {
  const out: [string, string[]][] = [];
  for (const m of source.matchAll(/\{\s*([A-Za-z0-9_]+)\s*,\s*select\s*,([^]*)$/g)) {
    const [, name, rest] = m;
    if (!name || !rest) continue;
    const branches = [...rest.matchAll(/(?:^|\s)([A-Za-z0-9_]+)\s*\{/g)].map((b) => b[1] as string);
    out.push([name, branches.length ? branches : ["other"]]);
  }
  return out;
}

const base = read("en-US.json");
const baseLeaves = new Map(leaves(base));
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en-US.json");

describe("every catalogue formats with en-US arguments", () => {
  it("derives the select branches of the SMTP status line", () => {
    const source = baseLeaves.get("settings.status.smtp.configured") ?? "";
    expect(selectBranches(source)).toEqual([["source", ["settings", "env", "other", "test"]]]);
  });

  it.each(files)("%s", (file) => {
    const locale = file.replace(/\.json$/, "");
    const t = createTranslator({
      locale,
      // a partial file (en-GB is a spelling overlay) is laid over en-US, as at runtime
      messages: mergeMessages(base, read(file)) as never,
      onError: (e) => {
        throw e;
      },
    });
    const broken: string[] = [];
    for (const [key, source] of baseLeaves) {
      const values = valuesFor(source);
      const variants: Record<string, unknown>[] = [values];
      for (const [name, branches] of selectBranches(source))
        for (const branch of branches) variants.push({ ...values, [name]: branch });
      for (const v of variants) {
        try {
          t.rich(key as never, v as never);
        } catch (e) {
          broken.push(`${key}: ${(e as Error).message}`);
          break;
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
