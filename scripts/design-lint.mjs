import { execFileSync } from "node:child_process";

let failed = false;
for (const file of ["DESIGN.md", "DESIGN.light.md"]) {
  let stdout = "";
  try {
    stdout = execFileSync("pnpm", ["exec", "designmd", "lint", file], {
      encoding: "utf8",
      shell: true,
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
