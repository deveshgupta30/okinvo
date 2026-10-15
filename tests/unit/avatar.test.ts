import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/components/ui/avatar";

describe("Avatar", () => {
  it("shows the photo as a circle when a storage key is set", () => {
    const html = renderToStaticMarkup(
      createElement(Avatar, {
        name: "Allison Murray Roy",
        email: "a@example.com",
        src: "assets/avatar/2026/x.png",
        size: "md",
      }),
    );
    expect(html).toContain('src="/api/assets/assets/avatar/2026/x.png"');
    expect(html).toContain("rounded-full");
    expect(html).toContain('alt="Allison Murray Roy"');
  });

  it("falls back to initials on the accent colour", () => {
    const html = renderToStaticMarkup(
      createElement(Avatar, { name: "Allison Murray Roy", email: "a@example.com", src: null }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain(">AM<");
    expect(html).toContain("bg-primary");
    expect(html).toContain("text-on-primary");
    expect(html).toContain("rounded-full");
    expect(html).toContain('aria-label="Allison Murray Roy"');
  });

  it("uses the e-mail when there is no name", () => {
    const html = renderToStaticMarkup(createElement(Avatar, { name: "", email: "k@example.com" }));
    expect(html).toContain(">K<");
  });
});
