"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { ACCENT_COOKIE, parseAccent } from "@/lib/accent";
import { AccountInputSchema } from "@/lib/schemas/account-input";
import { THEME_COOKIE, parseThemeMode } from "@/lib/theme";
import { requireRole } from "@/server/auth";
import { setAccent, setAvatar, setTheme, updateAccount } from "@/server/dal/users";
import { failedParse, failedWith, type ActionState } from "./shared";

const PAGE = "/settings/account";

export async function saveAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("VIEWER");
  const parsed = parseForm(AccountInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await updateAccount(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  // Mirror the theme to the cookie so the next response renders it on the first byte.
  if (parsed.data.theme !== undefined) {
    (await cookies()).set(THEME_COOKIE, parsed.data.theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false, // the inline theme script reads it before hydration
    });
  }
  revalidatePath("/", "layout");
  redirect(withFlash(PAGE, { kind: "success", message: "Account preferences saved" }));
}

/** Links a freshly uploaded AVATAR asset to the signed-in account (spec §3.5). */
export async function setAvatarAction(assetId: string): Promise<void> {
  const actor = await requireRole("VIEWER");
  await setAvatar(actor, assetId);
  revalidatePath("/", "layout");
}

export async function removeAvatarAction(): Promise<void> {
  const actor = await requireRole("VIEWER");
  await setAvatar(actor, null);
  revalidatePath("/", "layout");
}

const YEAR = 60 * 60 * 24 * 365;

/** Sidebar theme toggle (spec §3.3): persists the mode; the browser already set the cookie. */
export async function setThemeAction(mode: unknown): Promise<void> {
  const actor = await requireRole("VIEWER");
  const theme = parseThemeMode(typeof mode === "string" ? mode : undefined);
  await setTheme(actor, theme);
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    httpOnly: false,
  });
}

/** Settings → Appearance accent swatches (spec §3.4). */
export async function setAccentAction(id: unknown): Promise<void> {
  const actor = await requireRole("VIEWER");
  const accent = parseAccent(id);
  await setAccent(actor, accent);
  (await cookies()).set(ACCENT_COOKIE, accent, {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
    httpOnly: false,
  });
  revalidatePath("/", "layout");
}
