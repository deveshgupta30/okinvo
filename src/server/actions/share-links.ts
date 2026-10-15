"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseForm } from "@/lib/forms";
import { generatePassphrase } from "@/lib/security/passphrase";
import { requireRole } from "@/server/auth";
import { isDalError } from "@/server/dal/errors";
import { createShareLink, revokeShareLink } from "@/server/dal/share-links";
import { actionT, failedParse, str, type ActionState } from "./shared";

const CreateSchema = z.object({
  kind: z.enum(["INVOICE", "CREDIT_NOTE"]),
  id: z.string().min(1),
  expires: z.enum(["7", "30", "90", "never"]).default("never"),
  protection: z.enum(["none", "auto", "manual"]).default("none"),
  password: z.string().max(128).optional(),
});

export type ShareState =
  ActionState | { ok: true; message: string; created: { url: string; password: string | null } };

const pageFor = (kind: "INVOICE" | "CREDIT_NOTE", id: string) =>
  kind === "INVOICE" ? `/invoices/${id}` : `/credit-notes/${id}`;

export async function createShareLinkAction(
  _prev: ShareState | null,
  formData: FormData,
): Promise<ShareState> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const parsed = parseForm(CreateSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  const { kind, id, expires, protection } = parsed.data;
  const password =
    protection === "auto"
      ? generatePassphrase()
      : protection === "manual"
        ? (parsed.data.password ?? "").trim()
        : null;
  if (protection === "manual" && !password) {
    return {
      ok: false,
      fieldErrors: { password: [t("sharePasswordRequired")] },
      message: t("fixFields"),
      values: {},
    };
  }
  try {
    const result = await createShareLink(actor, {
      kind,
      id,
      password,
      expiresInDays: expires === "never" ? null : (Number(expires) as 7 | 30 | 90),
    });
    revalidatePath(pageFor(kind, id));
    return {
      ok: true,
      message: t("shareLinkCreated"),
      created: { url: result.url, password: result.password },
    };
  } catch (e) {
    if (!isDalError(e)) throw e;
    return { ok: false, fieldErrors: {}, message: e.message, values: {} };
  }
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const linkId = str(formData, "linkId");
  const kind = str(formData, "kind") === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE";
  const id = str(formData, "id");
  await revokeShareLink(actor, linkId);
  revalidatePath(pageFor(kind, id));
}
