"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { requireRole } from "@/server/auth";
import { revokeOtherSessions, revokeSessionById } from "@/server/dal/sessions";
import { errorMessage, str } from "./shared";

const PAGE = "/settings/security";

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const actor = await requireRole("VIEWER");
  try {
    await revokeSessionById(actor, str(formData, "id"));
  } catch (e) {
    redirect(withFlash(PAGE, { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(PAGE);
  redirect(withFlash(PAGE, { kind: "success", message: "Session revoked" }));
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const actor = await requireRole("VIEWER");
  let count = 0;
  try {
    count = await revokeOtherSessions(actor);
  } catch (e) {
    redirect(withFlash(PAGE, { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(PAGE);
  redirect(
    withFlash(PAGE, {
      kind: "success",
      message: count === 0 ? "No other sessions" : `Signed out of ${count} other session(s)`,
    }),
  );
}
