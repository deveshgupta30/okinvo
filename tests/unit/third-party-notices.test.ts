import { describe, expect, it } from "vitest";
import { HAND_SECTIONS, renderNotices } from "../../scripts/third-party-notices.mjs";

/** The notices generator (spec §6.1): deterministic, sorted, carries the hand-written sections. */
describe("renderNotices", () => {
  const fixture = {
    MIT: [
      { name: "zeta", versions: ["1.0.0"], author: "Z", homepage: "https://z.example" },
      { name: "alpha", versions: ["2.1.0", "2.2.0"], author: "A  Person\n" },
    ],
    "Apache-2.0": [{ name: "mid", version: "3.0.0" }],
  };

  it("sorts licences and packages and counts them", () => {
    const out = renderNotices(fixture);
    expect(out.indexOf("### Apache-2.0 (1)")).toBeLessThan(out.indexOf("### MIT (2)"));
    expect(out.indexOf("- alpha 2.1.0, 2.2.0 — A Person")).toBeLessThan(
      out.indexOf("- zeta 1.0.0 — Z (https://z.example)"),
    );
    expect(out).toContain("- mid 3.0.0");
    expect(out).toContain("_3 packages under 2 licences._");
    expect(out).toContain("# Third-party notices");
    expect(out).toContain(HAND_SECTIONS.trimEnd());
  });

  it("is deterministic", () => {
    expect(renderNotices(fixture)).toBe(renderNotices(JSON.parse(JSON.stringify(fixture))));
    expect(renderNotices(fixture)).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });
});
