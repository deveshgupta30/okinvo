import { execSync } from "node:child_process";

const FILES = ["DESIGN.md", "DESIGN.light.md"];

let failed = false;
for (const file of FILES) {
  let stdout = "";
  try {
    // Constant command string: the file names are fixed above, so no argument escaping is needed.
    stdout = execSync(`pnpm exec designmd lint ${file}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    stdout = err.stdout ?? "";
  }
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    console.error(`${file}: could not parse lint output:\n${stdout}`);
    process.exit(1);
  }
  for (const f of report.findings ?? []) {
    console.log(`${file} [${f.severity}] ${f.path ?? ""}: ${f.message}`);
  }
  if ((report.summary?.errors ?? 0) > 0) failed = true;
}
// Launch checklist item 20: one clear call to action per view. A page file may hold at most one
// primary button (the Button default, an explicit variant="primary", or a SubmitButton), and a
// page that carries a form must offer a submit button of some variant.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
function pageFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}
export function ctaFindings(src, file) {
  const findings = [];
  const buttons = src.match(/<Button(\s[^>]*)?>/gs) ?? [];
  const primary = buttons.filter((b) => !/variant=/.test(b) || /variant="primary"/.test(b)).length;
  const submits = (src.match(/<SubmitButton/g) ?? []).length;
  const total = primary + submits;
  if (total > 1) findings.push(`${file}: ${total} primary buttons; a view has one call to action`);
  if (/<form[\s>]/.test(src) && total === 0 && !/type="submit"/.test(src)) {
    findings.push(`${file}: a form without a submit button`);
  }
  return findings;
}
const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (invokedDirectly) {
  const app = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
    "..",
    "src",
    "app",
  );
  for (const file of pageFiles(app)) {
    for (const f of ctaFindings(
      readFileSync(file, "utf8"),
      path.relative(app, file).replace(/\\/g, "/"),
    )) {
      console.log(`[error] ${f}`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
