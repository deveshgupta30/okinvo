/**
 * The 115 UI languages (spec §8.1), in the order of the owner's list, each named in itself
 * (`name`, what the picker shows) and in English (`english`, for logs and the generated
 * catalogues). `rtl` marks the right-to-left scripts; the root layout sets `dir` from it.
 */
export const REGIONS = [
  "Africa",
  "Americas",
  "Asia",
  "Europe",
  "Middle East",
  "Oceania",
  "Constructed",
] as const;
export type Region = (typeof REGIONS)[number];

export interface Language {
  tag: string;
  name: string;
  english: string;
  region: Region;
  rtl?: true;
}

const L = (tag: string, name: string, english: string, region: Region, rtl?: true): Language =>
  rtl ? { tag, name, english, region, rtl } : { tag, name, english, region };

export const LANGUAGES: readonly Language[] = [
  L("so", "Soomaaliga", "Somali", "Africa"),
  L("af", "Afrikaans", "Afrikaans", "Africa"),
  L("az", "Azərbaycan dili", "Azerbaijani", "Asia"),
  L("id", "Bahasa Indonesia", "Indonesian", "Asia"),
  L("ms", "Bahasa Melayu", "Malay", "Asia"),
  L("jv", "Basa Jawa", "Javanese", "Asia"),
  L("ceb", "Bisaya", "Cebuano", "Asia"),
  L("bs", "Bosanski", "Bosnian", "Europe"),
  L("br", "Brezhoneg", "Breton", "Europe"),
  L("ca", "Català", "Catalan", "Europe"),
  L("cs", "Čeština", "Czech", "Europe"),
  L("co", "Corsu", "Corsican", "Europe"),
  L("cy", "Cymraeg", "Welsh", "Europe"),
  L("da", "Dansk", "Danish", "Europe"),
  L("de", "Deutsch", "German", "Europe"),
  L("et", "Eesti", "Estonian", "Europe"),
  L("en-GB", "English (UK)", "English (United Kingdom)", "Europe"),
  L("en-US", "English (US)", "English (United States)", "Americas"),
  L("es", "Español", "Spanish (Latin America)", "Americas"),
  L("es-ES", "Español (España)", "Spanish (Spain)", "Europe"),
  L("eo", "Esperanto", "Esperanto", "Constructed"),
  L("eu", "Euskara", "Basque", "Europe"),
  L("fil", "Filipino", "Filipino", "Asia"),
  L("fo", "Føroyskt", "Faroese", "Europe"),
  L("fr-CA", "Français (Canada)", "French (Canada)", "Americas"),
  L("fr-FR", "Français (France)", "French (France)", "Europe"),
  L("fy", "Frysk", "Western Frisian", "Europe"),
  L("ff", "Fula", "Fula", "Africa"),
  L("fur", "Furlan", "Friulian", "Europe"),
  L("ga", "Gaeilge", "Irish", "Europe"),
  L("gl", "Galego", "Galician", "Europe"),
  L("gn", "Guarani", "Guarani", "Americas"),
  L("ha", "Hausa", "Hausa", "Africa"),
  L("hr", "Hrvatski", "Croatian", "Europe"),
  L("rw", "Ikinyarwanda", "Kinyarwanda", "Africa"),
  L("iu", "Inuktitut", "Inuktitut", "Americas"),
  L("ik", "Iñupiatun", "Inupiaq", "Americas"),
  L("is", "Íslenska", "Icelandic", "Europe"),
  L("it", "Italiano", "Italian", "Europe"),
  L("sw", "Kiswahili", "Swahili", "Africa"),
  L("ht", "Kreyòl Ayisyen", "Haitian Creole", "Americas"),
  L("kmr", "Kurdî (Kurmancî)", "Kurdish (Kurmanji)", "Middle East"),
  L("lv", "Latviešu", "Latvian", "Europe"),
  L("lt", "Lietuvių", "Lithuanian", "Europe"),
  L("hu", "Magyar", "Hungarian", "Europe"),
  L("mg", "Malagasy", "Malagasy", "Africa"),
  L("mt", "Malti", "Maltese", "Europe"),
  L("nl", "Nederlands", "Dutch", "Europe"),
  L("nb", "Norsk (bokmål)", "Norwegian (Bokmål)", "Europe"),
  L("nn", "Norsk (nynorsk)", "Norwegian (Nynorsk)", "Europe"),
  L("uz", "O'zbek", "Uzbek", "Asia"),
  L("pl", "Polski", "Polish", "Europe"),
  L("pt-BR", "Português (Brasil)", "Portuguese (Brazil)", "Americas"),
  L("pt-PT", "Português (Portugal)", "Portuguese (Portugal)", "Europe"),
  L("ro", "Română", "Romanian", "Europe"),
  L("sc", "Sardu", "Sardinian", "Europe"),
  L("sn", "Shona", "Shona", "Africa"),
  L("sq", "Shqip", "Albanian", "Europe"),
  L("szl", "Ślōnskŏ gŏdka", "Silesian", "Europe"),
  L("sk", "Slovenčina", "Slovak", "Europe"),
  L("sl", "Slovenščina", "Slovenian", "Europe"),
  L("fi", "Suomi", "Finnish", "Europe"),
  L("sv", "Svenska", "Swedish", "Europe"),
  L("vi", "Tiếng Việt", "Vietnamese", "Asia"),
  L("tr", "Türkçe", "Turkish", "Asia"),
  L("nl-BE", "Vlaams", "Flemish", "Europe"),
  L("zza", "Zaza", "Zazaki", "Middle East"),
  L("el", "Ελληνικά", "Greek", "Europe"),
  L("be", "Беларуская", "Belarusian", "Europe"),
  L("bg", "Български", "Bulgarian", "Europe"),
  L("ky", "Кыргызча", "Kyrgyz", "Asia"),
  L("kk", "Қазақша", "Kazakh", "Asia"),
  L("mk", "Македонски", "Macedonian", "Europe"),
  L("mn", "Монгол", "Mongolian", "Asia"),
  L("ru", "Русский", "Russian", "Europe"),
  L("sr", "Српски", "Serbian", "Europe"),
  L("tt", "Татарча", "Tatar", "Europe"),
  L("tg", "Тоҷикӣ", "Tajik", "Asia"),
  L("uk", "Українська", "Ukrainian", "Europe"),
  L("ka", "ქართული", "Georgian", "Asia"),
  L("hy", "Հայերեն", "Armenian", "Asia"),
  L("he", "עברית", "Hebrew", "Middle East", true),
  L("ur", "اردو", "Urdu", "Asia", true),
  L("ar", "العربية", "Arabic", "Middle East", true),
  L("ps", "پښتو", "Pashto", "Asia", true),
  L("fa", "فارسی", "Persian", "Middle East", true),
  L("ckb", "کوردیی ناوەندی", "Central Kurdish", "Middle East", true),
  L("sd", "سنڌي", "Sindhi", "Asia", true),
  L("syr", "ܣܘܪܝܝܐ", "Syriac", "Middle East", true),
  L("ti", "ትግርኛ", "Tigrinya", "Africa"),
  L("am", "አማርኛ", "Amharic", "Africa"),
  L("zgh", "ⵜⴰⵎⴰⵣⵉⵖⵜ", "Tamazight", "Africa"),
  L("ne", "नेपाली", "Nepali", "Asia"),
  L("mr", "मराठी", "Marathi", "Asia"),
  L("hi", "हिन्दी", "Hindi", "Asia"),
  L("as", "অসমীয়া", "Assamese", "Asia"),
  L("bn", "বাংলা", "Bengali", "Asia"),
  L("pa", "ਪੰਜਾਬੀ", "Punjabi", "Asia"),
  L("gu", "ગુજરાતી", "Gujarati", "Asia"),
  L("or", "ଓଡ଼ିଆ", "Odia", "Asia"),
  L("ta", "தமிழ்", "Tamil", "Asia"),
  L("te", "తెలుగు", "Telugu", "Asia"),
  L("kn", "ಕನ್ನಡ", "Kannada", "Asia"),
  L("ml", "മലയാളം", "Malayalam", "Asia"),
  L("si", "සිංහල", "Sinhala", "Asia"),
  L("th", "ภาษาไทย", "Thai", "Asia"),
  L("lo", "ພາສາລາວ", "Lao", "Asia"),
  L("my", "မြန်မာဘာသာ", "Burmese", "Asia"),
  L("km", "ភាសាខ្មែរ", "Khmer", "Asia"),
  L("ko", "한국어", "Korean", "Asia"),
  L("zh-TW", "中文(台灣)", "Chinese (Traditional, Taiwan)", "Asia"),
  L("zh-CN", "中文(简体)", "Chinese (Simplified)", "Asia"),
  L("zh-HK", "中文(香港)", "Chinese (Hong Kong)", "Asia"),
  L("ja", "日本語", "Japanese", "Asia"),
  L("ja-KS", "日本語(関西)", "Japanese (Kansai)", "Asia"),
];

/** The tags as a tuple, for `z.enum`. */
export const LANGUAGE_TAGS = LANGUAGES.map((l) => l.tag) as [string, ...string[]];
export type LanguageTag = string;

export const DEFAULT_LOCALE = "en-US";

const BY_TAG = new Map(LANGUAGES.map((l) => [l.tag.toLowerCase(), l]));

export function languageFor(tag: string): Language | undefined {
  return BY_TAG.get(tag.toLowerCase());
}

export function isSupportedLocale(tag: unknown): tag is LanguageTag {
  return typeof tag === "string" && BY_TAG.has(tag.toLowerCase());
}

/** The canonical spelling of a supported tag (`en-gb` → `en-GB`). */
export function canonicalLocale(tag: string): LanguageTag | undefined {
  return languageFor(tag)?.tag;
}

export function isRtl(tag: string): boolean {
  return languageFor(tag)?.rtl === true;
}

/** Regions in table order, each with its languages in table order; empty regions are left out. */
export function languagesByRegion(): { region: Region; languages: Language[] }[] {
  return REGIONS.map((region) => ({
    region,
    languages: LANGUAGES.filter((l) => l.region === region),
  })).filter((g) => g.languages.length > 0);
}
