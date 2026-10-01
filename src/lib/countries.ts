/** Curated country list for pickers (any ISO code is still accepted by the schemas). */
export const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "HK", name: "Hong Kong" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "ZA", name: "South Africa" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "BE", name: "Belgium" },
  { code: "DK", name: "Denmark" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "IL", name: "Israel" },
  { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "KR", name: "South Korea" },
  { code: "LK", name: "Sri Lanka" },
  { code: "BD", name: "Bangladesh" },
  { code: "NP", name: "Nepal" },
];

/** Indian states and union territories with ISO 3166-2 subdivision and GST state codes. */
export const INDIAN_STATES: readonly { iso: string; gst: string; name: string }[] = [
  { iso: "AN", gst: "35", name: "Andaman and Nicobar Islands" },
  { iso: "AP", gst: "37", name: "Andhra Pradesh" },
  { iso: "AR", gst: "12", name: "Arunachal Pradesh" },
  { iso: "AS", gst: "18", name: "Assam" },
  { iso: "BR", gst: "10", name: "Bihar" },
  { iso: "CH", gst: "04", name: "Chandigarh" },
  { iso: "CT", gst: "22", name: "Chhattisgarh" },
  { iso: "DH", gst: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { iso: "DL", gst: "07", name: "Delhi" },
  { iso: "GA", gst: "30", name: "Goa" },
  { iso: "GJ", gst: "24", name: "Gujarat" },
  { iso: "HR", gst: "06", name: "Haryana" },
  { iso: "HP", gst: "02", name: "Himachal Pradesh" },
  { iso: "JK", gst: "01", name: "Jammu and Kashmir" },
  { iso: "JH", gst: "20", name: "Jharkhand" },
  { iso: "KA", gst: "29", name: "Karnataka" },
  { iso: "KL", gst: "32", name: "Kerala" },
  { iso: "LA", gst: "38", name: "Ladakh" },
  { iso: "LD", gst: "31", name: "Lakshadweep" },
  { iso: "MP", gst: "23", name: "Madhya Pradesh" },
  { iso: "MH", gst: "27", name: "Maharashtra" },
  { iso: "MN", gst: "14", name: "Manipur" },
  { iso: "ML", gst: "17", name: "Meghalaya" },
  { iso: "MZ", gst: "15", name: "Mizoram" },
  { iso: "NL", gst: "13", name: "Nagaland" },
  { iso: "OR", gst: "21", name: "Odisha" },
  { iso: "PY", gst: "34", name: "Puducherry" },
  { iso: "PB", gst: "03", name: "Punjab" },
  { iso: "RJ", gst: "08", name: "Rajasthan" },
  { iso: "SK", gst: "11", name: "Sikkim" },
  { iso: "TN", gst: "33", name: "Tamil Nadu" },
  { iso: "TG", gst: "36", name: "Telangana" },
  { iso: "TR", gst: "16", name: "Tripura" },
  { iso: "UP", gst: "09", name: "Uttar Pradesh" },
  { iso: "UT", gst: "05", name: "Uttarakhand" },
  { iso: "WB", gst: "19", name: "West Bengal" },
];

export function indianStateByIso(iso: string | null | undefined) {
  return INDIAN_STATES.find((s) => s.iso === iso) ?? null;
}

export function indianStateByGst(gst: string | null | undefined) {
  return INDIAN_STATES.find((s) => s.gst === gst) ?? null;
}

/** "Karnataka (29)" for place-of-supply lines. */
export function placeOfSupplyLabel(gst: string | null | undefined): string | null {
  const s = indianStateByGst(gst);
  return s ? `${s.name} (${s.gst})` : null;
}
