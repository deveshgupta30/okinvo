// Browser-safe exports (the live preview imports these). The PDF renderer, fonts and QR live in
// ./render, ./fonts and ./qr and are server-only.
export type {
  DocumentViewModel,
  RenderInput,
  RenderItem,
  RenderTaxLine,
  TotalsRow,
  ViewModelItem,
  ViewModelOptions,
} from "./view-model";
export { buildDocumentViewModel, documentTitle } from "./view-model";
export { DocumentPreview } from "./templates/Preview";
export { PAPER, templateStyle, type TemplateStyle } from "./templates/styles";
export { sampleRenderInput, sampleViewModel } from "./sample";
