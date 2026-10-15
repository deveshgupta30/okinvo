import path from "node:path";
import { Font } from "@react-pdf/renderer";
import { FONT_CATALOG } from "./fonts/catalog";
import {
  CJK_FONT_FILES,
  FONT_FILES,
  SCRIPT_FONT_FILES,
  SYMBOL_FILE,
} from "./fonts/registry.generated";
import { SYMBOL_FAMILY } from "./templates/styles";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const file = (rel: string) => path.join(FONT_DIR, rel);

let registered = false;

/**
 * Registers every catalogue family once per process from the vendored registry; react-pdf
 * resolves faces by family + weight + style. Nothing outside public/fonts is ever embedded.
 */
export function registerFonts(): void {
  if (registered) return;
  registered = true;
  for (const f of FONT_CATALOG) {
    Font.register({
      family: f.family,
      fonts: FONT_FILES[f.id].map((x) => ({
        src: file(x.file),
        fontWeight: x.weight,
        fontStyle: x.style,
      })),
    });
  }
  // Script coverage (spec §9c): one Noto family per script, 400 and 700 of each subset face,
  // and the CJK variable fonts at their default (regular) weight.
  for (const [family, faces] of Object.entries(SCRIPT_FONT_FILES)) {
    Font.register({
      family,
      fonts: faces.map((x) => ({ src: file(x.file), fontWeight: x.weight, fontStyle: x.style })),
    });
  }
  for (const [family, f] of Object.entries(CJK_FONT_FILES)) {
    Font.register({ family, src: file(f.file) });
  }
  // Currency symbols (₹ U+20B9 lives only in the latin-ext subsets).
  Font.register({ family: SYMBOL_FAMILY, src: file(SYMBOL_FILE) });
  // Never hyphenate: document numbers and amounts must stay whole.
  Font.registerHyphenationCallback((word) => [word]);
}
