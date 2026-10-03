import "server-only";
import { prisma } from "@/lib/db";
import {
  EMPTY_LEGAL_OPERATOR,
  LegalOperatorSchema,
  type LegalOperator,
} from "@/lib/schemas/legal-operator";
import type { Actor } from "@/server/actor";
import { requireRole } from "./authz";
import { getSetting, putSetting } from "./settings";

/** Public read: the legal pages render for anyone, placeholders where nothing is set. */
export async function getLegalOperator(): Promise<LegalOperator> {
  return (await getSetting(prisma, "legalOperator", LegalOperatorSchema)) ?? EMPTY_LEGAL_OPERATOR;
}

export async function saveLegalOperator(
  actor: Actor,
  input: LegalOperator,
): Promise<LegalOperator> {
  requireRole(actor, "OWNER");
  return prisma.$transaction((tx) =>
    putSetting(tx, actor, "legalOperator", input, LegalOperatorSchema),
  );
}
