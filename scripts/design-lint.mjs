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
process.exit(failed ? 1 : 0);
