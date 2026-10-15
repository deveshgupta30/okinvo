/**
 * The page footer template of a document language ("Page {page} of {total}"), split for
 * renderers that place the numbers themselves (SPEC §4.10).
 */
export type PageOfPart = string | "{page}" | "{total}";

export function splitPageOf(template: string): PageOfPart[] {
  return template.split(/(\{page\}|\{total\})/).filter((part) => part.length > 0);
}

export function pageOf(template: string, page: number, total: number): string {
  return splitPageOf(template)
    .map((part) => (part === "{page}" ? String(page) : part === "{total}" ? String(total) : part))
    .join("");
}
