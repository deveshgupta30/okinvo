import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Mark, Wordmark } from "@/components/brand/logo";

/**
 * The marks are the owner's SVGs inlined as components: ink follows the theme through
 * `currentColor`, the green dot is the `brand-dot` token, and no colour literal survives.
 */
describe("brand components", () => {
  it("wordmark uses currentColor for the letters and the brand-dot token for the o", () => {
    const html = renderToStaticMarkup(createElement(Wordmark, { title: "okinvo" }));
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("var(--color-brand-dot)");
    expect(html).not.toMatch(/#17191E|#F4F5F7|#87D9A8/i);
    expect(html).toContain('role="img"');
    expect(html).toContain("<title>okinvo</title>");
    expect(html).toContain('viewBox="0 0 680 200"');
  });

  it("mark is decorative by default and exposes a name when titled", () => {
    const plain = renderToStaticMarkup(createElement(Mark));
    expect(plain).toContain('aria-hidden="true"');
    expect(plain).toContain('viewBox="0 0 256 256"');
    expect(plain).toContain("var(--color-brand-dot)");
    const named = renderToStaticMarkup(createElement(Mark, { title: "okinvo" }));
    expect(named).toContain('role="img"');
    expect(named).not.toContain("aria-hidden");
  });
});
