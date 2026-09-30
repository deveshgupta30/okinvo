import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "src/generated/**",
    "src/lib/typography-keys.generated.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    ".superpowers/**",
  ]),
  {
    // v2 §24.1: colours come from DESIGN.md through tokens.css, never from literals in components.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab|lab|lch|color)\\()/]",
          message:
            "Colour literal: use a token utility generated from DESIGN.md (bg-canvas, text-ink, …).",
        },
        {
          selector:
            "TemplateElement[value.raw=/(#[0-9a-fA-F]{3,8}\\b|\\b(rgba?|hsla?|oklch|oklab|lab|lch|color)\\()/]",
          message: "Colour literal: use a token utility generated from DESIGN.md.",
        },
      ],
    },
  },
]);
