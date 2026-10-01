"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/server/auth-config";
import { getSession } from "@/server/auth";

/** Sign out the current session, audited; the sidebar posts a form to this action. */
export async function signOutAction(): Promise<void> {
  const h = await headers();
  const s = await getSession();
  if (s) {
    await prisma.auditEvent.create({
      data: {
        actorId: s.user.id,
        action: "auth.sign_out",
        entityType: "Session",
        entityId: s.session.id,
        ipAddress: s.session.ipAddress ?? null,
        userAgent: s.session.userAgent ?? null,
      },
    });
    await auth.api.signOut({ headers: h });
  }
  redirect("/auth/sign-in");
}
