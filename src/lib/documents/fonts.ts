import path from "node:path";
import { Font } from "@react-pdf/renderer";
import { FONT_CATALOG } from "./fonts/catalog";
import { FONT_FILES, SYMBOL_FILE } from "./fonts/registry.generated";
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
  // Currency symbols (₹ U+20B9 lives only in the latin-ext subsets).
  Font.register({ family: SYMBOL_FAMILY, src: file(SYMBOL_FILE) });
  // Never hyphenate: document numbers and amounts must stay whole.
  Font.registerHyphenationCallback((word) => [word]);
}
