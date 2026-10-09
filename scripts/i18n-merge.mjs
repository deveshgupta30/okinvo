#!/usr/bin/env node
/**
 * Merges a message fragment into `messages/en-US.json`: `node scripts/i18n-merge.mjs <fragment.json>`
 *
 * The fragment has the same nested shape as the catalogue. Existing keys keep their value; a
 * fragment that disagrees with an existing value fails, so two authors cannot silently overwrite
 * each other. A lock file serialises concurrent merges.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = path.join(ROOT, "messages", "en-US.json");
const LOCK = path.join(ROOT, "messages", ".merge.lock");

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

export function mergeInto(target, fragment, prefix = "", conflicts = []) {
  for (const [key, value] of Object.entries(fragment)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      if (target[key] === undefined) target[key] = {};
      if (!isRecord(target[key])) conflicts.push(`${full}: a string is already there`);
      else mergeInto(target[key], value, full, conflicts);
    } else if (target[key] === undefined) {
      target[key] = value;
    } else if (isRecord(target[key])) {
      conflicts.push(`${full}: a namespace is already there`);
    } else if (target[key] !== value) {
      conflicts.push(`${full}: "${target[key]}" vs "${value}"`);
    }
  }
  return conflicts;
}

function acquireLock() {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      mkdirSync(LOCK);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`merge lock held too long: ${LOCK}`);
      const until = Date.now() + 200;
      while (Date.now() < until);
    }
  }
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/i18n-merge.mjs <fragment.json>");
    process.exit(2);
  }
  const fragment = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  acquireLock();
  let conflicts;
  try {
    const base = JSON.parse(readFileSync(BASE, "utf8"));
    conflicts = mergeInto(base, fragment);
    if (!conflicts.length) writeFileSync(BASE, JSON.stringify(base, null, 2) + "\n");
  } finally {
    // released before any exit: process.exit() inside the try would skip this block
    if (existsSync(LOCK)) rmSync(LOCK, { recursive: true, force: true });
  }
  if (conflicts.length) {
    for (const c of conflicts) console.error(`conflict ${c}`);
    process.exit(1);
  }
  console.log(`merged ${path.relative(ROOT, path.resolve(file))} into messages/en-US.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main();
}
