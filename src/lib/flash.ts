/**
 * One-shot messages carried through a redirect as `?flash=<json>` (every screen is a URL, so
 * there is no server-side session state for toasts). Read once by <FlashFromSearch/>.
 */
export type FlashKind = "success" | "error" | "info";
export interface Flash {
  kind: FlashKind;
  message: string;
}

const KINDS: ReadonlySet<string> = new Set(["success", "error", "info"]);
const MAX_MESSAGE = 300;

export function withFlash(href: string, flash: Flash): string {
  const url = new URL(href, "http://flash.local");
  url.searchParams.set(
    "flash",
    JSON.stringify({ kind: flash.kind, message: flash.message.slice(0, MAX_MESSAGE) }),
  );
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readFlash(raw: string | null | undefined): Flash | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { kind, message } = parsed as Record<string, unknown>;
    if (typeof kind !== "string" || !KINDS.has(kind)) return null;
    if (typeof message !== "string" || message.length === 0 || message.length > MAX_MESSAGE) {
      return null;
    }
    return { kind: kind as FlashKind, message };
  } catch {
    return null;
  }
}
