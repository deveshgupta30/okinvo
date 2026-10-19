#!/usr/bin/env node
/**
 * i18n drift guard (spec §8.1): `pnpm i18n:check` [--strict]
 *
 * 1. Every `messages/<locale>.json` has exactly the keys of `messages/en-US.json`: a missing key
 *    fails unless the file is marked `"@@generated": true` and `--strict` is off, or the file is
 *    an `"@@overlay": true` (en-GB carries only the strings that differ); a key that en-US does
 *    not have always fails (stale after a rename). Placeholders (`{name}`) and rich tags
 *    (`<code>`) of every translated string must match the en-US string.
 * 2. Every key the code uses exists in en-US: `src/**` is scanned for translator bindings
 *    (`const t = useTranslations("ns")`, `getTranslations("ns")`, `getTranslations({ namespace })`)
 *    and their `t("key")` / `t.rich("key")` / `t.raw("key")` / `t.has("key")` calls.
 *
 * Exits 1 on any drift and prints each problem on its own line.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MESSAGES = path.join(ROOT, "messages");
const BASE = "en-US";
const strict = process.argv.includes("--strict");

/** Dotted leaf paths of a catalogue, skipping `@@` metadata. */
export function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("@@")) continue;
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, value);
  }
  return out;
}

/** The `{argument}` names and `<tag>` names a message uses, as a sorted signature. */
export function placeholders(message) {
  if (typeof message !== "string") return "";
  const args = new Set();
  for (const m of message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)) args.add(`{${m[1]}}`);
  for (const m of message.matchAll(/<([A-Za-z][A-Za-z0-9]*)>/g)) args.add(`<${m[1]}>`);
  return [...args].sort().join(" ");
}

const BINDING =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([\w.]+)"|\{[^}]*?namespace\s*:\s*"([\w.]+)"[^}]*\})?\s*\)/g;

/**
 * `[ns.key, file:line]` pairs for every literal key the code asks a translator for. A binding
 * scopes the calls that follow it up to the next binding of the same variable name, so one file
 * may bind `t` to different namespaces in different components.
 */
export function usedKeys(source, file) {
  const out = [];
  const bindings = [...source.matchAll(BINDING)].map((m) => ({
    name: m[1],
    ns: m[2] ?? m[3] ?? "",
    start: m.index + m[0].length,
  }));
  bindings.forEach((binding, i) => {
    const next = bindings.slice(i + 1).find((b) => b.name === binding.name);
    const region = source.slice(binding.start, next ? next.start : undefined);
    const call = new RegExp(
      `\\b${binding.name.replaceAll("$", "\\$")}(?:\\.(?:rich|markup|raw|has))?\\(\\s*"([\\w.]+)"`,
      "g",
    );
    for (const m of region.matchAll(call)) {
      const line = source.slice(0, binding.start + m.index).split("\n").length;
      out.push([binding.ns ? `${binding.ns}.${m[1]}` : m[1], `${file}:${line}`]);
    }
  });
  return out;
}

/**
 * `[line, text]` for every bare JSX text node that reads like an English phrase: a capitalised
 * word followed by a space and a lower-case word, directly after a `>` and before `<` or `{`.
 * Comments and strings inside braces are not JSX text and are left alone.
 */
export function jsxLiterals(source) {
  const out = [];
  const re = />\s*([A-Z][a-z]+ [a-z][^<{\n]*)/g;
  for (const m of source.matchAll(re)) {
    const before = source.slice(0, m.index);
    // skip `=>` arrows and generics (`Promise<Foo>`): a JSX tag closes with `>` after `"` or a word
    if (/(=|-)$/.test(before)) continue;
    const line = before.split("\n").length;
    out.push([line, m[1].trim()]);
  }
  return out;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "generated") continue;
      if (entry === "motion" && dir.endsWith("components")) continue; // vendored beui (addendum §3)
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) yield full;
  }
}

function main() {
  const problems = [];
  const base = JSON.parse(readFileSync(path.join(MESSAGES, `${BASE}.json`), "utf8"));
  const baseKeys = flatten(base);

  for (const file of readdirSync(MESSAGES)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const locale = file.replace(/\.json$/, "");
    if (locale === BASE) continue;
    const parsed = JSON.parse(readFileSync(path.join(MESSAGES, file), "utf8"));
    const generated = parsed["@@generated"] === true;
    // an overlay (en-GB) deliberately carries only the strings that differ from en-US
    const overlay = parsed["@@overlay"] === true;
    const keys = flatten(parsed);
    for (const key of baseKeys.keys()) {
      if (!keys.has(key) && !overlay && (strict || !generated))
        problems.push(`${file}: missing "${key}"`);
    }
    for (const [key, value] of keys) {
      if (!baseKeys.has(key)) problems.push(`${file}: unknown key "${key}" (not in ${BASE})`);
      else if (placeholders(value) !== placeholders(baseKeys.get(key)))
        problems.push(
          `${file}: "${key}" placeholders differ (${placeholders(value) || "none"} vs ${placeholders(baseKeys.get(key)) || "none"})`,
        );
    }
  }

  const used = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    used.push(...usedKeys(readFileSync(file, "utf8"), rel));
  }
  for (const [key, where] of used) {
    const exists = baseKeys.has(key) || [...baseKeys.keys()].some((k) => k.startsWith(`${key}.`));
    if (!exists) problems.push(`${where}: key "${key}" is not in ${BASE}.json`);
  }

  // --strict: no English sentence left as a bare JSX literal in the app and component folders
  // (legal prose pages are documents, not UI, and keep their text).
  if (strict) {
    for (const dir of ["src/app", "src/components"]) {
      for (const file of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        if (/^src\/app\/\(public\)\/legal\/[^/]+\/page\.tsx$/.test(rel)) continue;
        for (const [line, text] of jsxLiterals(readFileSync(file, "utf8"))) {
          problems.push(`${rel}:${line}: untranslated JSX text "${text}"`);
        }
      }
    }
  }

  if (problems.length) {
    for (const p of problems) console.error(p);
    console.error(`i18n:check found ${problems.length} problem(s)`);
    process.exit(1);
  }
  const catalogues = readdirSync(MESSAGES).filter((f) => f.endsWith(".json")).length;
  console.log(
    `i18n:check ok: ${baseKeys.size} keys in ${BASE}, ${catalogues} catalogue(s), ${used.length} usages${strict ? " (strict)" : ""}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
