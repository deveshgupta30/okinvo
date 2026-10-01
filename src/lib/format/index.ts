/**
 * Locale-aware formatting for documents, previews and the UI (SPEC.md §4.7, §4.10; v2 §8.7).
 * Pure: no `server-only`, no Node-only APIs, so the builder's live preview can run it in the
 * browser.
 */
export {
  formatAmount,
  formatMoney,
  formatPercent,
  formatQuantity,
  type CurrencyDisplay,
} from "./money";
export { formatDate, formatDateTime } from "./dates";
export { CURRENCY_WORDS, amountInWords } from "./words";
