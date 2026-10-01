import QRCode from "qrcode";

/** PNG data URL for the verification QR (SPEC §4.6). Server-side only. */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 0, width: 256 });
}
