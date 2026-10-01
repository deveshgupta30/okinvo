import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

describe("cn (tailwind-merge taught DESIGN.md's typography tokens)", () => {
  it("keeps a typography token and a text colour together", () => {
    expect(cn("text-app-label", "text-ink")).toBe("text-app-label text-ink");
  });
  it("lets a later typography token replace an earlier one", () => {
    expect(cn("text-app-body", "text-app-table")).toBe("text-app-table");
  });
  it("lets a later colour replace an earlier colour without touching the size", () => {
    expect(cn("text-app-label text-ink", "text-primary-foreground")).toBe(
      "text-app-label text-primary-foreground",
    );
  });
});

describe("buttonVariants", () => {
  it("small primary keeps its foreground colour and switches to table typography", () => {
    const classes = cn(buttonVariants({ variant: "primary", size: "sm" }));
    expect(classes).toContain("text-primary-foreground");
    expect(classes).toContain("text-app-table");
    expect(classes).not.toContain("text-app-label");
  });
  it("link variant has no button height or padding regardless of size", () => {
    const classes = cn(buttonVariants({ variant: "link", size: "lg" }));
    expect(classes).toContain("h-auto");
    expect(classes).toContain("px-0");
    expect(classes).not.toMatch(/\bh-10\b/);
    expect(classes).not.toMatch(/\bpx-4\b/);
  });
});
