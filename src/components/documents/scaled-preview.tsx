"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { estimatePages } from "./page-estimate";

/**
 * Fits a paper-sized preview into its container by scaling, keeping the page proportions. The
 * sheet grows with its content (a long invoice shows in full, scaled) and a badge estimates how
 * many printed pages that content takes (spec §4.6).
 */
export function ScaledPreview({
  pageWidthPx,
  pageHeightPx,
  children,
}: {
  pageWidthPx: number;
  pageHeightPx: number;
  children: ReactNode;
}) {
  const t = useTranslations("documents.ui");
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(pageHeightPx);
  useEffect(() => {
    const el = ref.current;
    const sheet = sheetRef.current;
    if (!el || !sheet) return;
    const update = () => {
      setScale(Math.min(1, el.clientWidth / pageWidthPx));
      setContentHeight(sheet.scrollHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [pageWidthPx]);
  const pages = estimatePages(contentHeight, pageHeightPx);
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-xl border border-hairline bg-surface-1"
    >
      <span
        data-page-estimate={pages}
        className="absolute top-2 right-2 z-10 rounded-md border border-hairline bg-surface-2/90 px-2 py-0.5 text-app-caption text-ink-subtle"
      >
        {t("pageEstimate", { count: pages })}
      </span>
      <div style={{ height: Math.max(pageHeightPx, contentHeight) * scale }}>
        <div
          ref={sheetRef}
          style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: pageWidthPx }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
