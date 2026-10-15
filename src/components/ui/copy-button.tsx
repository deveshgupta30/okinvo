"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { ActionSwapBlurButton } from "@/components/motion/action-swap-blur";

/**
 * Copies `value` to the clipboard and swaps its label and icon to "Copied" for a moment with
 * beui's blur action swap (addendum §3). Without clipboard access (an insecure context) nothing
 * happens and the value stays selectable next to the button.
 */
export function CopyButton({
  value,
  label,
  ariaLabel,
}: {
  value: string;
  /** The visible label; "Copy" when omitted. */
  label?: string;
  /** The accessible name, when it should say what is copied ("Copy link"). */
  ariaLabel?: string;
}) {
  const tc = useTranslations("common");
  const [state, setState] = React.useState<"copy" | "copied">("copy");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copyLabel = label ?? tc("copy");
  return (
    <ActionSwapBlurButton
      type="button"
      size="sm"
      variant="secondary"
      cycle={false}
      value={state}
      className="h-7 rounded-md border border-hairline bg-surface-1 px-3 text-app-caption text-ink hover:bg-surface-2"
      items={[
        {
          id: "copy",
          label: copyLabel,
          icon: <Copy className="size-3.5" strokeWidth={1.5} />,
          ...(ariaLabel ? { ariaLabel } : {}),
        },
        {
          id: "copied",
          label: tc("copied"),
          icon: <Check className="size-3.5" strokeWidth={1.5} />,
          ...(ariaLabel ? { ariaLabel: tc("copied") } : {}),
        },
      ]}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setState("copy"), 1500);
        } catch {
          // clipboard unavailable: the value is selectable beside the button
        }
      }}
    />
  );
}
