#!/usr/bin/env node
/**
 * Helpers for producing the generated catalogues (spec §8.2):
 *
 *   node scripts/i18n-batch.mjs missing            tags of the language table without a catalogue
 *   node scripts/i18n-batch.mjs validate <file>…   a produced catalogue against en-US: metadata,
 *                                                  key set, placeholders and rich tags, ICU
 *                                                  brace balance and plural `other` forms
 *
 * Exits 1 when a validated file has a problem; every problem is printed as file: message.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { flatten, placeholders } from "./i18n-check.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const MESSAGES = path.join(ROOT, "messages");

async function languageTags() {
  // the table is TypeScript; strip the types with a tiny regex and evaluate the data
  const src = readFileSync(path.join(ROOT, "src/lib/i18n/languages.ts"), "utf8");
  const tags = [...src.matchAll(/^\s*L\("([^"]+)",/gm)].map((m) => m[1]);
  if (tags.length < 100) throw new Error("could not read the language table");
  return tags;
}

/** ICU sanity: balanced braces and every plural/select has an `other` branch. */
export function icuProblems(message) {
  const out = [];
  let depth = 0;
  for (const ch of message) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) out.push("unbalanced braces");
  for (const m of message.matchAll(/\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/g)) {
    const rest = message.slice(m.index);
    if (!/\bother\s*\{/.test(rest)) out.push(`${m[1]} without an other branch`);
  }
  return out;
}

export function validateCatalogue(file, base) {
  const problems = [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return [`${file}: not valid JSON (${e.message})`];
  }
  const tag = path.basename(file, ".json");
  if (parsed["@@generated"] !== true) problems.push(`${file}: missing "@@generated": true`);
  if (parsed["@@source"] !== "en-US") problems.push(`${file}: missing "@@source": "en-US"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(parsed["@@date"] ?? "")))
    problems.push(`${file}: missing "@@date": "YYYY-MM-DD"`);
  const keys = flatten(parsed);
  const baseKeys = flatten(base);
  for (const key of baseKeys.keys()) if (!keys.has(key)) problems.push(`${file}: missing "${key}"`);
  for (const [key, value] of keys) {
    if (!baseKeys.has(key)) {
      problems.push(`${file}: unknown key "${key}"`);
      continue;
    }
    if (typeof value !== "string") {
      problems.push(`${file}: "${key}" is not a string`);
      continue;
    }
    if (placeholders(value) !== placeholders(baseKeys.get(key)))
      problems.push(
        `${file}: "${key}" placeholders differ (${placeholders(value) || "none"} vs ${placeholders(baseKeys.get(key)) || "none"})`,
      );
    for (const p of icuProblems(value)) problems.push(`${file}: "${key}" ${p}`);
    if (/[- - ]/.test(value)) problems.push(`${file}: "${key}" contains an em or en dash`);
    if (value.trim() === "" && baseKeys.get(key).trim() !== "")
      problems.push(`${file}: "${key}" is empty`);
  }
  void tag;
  return problems;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const base = JSON.parse(readFileSync(path.join(MESSAGES, "en-US.json"), "utf8"));
  if (cmd === "missing") {
    const tags = await languageTags();
    const missing = tags.filter(
      (t) => t !== "en-US" && t !== "en-GB" && !existsSync(path.join(MESSAGES, `${t}.json`)),
    );
    console.log(missing.join(" "));
    return;
  }
  if (cmd === "validate") {
    const problems = args.flatMap((f) => validateCatalogue(path.resolve(f), base));
    if (problems.length) {
      for (const p of problems) console.error(p);
      console.error(`${problems.length} problem(s)`);
      process.exit(1);
    }
    console.log(`ok: ${args.length} catalogue(s) complete (${flatten(base).size} keys each)`);
    return;
  }
  console.error("usage: i18n-batch.mjs missing | validate <file>...");
  process.exit(2);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
