import { describe, expect, it } from "vitest";
import { estimatePages } from "@/components/documents/page-estimate";

/**
 * The builder's "approx. N pages" badge (spec §4.6 "Documents fit A4/Letter"): the first page
 * holds the measured preview up to one page height; every further page offers the page height
 * minus the chrome the renderer reserves (margins, repeated table header, footer band).
 */
describe("estimatePages", () => {
  it("is one page while the content fits", () => {
    expect(estimatePages(500, 1123)).toBe(1);
    expect(estimatePages(1123, 1123)).toBe(1);
    expect(estimatePages(0, 1123)).toBe(1);
  });
  it("treats a sheet rounded up to the next pixel as one page", () => {
    // A4 is 1122.52 px at 96 dpi; browsers report scrollHeight as an integer, so an empty sheet
    // whose min-height is the page height measures 1123 px
    expect(estimatePages(1123, 1122.52)).toBe(1);
    expect(estimatePages(1124, 1122.52)).toBe(2);
  });
  it("adds a page for every further slice of usable height", () => {
    // 14% of the page is chrome on continuation pages → 965.78 px usable at A4 (1123 px)
    expect(estimatePages(1124, 1123)).toBe(2);
    expect(estimatePages(1123 + 965, 1123)).toBe(2);
    expect(estimatePages(1123 + 966, 1123)).toBe(3);
    expect(estimatePages(5000, 1123)).toBe(6);
  });
  it("never divides by zero or returns less than one page", () => {
    expect(estimatePages(100, 0)).toBe(1);
    expect(estimatePages(-5, 1123)).toBe(1);
  });
});
