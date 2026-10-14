/**
 * Approximate printed page count for the live preview (spec §4.6 "Documents fit A4/Letter").
 * The HTML preview is one tall sheet; the PDF breaks it into pages. The first page takes the
 * sheet up to one page height; every continuation page offers the page height minus the chrome
 * the renderer reserves there (margins, the repeated table header, the footer band), taken as
 * a fixed share of the page. It is an estimate: rows are not split identically by both renderers.
 */
export const CONTINUATION_CHROME = 0.14;

export function estimatePages(contentHeight: number, pageHeight: number): number {
  // scrollHeight is an integer while the page height is fractional (A4: 1122.52 px): a sheet
  // that is exactly one page tall reports the next whole pixel, which is still one page
  const page = Math.ceil(pageHeight);
  if (!(page > 0) || !(contentHeight > page)) return 1;
  const usable = page * (1 - CONTINUATION_CHROME);
  return 1 + Math.ceil((contentHeight - page) / usable);
}
