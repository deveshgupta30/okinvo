"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fits a paper-sized preview into its container by scaling, keeping the page proportions. */
export function ScaledPreview({
  pageWidthPx,
  pageHeightPx,
  children,
}: {
  pageWidthPx: number;
  pageHeightPx: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / pageWidthPx));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx]);
  return (
    <div
      ref={ref}
      className="w-full overflow-hidden rounded-xl border border-hairline bg-surface-1"
    >
      <div style={{ height: pageHeightPx * scale }}>
        <div
          style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: pageWidthPx }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
