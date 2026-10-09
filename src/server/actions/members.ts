"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { ROLES } from "@/server/actor";
import { requireOwner } from "@/server/auth";
import {
  deactivateMember,
  inviteMember,
  reactivateMember,
  revokeInvitation,
  setMemberRole,
} from "@/server/dal/members";
import { actionT, errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const PAGE = "/settings/users";

const InviteSchema = z.object({
  email: z.email("must be a valid email").transform((e) => e.trim().toLowerCase()),
  role: z.enum(ROLES as readonly ["OWNER", "EDITOR", "VIEWER"]),
});

export type InviteState =
  | ActionState
  | {
      ok: true;
      message: string;
      invited: { email: string; signInUrl: string; sent: boolean; error?: string };
    };

export async function inviteMemberAction(
  _prev: InviteState | null,
  formData: FormData,
): Promise<InviteState> {
  const actor = await requireOwner();
  const t = await actionT();
  const parsed = parseForm(InviteSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    const result = await inviteMember(actor, parsed.data);
    revalidatePath(PAGE);
    return {
      ok: true,
      message: result.sent ? t("invitationSent") : t("invitationReady"),
      invited: { email: parsed.data.email, ...result },
    };
  } catch (e) {
    return failedWith(e, formData);
  }
}

export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  const role = str(formData, "role");
  if (!(ROLES as readonly string[]).includes(role)) {
    redirect(withFlash(PAGE, { kind: "error", message: t("unknownRole") }));
  }
  try {
    await setMemberRole(actor, str(formData, "userId"), role as (typeof ROLES)[number]);
  } catch (e) {
    redirect(withFlash(PAGE, { kind: "error", message: await errorMessage(e) }));
  }
  revalidatePath(PAGE);
  redirect(withFlash(PAGE, { kind: "success", message: t("roleUpdated") }));
}

export async function deactivateMemberAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  try {
    await deactivateMember(actor, str(formData, "userId"));
  } catch (e) {
    redirect(withFlash(PAGE, { kind: "error", message: await errorMessage(e) }));
  }
  revalidatePath(PAGE);
  redirect(withFlash(PAGE, { kind: "success", message: t("accountDeactivated") }));
}

export async function reactivateMemberAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  try {
    await reactivateMember(actor, str(formData, "userId"));
  } catch (e) {
    redirect(withFlash(PAGE, { kind: "error", message: await errorMessage(e) }));
  }
  revalidatePath(PAGE);
  redirect(withFlash(PAGE, { kind: "success", message: t("accountReactivated") }));
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  try {
    await revokeInvitation(actor, str(formData, "email"));
  } catch (e) {
    redirect(withFlash(PAGE, { kind: "error", message: await errorMessage(e) }));
  }
  revalidatePath(PAGE);
  redirect(withFlash(PAGE, { kind: "success", message: t("invitationRevoked") }));
}
