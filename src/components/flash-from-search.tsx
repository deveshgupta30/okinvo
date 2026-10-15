"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastStatus,
} from "@/components/motion/animated-toast-stack";
import { readFlash, type Flash } from "@/lib/flash";

const STATUS: Record<Flash["kind"], ToastStatus> = {
  success: "success",
  error: "error",
  info: "info",
};
const DURATION_MS = 6000;

/**
 * Flash messages carried through a redirect as `?flash=` (every screen is a URL) shown as a
 * toast in the beui stack: the stack's own hook times each toast out after a few seconds, the
 * close button and a swipe dismiss it earlier, and the parameter is stripped so a reload does
 * not repeat the message.
 */
export function FlashFromSearch() {
  const tc = useTranslations("common");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const raw = params.get("flash");
  const stack = useAnimatedToastStack({ defaultDuration: DURATION_MS });
  const { showToast, dismissToast } = stack;
  const hasError = stack.toasts.some((t) => t.status === "error");

  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!raw || shownFor.current === raw) return; // once per flash, even when dev re-runs effects
    shownFor.current = raw;
    const flash = readFlash(raw);
    if (flash) showToast({ title: flash.message, status: STATUS[flash.kind] });
    const rest = new URLSearchParams(params.toString());
    rest.delete("flash");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the raw flash changes
  }, [raw]);

  return (
    <div data-flash-stack role={hasError ? "alert" : "status"}>
      <AnimatedToastStack
        dismissLabel={tc("dismiss")}
        toasts={stack.toasts}
        onDismiss={dismissToast}
        position="bottom-right"
        placement="fixed"
        portal={false}
        classNames={{
          surface: "border-hairline-strong bg-surface-2 text-ink",
          title: "text-app-body text-ink",
        }}
      />
    </div>
  );
}
