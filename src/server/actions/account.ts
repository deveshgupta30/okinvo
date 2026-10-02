"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { AccountInputSchema } from "@/lib/schemas/account-input";
import { THEME_COOKIE } from "@/lib/theme";
import { requireOwner } from "@/server/auth";
import { setAvatar, updateAccount } from "@/server/dal/users";
import { failedParse, failedWith, type ActionState } from "./shared";

const PAGE = "/settings/account";

export async function saveAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireOwner();
  const parsed = parseForm(AccountInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await updateAccount(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  // Mirror the theme to the cookie so the next response renders it on the first byte.
  (await cookies()).set(THEME_COOKIE, parsed.data.theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false, // the inline theme script reads it before hydration
  });
  revalidatePath("/", "layout");
  redirect(withFlash(PAGE, { kind: "success", message: "Account preferences saved" }));
}

/** Links a freshly uploaded AVATAR asset to the signed-in account (spec §3.5). */
export async function setAvatarAction(assetId: string): Promise<void> {
  const actor = await requireOwner();
  await setAvatar(actor, assetId);
  revalidatePath("/", "layout");
}

export async function removeAvatarAction(): Promise<void> {
  const actor = await requireOwner();
  await setAvatar(actor, null);
  revalidatePath("/", "layout");
}
