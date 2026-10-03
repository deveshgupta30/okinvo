"use server";

import { revalidatePath } from "next/cache";
import { parseForm } from "@/lib/forms";
import { LegalOperatorSchema } from "@/lib/schemas/legal-operator";
import { requireOwner } from "@/server/auth";
import { saveLegalOperator } from "@/server/dal/legal";
import { failedParse, failedWith, type ActionState } from "./shared";

export type LegalState = ActionState | { ok: true; message: string };

export async function saveLegalOperatorAction(
  _prev: LegalState | null,
  formData: FormData,
): Promise<LegalState> {
  const actor = await requireOwner();
  const parsed = parseForm(LegalOperatorSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await saveLegalOperator(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath("/settings/legal");
  for (const p of ["terms", "acceptable-use", "privacy", "data-retention", "security", "cookies"]) {
    revalidatePath(`/legal/${p}`);
  }
  return { ok: true, message: "Operator details saved. The legal pages now show them." };
}
