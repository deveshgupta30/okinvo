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
    expect(out.indexOf("- alpha 2.1.0, 2.2.0 - A Person")).toBeLessThan(
      out.indexOf("- zeta 1.0.0 - Z (https://z.example)"),
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

  it("drops platform-specific binary packages so Windows and Linux installs render the same file", () => {
    const json = {
      MIT: [
        { name: "esbuild", version: "0.28.2" },
        { name: "@esbuild/win32-x64", version: "0.28.2" },
        { name: "@esbuild/linux-x64", version: "0.28.2" },
        { name: "lightningcss-win32-x64-msvc", version: "1.33.0" },
        { name: "@next/swc-linux-x64-gnu", version: "16.3.8" },
        { name: "@swc/core-darwin-arm64", version: "1.16.13" },
        { name: "@parcel/watcher-win32-x64", version: "2.6.0" },
        { name: "linux-tools-helper", version: "1.0.0" },
      ],
      "Apache-2.0": [
        { name: "sharp", version: "0.35.5" },
        { name: "@img/sharp-win32-x64", version: "0.35.5" },
        { name: "@img/sharp-libvips-linux-x64", version: "1.2.4" },
      ],
    };
    const out = renderNotices(json);
    expect(out).not.toMatch(/win32|linux-x64|darwin|libvips/);
    expect(out).toContain("- esbuild 0.28.2");
    expect(out).toContain("- sharp 0.35.5");
    expect(out).toContain("- linux-tools-helper 1.0.0"); // a plain name is not a platform build
    expect(out).toContain("### MIT (2)");
    expect(out).toContain("### Apache-2.0 (1)");
    expect(out).toContain("_3 packages under 2 licences._");
    expect(out).toMatch(/platform-specific/i);
  });
});
