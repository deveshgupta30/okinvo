/**
 * Peppol Electronic Address Schemes (EAS, the ISO 6523 ICD list as used by EN 16931 /
 * Peppol BIS Billing 3.0): the identifier scheme behind a party's electronic address (spec
 * §9e). The common European, UK and Australian schemes an invoicing business meets; browser-safe.
 */
export interface EasEntry {
  code: string;
  name: string;
}

export const EAS: readonly EasEntry[] = [
  { code: "0002", name: "SIRENE (France)" },
  { code: "0007", name: "Organisationsnummer (Sweden)" },
  { code: "0009", name: "SIRET (France)" },
  { code: "0037", name: "LY-tunnus (Finland)" },
  { code: "0060", name: "DUNS number" },
  { code: "0088", name: "GLN (GS1 Global Location Number)" },
  { code: "0096", name: "CVR (Denmark)" },
  { code: "0106", name: "KvK number (Netherlands)" },
  { code: "0135", name: "SIA object identifiers (Italy)" },
  { code: "0151", name: "ABN (Australia)" },
  { code: "0183", name: "UIDB / IDE (Switzerland)" },
  { code: "0184", name: "DIGSTORG (Denmark)" },
  { code: "0190", name: "OIN (Netherlands)" },
  { code: "0191", name: "Company code (Estonia)" },
  { code: "0192", name: "Organisasjonsnummer (Norway)" },
  { code: "0193", name: "UBL.BE party identifier (Belgium)" },
  { code: "0195", name: "UEN (Singapore)" },
  { code: "0196", name: "Kennitala (Iceland)" },
  { code: "0198", name: "ERST (Denmark)" },
  { code: "0199", name: "LEI (Legal Entity Identifier)" },
  { code: "0201", name: "IPA code (Italy)" },
  { code: "0204", name: "Leitweg-ID (Germany)" },
  { code: "0208", name: "Enterprise number (Belgium)" },
  { code: "0209", name: "GS1 identification keys" },
  { code: "0210", name: "Codice fiscale (Italy)" },
  { code: "0211", name: "Partita IVA (Italy)" },
  { code: "0212", name: "Finnish organisation identifier" },
  { code: "0213", name: "Finnish organisation value-added tax identifier" },
  { code: "0215", name: "Net service ID (Finland)" },
  { code: "0216", name: "OVT code (Finland)" },
  { code: "0221", name: "Japanese registered corporation number" },
  { code: "0230", name: "National e-invoicing framework (Malaysia)" },
  { code: "9901", name: "Danish Ministry of the Interior and Health" },
  { code: "9906", name: "Italian VAT number" },
  { code: "9907", name: "Italian tax code" },
  { code: "9910", name: "Hungarian VAT number" },
  { code: "9913", name: "Business registers network" },
  { code: "9914", name: "Austrian VAT number" },
  { code: "9915", name: "Austrian government entity (Verwaltungskennzeichen)" },
  { code: "9918", name: "SWIFT BIC" },
  { code: "9919", name: "Austrian Kennziffer des Unternehmensregisters" },
  { code: "9920", name: "Spanish NIF" },
  { code: "9922", name: "Andorran VAT number" },
  { code: "9923", name: "Albanian VAT number" },
  { code: "9924", name: "Bosnian VAT number" },
  { code: "9925", name: "Belgian VAT number" },
  { code: "9926", name: "Bulgarian VAT number" },
  { code: "9927", name: "Swiss VAT number" },
  { code: "9928", name: "Cypriot VAT number" },
  { code: "9929", name: "Czech VAT number" },
  { code: "9930", name: "German VAT number" },
  { code: "9931", name: "Estonian VAT number" },
  { code: "9932", name: "United Kingdom VAT number" },
  { code: "9933", name: "Greek VAT number" },
  { code: "9934", name: "Croatian VAT number" },
  { code: "9935", name: "Irish VAT number" },
  { code: "9936", name: "Liechtenstein VAT number" },
  { code: "9937", name: "Lithuanian VAT number" },
  { code: "9938", name: "Luxembourg VAT number" },
  { code: "9939", name: "Latvian VAT number" },
  { code: "9940", name: "Monaco VAT number" },
  { code: "9941", name: "Montenegrin VAT number" },
  { code: "9942", name: "North Macedonian VAT number" },
  { code: "9943", name: "Maltese VAT number" },
  { code: "9944", name: "Dutch VAT number" },
  { code: "9945", name: "Polish VAT number" },
  { code: "9946", name: "Portuguese VAT number" },
  { code: "9947", name: "Romanian VAT number" },
  { code: "9948", name: "Serbian VAT number" },
  { code: "9949", name: "Slovenian VAT number" },
  { code: "9950", name: "Slovak VAT number" },
  { code: "9951", name: "San Marino VAT number" },
  { code: "9952", name: "Turkish VAT number" },
  { code: "9953", name: "Vatican VAT number" },
  { code: "9957", name: "French VAT number" },
  { code: "9959", name: "Employer Identification Number (United States)" },
];

export const EAS_CODES = EAS.map((e) => e.code) as [string, ...string[]];

export function isEasCode(code: string): boolean {
  return EAS.some((e) => e.code === code);
}

export function easName(code: string): string | undefined {
  return EAS.find((e) => e.code === code)?.name;
}
