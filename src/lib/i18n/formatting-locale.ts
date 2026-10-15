/**
 * The Intl locale a document formats its dates and amounts with (SPEC §4.10): the document
 * language, except that an issuer whose own locale is a regional variant of that language keeps
 * it (an `en-IN` issuer printing in English keeps `12,34,567.00`; a German document from the
 * same issuer prints `1.234,50 €`).
 */
export function formattingLocale(documentLocale: string, issuerLocale: string | undefined): string {
  if (!issuerLocale) return documentLocale;
  const language = (tag: string) => tag.split(/[-_]/)[0]?.toLowerCase() ?? tag;
  return language(documentLocale) === language(issuerLocale) ? issuerLocale : documentLocale;
}
