import { mergeTemplateConfig } from "@/lib/schemas";
import { isActor, requireOwnerApi } from "@/server/auth";
import {
  ensureDocument,
  renderCreditNoteDraftPreview,
  renderDraftPreview,
  renderSamplePdf,
} from "@/server/dal/documents";
import { isDalError, NotFoundError } from "@/server/dal/errors";
import { getDocumentStream } from "@/server/dal/documents";
import { Readable } from "node:stream";

export const runtime = "nodejs";

function pdfResponse(pdf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * `?invoice=<id>` → watermarked draft preview (issued invoices redirect to their stored PDF);
 * `?sample=1[&config=<base64url JSON>]` → the Settings → Templates sample.
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await requireOwnerApi();
  if (!isActor(actor)) return actor;
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("sample") === "1") {
      const raw = url.searchParams.get("config");
      const config = mergeTemplateConfig(
        raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) : null,
      );
      return pdfResponse(await renderSamplePdf(config), "okinvo-sample.pdf");
    }
    const invoiceId = url.searchParams.get("invoice");
    if (invoiceId) {
      try {
        return pdfResponse(await renderDraftPreview(actor, invoiceId), "invoice-draft.pdf");
      } catch (e) {
        if (!isDalError(e) || e.code !== "INVARIANT") throw e;
        // Not a draft: serve the stored document inline instead.
        const doc = await ensureDocument("INVOICE", invoiceId);
        const { stream } = await getDocumentStream(actor, doc.id);
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${doc.filename}"`,
            "Cache-Control": "private, max-age=0, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    const creditNoteId = url.searchParams.get("creditNote");
    if (creditNoteId) {
      try {
        return pdfResponse(
          await renderCreditNoteDraftPreview(actor, creditNoteId),
          "credit-note-draft.pdf",
        );
      } catch (e) {
        if (!isDalError(e) || e.code !== "INVARIANT") throw e;
        const doc = await ensureDocument("CREDIT_NOTE", creditNoteId);
        const { stream } = await getDocumentStream(actor, doc.id);
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${doc.filename}"`,
            "Cache-Control": "private, max-age=0, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    return Response.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    if (e instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    if (isDalError(e)) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
