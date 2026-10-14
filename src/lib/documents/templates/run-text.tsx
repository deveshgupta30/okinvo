import { Text, type TextProps } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { splitRuns } from "../fonts/scripts";

/**
 * The PDF text primitive with per-script font selection (spec §9c): every string child is cut
 * into script runs and each non-Latin run is wrapped in a nested `<Text>` that names the Noto
 * face carrying its glyphs, so a Hindi or Arabic label prints next to Latin numbers in one
 * line. Non-string children (nested runs, the page-number `render` prop) pass through.
 *
 * The document's base family and language travel in the `run` prop (no React context: the PDF
 * modules are bundled as server code, where context APIs are refused).
 */
export type RunTextProps = TextProps & { children?: ReactNode };

function fontOf(style: TextProps["style"]): string | undefined {
  const list = Array.isArray(style) ? style : [style];
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (s && typeof s === "object" && "fontFamily" in s && typeof s.fontFamily === "string")
      return s.fontFamily;
  }
  return undefined;
}

function runsOf(text: string, base: string, locale: string, keyPrefix: string): ReactNode[] {
  return splitRuns(text, base, locale).map((run, i) =>
    run.fontFamily === base ? (
      run.text
    ) : (
      <Text key={`${keyPrefix}${i}`} style={{ fontFamily: run.fontFamily }}>
        {run.text}
      </Text>
    ),
  );
}

export interface RunBinding {
  /** The template's body family: Latin runs keep it. */
  base: string;
  /** The document language, which picks the CJK face. */
  locale: string;
}

export function RunText(props: RunTextProps & { run: RunBinding }): ReactNode {
  const { children, run, ...rest } = props;
  const base = fontOf(props.style) ?? run.base;
  const mapped =
    typeof children === "string"
      ? runsOf(children, base, run.locale, "r")
      : Array.isArray(children)
        ? children.flatMap((child, i) =>
            typeof child === "string" ? runsOf(child, base, run.locale, `r${i}-`) : [child],
          )
        : children;
  return <Text {...rest}>{mapped}</Text>;
}
