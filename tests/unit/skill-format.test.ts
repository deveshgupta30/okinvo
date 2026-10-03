import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The okinvo-invoicing skill (spec §7.4) is in the Agent Skills format: a SKILL.md whose YAML
 * frontmatter carries a `name` matching the folder and a `description` short enough for a
 * skills index, plus the reference file it points at.
 */
const DIR = "skills/okinvo-invoicing";

function frontmatter(markdown: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
  if (!match) throw new Error("no frontmatter");
  const out: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

describe("okinvo-invoicing skill", () => {
  const skill = readFileSync(`${DIR}/SKILL.md`, "utf8");
  const meta = frontmatter(skill);

  it("names itself after its folder", () => {
    expect(meta.name).toBe("okinvo-invoicing");
    expect(meta.name).toMatch(/^[a-z0-9-]+$/);
  });

  it("has a description under 1 024 characters", () => {
    expect(meta.description).toBeTruthy();
    expect(meta.description!.length).toBeLessThan(1024);
    expect(meta.description).toMatch(/invoice/i);
  });

  it("documents auth, the REST base path, the MCP endpoint and the hard limits", () => {
    expect(skill).toContain("/api/v1");
    expect(skill).toContain("/api/mcp");
    expect(skill).toMatch(/Bearer okv_/);
    expect(skill).toMatch(/no (deletion|delete)/i);
    expect(skill).toMatch(/void/i);
    expect(skill).toMatch(/payment/i);
  });

  it("ships its reference file", () => {
    expect(existsSync(`${DIR}/reference.md`)).toBe(true);
    const reference = readFileSync(`${DIR}/reference.md`, "utf8");
    for (const tool of ["list_invoices", "create_invoice", "issue_invoice", "get_status"]) {
      expect(reference).toContain(tool);
    }
    expect(reference).toContain("okinvo://invoices/{id}/pdf");
  });
});
