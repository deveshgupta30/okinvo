/**
 * Refreshes every vendored resource from a connected machine (addendum §1), so an air-gapped
 * instance updates by rebuilding the image:
 *
 *   pnpm vendor:update fonts      the document font catalogue and Noto faces (pnpm fonts:vendor)
 *   pnpm vendor:update wordlist   the EFF short wordlist behind generated passphrases
 *   pnpm vendor:update flags      the bundled flag SVGs, from node_modules/flag-icons when present
 *   pnpm vendor:update rates      the bundled exchange-rate snapshot (scripts/update-rates.ts)
 *   pnpm vendor:update beui       the pinned beui components (shadcn add)
 *   pnpm vendor:update all
 *
 * Run the usual checks afterwards (pnpm fonts:check, pnpm notices, pnpm test) and commit.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { format, resolveConfig } from "prettier";

const ROOT = path.resolve(import.meta.dirname, "..");
export const WORDLIST_URL = "https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt";
export const WORDLIST_MODULE = path.join(ROOT, "src", "lib", "security", "eff-short-wordlist.ts");
export const FLAG_CODES = ["us", "gb", "in"] as const;
/** The beui components installed through `shadcn add` (filled in as the beui tasks land). */
export const BEUI_COMPONENTS: readonly string[] = [];

export type Subcommand = "fonts" | "wordlist" | "flags" | "rates" | "beui" | "all";
const SUBCOMMANDS: readonly Subcommand[] = ["fonts", "wordlist", "flags", "rates", "beui", "all"];

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
}

/** The wordlist module source from the EFF text (`NNNN<tab>word` per line). */
export function renderWordlistModule(text: string): string {
  const words = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/).pop()!)
    .filter((w) => /^[a-z]+$/.test(w));
  if (words.length !== 1296) throw new Error(`expected 1296 words, got ${words.length}`);
  const body = words.map((w) => `  "${w}",`).join("\n");
  return [
    "/**",
    " * EFF Short Wordlist #1 (1 296 words, 4 dice), by the Electronic Frontier Foundation, used",
    " * under CC BY 3.0 (https://www.eff.org/dice; THIRD_PARTY_NOTICES.md). Generated from",
    " * eff_short_wordlist_1.txt by scripts/vendor-update.ts; do not edit by hand.",
    " */",
    "export const EFF_SHORT_WORDLIST: readonly string[] = [",
    body,
    "];",
    "",
  ].join("\n");
}

async function wordlist(): Promise<void> {
  const res = await fetch(WORDLIST_URL);
  if (!res.ok) throw new Error(`${WORDLIST_URL}: HTTP ${res.status}`);
  const source = renderWordlistModule(await res.text());
  const options = (await resolveConfig(WORDLIST_MODULE)) ?? {};
  const pretty = await format(source, { ...options, filepath: WORDLIST_MODULE });
  const before = existsSync(WORDLIST_MODULE) ? readFileSync(WORDLIST_MODULE, "utf8") : "";
  writeFileSync(WORDLIST_MODULE, pretty);
  console.log(before === pretty ? "wordlist: unchanged" : "wordlist: updated");
}

function flags(): void {
  const dir = path.join(ROOT, "node_modules", "flag-icons", "flags", "4x3");
  if (!existsSync(dir)) {
    console.log("flags: flag-icons is not installed, keeping the bundled SVGs");
    return;
  }
  for (const code of FLAG_CODES) {
    copyFileSync(path.join(dir, `${code}.svg`), path.join(ROOT, "public", "flags", `${code}.svg`));
  }
  console.log(`flags: copied ${FLAG_CODES.length} SVGs from flag-icons`);
}

function rates(): void {
  const script = path.join(ROOT, "scripts", "update-rates.ts");
  if (!existsSync(script)) {
    console.log("rates: scripts/update-rates.ts is not part of this build yet, skipped");
    return;
  }
  run("pnpm", ["exec", "tsx", script]);
}

function beui(): void {
  if (BEUI_COMPONENTS.length === 0) {
    console.log("beui: no pinned components yet, skipped");
    return;
  }
  run("pnpm", ["dlx", "shadcn@latest", "add", "--overwrite", "--yes", ...BEUI_COMPONENTS]);
}

export async function vendorUpdate(sub: Subcommand): Promise<void> {
  const steps: Record<Exclude<Subcommand, "all">, () => void | Promise<void>> = {
    fonts: () => run("pnpm", ["fonts:vendor"]),
    wordlist,
    flags,
    rates,
    beui,
  };
  const order: Exclude<Subcommand, "all">[] =
    sub === "all" ? ["fonts", "wordlist", "flags", "rates", "beui"] : [sub];
  for (const step of order) {
    console.log(`== ${step}`);
    await steps[step]();
  }
}

function isSubcommand(v: string | undefined): v is Subcommand {
  return v !== undefined && (SUBCOMMANDS as readonly string[]).includes(v);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  const sub = process.argv[2];
  if (!isSubcommand(sub)) {
    console.error(`usage: pnpm vendor:update <${SUBCOMMANDS.join("|")}>`);
    process.exit(2);
  }
  vendorUpdate(sub).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
