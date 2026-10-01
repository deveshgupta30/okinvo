import "server-only";
import { clientsDataset } from "./clients";
import { creditNotesDataset } from "./credit-notes";
import { gstSummaryDataset } from "./gst-summary";
import { invoiceItemsDataset } from "./invoice-items";
import { invoicesDataset } from "./invoices";
import { paymentsDataset } from "./payments";
import { servicesDataset } from "./services";
import { tdsSummaryDataset } from "./tds-summary";
import type { AnyDataset } from "./types";

export type { AnyDataset, Dataset, RowsOptions } from "./types";

/** Every export dataset, in SPEC §4.11 order. */
export const DATASETS: AnyDataset[] = [
  invoicesDataset,
  invoiceItemsDataset,
  paymentsDataset,
  creditNotesDataset,
  clientsDataset,
  servicesDataset,
  gstSummaryDataset,
  tdsSummaryDataset,
];

export function getDataset(id: string): AnyDataset | null {
  return DATASETS.find((d) => d.id === id) ?? null;
}
