import type { Role } from "@/server/actor";
import type { DatasetId } from "./types";

/**
 * The lowest role that may export each dataset (spec §9b). Money movements and tax summaries
 * are an editor's business; registers and master data are readable by anyone signed in.
 */
export const DATASET_MIN_ROLE: Record<DatasetId, Role> = {
  invoices: "VIEWER",
  "invoice-items": "VIEWER",
  payments: "EDITOR",
  "credit-notes": "VIEWER",
  clients: "VIEWER",
  services: "VIEWER",
  products: "VIEWER",
  "gst-summary": "EDITOR",
  "tds-summary": "EDITOR",
};
