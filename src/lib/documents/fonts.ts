import path from "node:path";
import { Font } from "@react-pdf/renderer";
import { SYMBOL_FAMILY } from "./templates/styles";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const file = (name: string) => path.join(FONT_DIR, `${name}.woff`);

let registered = false;

/** Registers every family once per process; react-pdf resolves faces by family + weight. */
export function registerFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Inter",
    fonts: [
      { src: file("inter-latin-400-normal"), fontWeight: 400 },
      { src: file("inter-latin-500-normal"), fontWeight: 500 },
      { src: file("inter-latin-600-normal"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "IBM Plex Sans",
    fonts: [
      { src: file("ibm-plex-sans-latin-400-normal"), fontWeight: 400 },
      { src: file("ibm-plex-sans-latin-500-normal"), fontWeight: 500 },
      { src: file("ibm-plex-sans-latin-600-normal"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "Source Serif 4",
    fonts: [
      { src: file("source-serif-4-latin-400-normal"), fontWeight: 400 },
      { src: file("source-serif-4-latin-600-normal"), fontWeight: 600 },
    ],
  });
  Font.register({ family: "Noto Sans", src: file("noto-sans-latin-400-normal") });
  // Currency symbols (₹ U+20B9 lives only in the latin-ext subsets).
  Font.register({ family: SYMBOL_FAMILY, src: file("inter-latin-ext-400-normal") });
  // Never hyphenate: document numbers and amounts must stay whole.
  Font.registerHyphenationCallback((word) => [word]);
}
