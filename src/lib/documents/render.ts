import { renderToBuffer } from "@react-pdf/renderer";
import type { TemplateConfig } from "@/lib/schemas";
import { registerFonts } from "./fonts";
import type { ProtectOptions } from "./protect";
import { qrDataUrl } from "./qr";
import { DocumentPdf, type PdfImages } from "./templates/Pdf";
import type { DocumentViewModel } from "./view-model";

export interface RenderOptions {
  /** Resolves an asset id to its bytes (PNG); null hides the image rather than failing the render. */
  assets: (assetId: string) => Promise<Buffer | null>;
  /** PDF creation/modification date. Fixed per document so identical input hashes identically. */
  createdAt?: Date;
  /** Encrypt (AES-256) with a user password to open and an owner password for the rest. */
  protect?: ProtectOptions | undefined;
}

async function dataUrl(
  assets: RenderOptions["assets"],
  assetId: string | undefined,
): Promise<string | undefined> {
  if (!assetId) return undefined;
  const bytes = await assets(assetId);
  if (!bytes) return undefined;
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/** Renders a view-model to PDF bytes in the Node runtime (v2 §12.1). */
export async function renderPdf(
  vm: DocumentViewModel,
  config: TemplateConfig,
  o: RenderOptions,
): Promise<Buffer> {
  registerFonts();
  const [logo, signature, stamp, header] = await Promise.all([
    dataUrl(o.assets, vm.issuer.logoAssetId),
    dataUrl(o.assets, vm.issuer.signatureAssetId),
    dataUrl(o.assets, vm.issuer.stampAssetId),
    dataUrl(o.assets, config.header.style === "image" ? config.header.imageAssetId : undefined),
  ]);
  const images: PdfImages = {};
  if (logo) images.logo = logo;
  if (signature) images.signature = signature;
  if (stamp) images.stamp = stamp;
  if (header) images.header = header;
  const withQr: DocumentViewModel =
    vm.qrText && !vm.qrDataUrl ? { ...vm, qrDataUrl: await qrDataUrl(vm.qrText) } : vm;
  // DocumentPdf is a pure function of its props (no hooks), so it is called directly to obtain
  // the <Document> element renderToBuffer expects.
  const element = DocumentPdf({
    vm: withQr,
    config,
    images,
    createdAt: o.createdAt ?? new Date(0),
    ...(o.protect ? { protect: o.protect } : {}),
  });
  return Buffer.from(await renderToBuffer(element));
}
