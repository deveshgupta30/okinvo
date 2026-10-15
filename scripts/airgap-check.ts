/**
 * Air-gap guard (addendum §1): after `pnpm build`, scans the client bundles and the public
 * folder for any external host (what a browser would be sent to fetch) and for the names of
 * secret environment variables, and the server bundles for the CDN and font hosts a stray
 * import could pull in. Library source in server chunks legitimately names identity providers
 * and documentation pages, so arbitrary hosts are not flagged there: server-side outbound is
 * confined to src/lib/net/outbound.ts by code. Source maps are build artefacts, not runtime,
 * and are skipped. Exit 1 with every offending file:line.
 *
 *   pnpm build && pnpm airgap:check
 *
 * Hosts that are identifiers rather than requests (XML namespaces, documentation links in
 * comments and error messages) are listed in ALLOWED_HOSTS; add to it with a reason.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface Finding {
  file: string;
  line: number;
  match: string;
}

/** Hosts that appear in bundles as names, never as requests. */
export const ALLOWED_HOSTS: readonly string[] = [
  // documentation links in comments, error messages and the legal pages
  "github.com",
  "nextjs.org",
  "react.dev",
  "modelcontextprotocol.io",
  "agentskills.io",
  "www.eff.org",
  "trivy.dev",
  "www.iso.org",
  "www.gnu.org",
  "www.apache.org",
  "creativecommons.org",
  "scripts.sil.org",
  "fonts.google.com",
  "openfontlicense.org",
  "opensource.org",
  "spdx.org",
  "invoices.example.com",
  "okinvo.example",
  // XML, PDF, OOXML and e-invoicing namespaces and schema identifiers
  "www.w3.org",
  "purl.org",
  "ns.adobe.com",
  "iptc.org",
  "docs.oasis-open.org",
  "schemas.openxmlformats.org",
  "schemas.microsoft.com",
  "www.unece.org",
  "www.iso20022.org",
  "pdfa.org",
  "fnfe-mpe.org",
  "www.ferd-net.de",
  "xml.org",
  "einvoice1.gst.gov.in",
  "einv-apisandbox.nic.in",
  "api.einvoice.nic.in",
  "www.gstn.org.in",
  "json-schema.org",
  "localhost",
  "127.0.0.1",
];

/** Environment variables whose names must never reach a client bundle. */
export const SECRET_ENV_NAMES: readonly string[] = [
  "AUTH_SECRET",
  "FIELD_ENCRYPTION_KEY",
  "DATABASE_URL",
  "SMTP_PASSWORD",
  "S3_SECRET_KEY",
  "S3_ACCESS_KEY",
  "AUTH_GOOGLE_SECRET",
  "AUTH_GITHUB_SECRET",
  "AUTH_KEYCLOAK_SECRET",
  "AUTH_CASDOOR_SECRET",
  "AUTH_OIDC_SECRET",
  "WIKI_TOKEN",
];

const URL_RE = /https?:\/\/([a-z0-9.-]+)(?::\d+)?/gi;
const BARE_HOST_RE =
  /\b(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.[a-z0-9.-]+\.[a-z]{2,}|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\b/gi;
const SECRET_RE = new RegExp(`\\b(${SECRET_ENV_NAMES.join("|")})\\b`, "g");
/** Server bundles: only the hosts a stray next/font/google would reach at build time. */
const FONT_HOST_RE = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/i;

/**
 * Findings for one file's text. `anyHost` flags every host outside ALLOWED_HOSTS (client
 * bundles, public); without it only the CDN and font patterns count (server bundles).
 * `secrets` is on for client bundles and public only.
 */
export function scanText(
  text: string,
  file: string,
  o: { secrets: boolean; anyHost: boolean },
): Finding[] {
  const out: Finding[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const seen = new Set<string>();
    for (const m of line.matchAll(URL_RE)) {
      const host = m[1]!.toLowerCase();
      if (ALLOWED_HOSTS.includes(host)) continue;
      if (!host.includes(".")) continue; // a minified fragment such as "https://x", never a host
      if (!o.anyHost && !FONT_HOST_RE.test(host)) continue;
      const match = `${m[0].slice(0, m[0].indexOf("://") + 3)}${host}`;
      if (!seen.has(match)) {
        seen.add(match);
        out.push({ file, line: i + 1, match });
      }
    }
    for (const m of line.matchAll(BARE_HOST_RE)) {
      const host = m[0].toLowerCase();
      if (!o.anyHost && !FONT_HOST_RE.test(host)) continue;
      if (line.includes(`://${host}`)) continue; // already reported with its scheme
      if (!seen.has(host)) {
        seen.add(host);
        out.push({ file, line: i + 1, match: host });
      }
    }
    if (o.secrets) {
      for (const m of line.matchAll(SECRET_RE)) {
        // the auth library's env shim defines getters named after the variables it may read
        if (line.includes(`get ${m[1]}(`)) continue;
        if (!seen.has(m[1]!)) {
          seen.add(m[1]!);
          out.push({ file, line: i + 1, match: m[1]! });
        }
      }
    }
  });
  return out;
}

const TEXT_EXT = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".json",
  ".txt",
  ".svg",
  ".webmanifest",
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (TEXT_EXT.has(path.extname(entry).toLowerCase())) yield full;
  }
}

export function scanDir(
  root: string,
  dir: string,
  o: { secrets: boolean; anyHost: boolean },
): Finding[] {
  const full = path.join(root, dir);
  const out: Finding[] = [];
  let exists = true;
  try {
    statSync(full);
  } catch {
    exists = false;
  }
  if (!exists) return out;
  for (const file of walk(full)) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    out.push(...scanText(readFileSync(file, "utf8"), rel, o));
  }
  return out;
}

function main(): void {
  const root = path.resolve(import.meta.dirname, "..");
  const findings = [
    ...scanDir(root, ".next/static", { secrets: true, anyHost: true }),
    ...scanDir(root, ".next/server", { secrets: false, anyHost: false }),
    ...scanDir(root, "public", { secrets: true, anyHost: true }),
  ];
  if (findings.length === 0) {
    console.log("airgap:check ok: no external hosts or secret names in the build output");
    return;
  }
  for (const f of findings) console.error(`${f.file}:${f.line}: ${f.match}`);
  console.error(`airgap:check: ${findings.length} finding(s)`);
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) main();
