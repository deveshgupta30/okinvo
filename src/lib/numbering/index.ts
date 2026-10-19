/**
 * Numbering - the pure half (fiscal years and number formats). The sequence allocator
 * `allocateDocumentNumber()` lives in the DAL (Task 12) and is the only code that may assign a
 * number, inside the issue transaction (CLAUDE.md "Numbering").
 */
export * from "./fiscal-year";
export * from "./format";
