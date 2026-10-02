/**
 * Approximate printed page count for the live preview (spec §4.6 "Documents fit A4/Letter").
 * The HTML preview is one tall sheet; the PDF breaks it into pages. The first page takes the
 * sheet up to one page height; every continuation page offers the page height minus the chrome
 * the renderer reserves there (margins, the repeated table header, the footer band), taken as
 * a fixed share of the page. It is an estimate: rows are not split identically by both renderers.
 */
export const CONTINUATION_CHROME = 0.14;

export function estimatePages(contentHeight: number, pageHeight: number): number {
  if (!(pageHeight > 0) || !(contentHeight > pageHeight)) return 1;
  const usable = pageHeight * (1 - CONTINUATION_CHROME);
  return 1 + Math.ceil((contentHeight - pageHeight) / usable);
}

export function pageEstimateLabel(pages: number): string {
  return `approx. ${pages} ${pages === 1 ? "page" : "pages"}`;
}
