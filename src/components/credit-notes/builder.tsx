"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Amount, Mono } from "@/components/ui/mono";
import { Textarea } from "@/components/ui/textarea";
import { pickerSubtotal, type PickerSelection } from "@/lib/credit-notes/picker";
import { creditNoteRenderInput } from "@/lib/credit-notes/preview";
import { DocumentPreview, PAPER, buildDocumentViewModel } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { D } from "@/lib/money";
import type { TemplateConfig } from "@/lib/schemas";
import { saveCreditNoteDraft } from "@/server/actions/credit-notes";
import type { CreditNoteDto } from "@/server/dal/credit-notes";
import type { InvoiceDto } from "@/server/dal/invoices";

const PT_TO_PX = 96 / 72;

export function CreditNoteBuilder({
  invoice,
  config,
  creditNote,
  today,
}: {
  invoice: InvoiceDto;
  config: TemplateConfig;
  creditNote: CreditNoteDto | null;
  today: string;
}) {
  const [state, action] = useActionState(
    saveCreditNoteDraft.bind(null, creditNote?.id ?? null),
    null,
  );
  const errors = state?.fieldErrors;
  const [reason, setReason] = useState(state?.values?.reason ?? creditNote?.reason ?? "");
  const [subtotal, setSubtotal] = useState(state?.values?.subtotal ?? creditNote?.subtotal ?? "");
  const [issueDate, setIssueDate] = useState(
    state?.values?.issueDate ?? creditNote?.issueDate ?? today,
  );
  const [selection, setSelection] = useState<PickerSelection[]>([]);
  const money = (v: string) => formatMoney(v, invoice.currency, invoice.locale);

  const outstandingTaxable = useMemo(() => {
    const credited = invoice.creditNotes
      .filter((c) => c.status === "ISSUED")
      .reduce((n, c) => n.plus(D(c.total)), D(0));
    // Approximation for the hint: issued credits reduce the taxable headroom by their subtotal
    // share; the server applies the exact rule at issue time.
    return D(invoice.taxableAmount).minus(
      credited.gt(0) ? credited.div(D(invoice.total)).mul(D(invoice.taxableAmount)) : 0,
    );
  }, [invoice]);

  const preview = useMemo(() => {
    const input = creditNoteRenderInput({
      invoice,
      reason,
      subtotal,
      issueDate,
      displayConfig: creditNote?.displayConfig ?? invoice.displayConfig,
    });
    return buildDocumentViewModel(input, {
      appUrl: "",
      assetUrl: (id) => `/api/assets/id/${id}`,
      config,
      draft: true,
    });
  }, [invoice, reason, subtotal, issueDate, config, creditNote]);
  const paper = PAPER[config.paper.size];

  const applyPicker = (next: PickerSelection[]) => {
    setSelection(next);
    setSubtotal(
      pickerSubtotal(
        invoice.items.map((i) => ({ position: i.position, lineSubtotal: i.lineSubtotal })),
        next,
        invoice.currency,
      ),
    );
  };
  const selected = (position: number) => selection.find((s) => s.position === position);

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[6fr_6fr]">
      <input type="hidden" name="invoiceId" value={invoice.id} />
      <div className="flex min-w-0 flex-col gap-6">
        <FormMessage state={state} />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                Against <Mono>{invoice.number}</Mono>
              </CardTitle>
              <CardDescription>
                {invoice.clientName} · total {money(invoice.total)} · balance{" "}
                {money(invoice.balanceDue)} · taxable headroom ≈{" "}
                {money(outstandingTaxable.toFixed(2))}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label="Issue date" htmlFor="issueDate" error={errors?.issueDate} required>
                <Input
                  id="issueDate"
                  name="issueDate"
                  type="date"
                  className="font-mono"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
              <Field
                label="Credit amount (excluding tax)"
                htmlFor="subtotal"
                error={errors?.subtotal}
                hint="Tax is apportioned from the invoice's tax lines"
                required
              >
                <Input
                  id="subtotal"
                  name="subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={subtotal}
                  onChange={(e) => {
                    setSubtotal(e.target.value);
                    setSelection([]);
                  }}
                />
              </Field>
            </FieldGroup>
            <Field label="Reason" htmlFor="reason" error={errors?.reason} required>
              <Textarea
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Compute from invoice lines</CardTitle>
              <CardDescription>
                Tick whole lines or a percentage; this only fills the amount above.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full border-collapse text-app-table">
                <thead className="bg-surface-2 text-app-label text-ink-subtle">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Line</th>
                    <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                    <th className="px-2 py-2 text-left font-medium">Credit</th>
                    <th className="px-2 py-2 text-left font-medium">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {invoice.items.map((it) => {
                    const sel = selected(it.position);
                    return (
                      <tr key={it.position}>
                        <td className="px-2 py-2">
                          {it.position}. {it.description}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Amount>{money(it.lineSubtotal)}</Amount>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            aria-label={`Credit line ${it.position}`}
                            checked={Boolean(sel)}
                            onChange={(e) =>
                              applyPicker(
                                e.target.checked
                                  ? [
                                      ...selection,
                                      { position: it.position, mode: "whole" as const },
                                    ]
                                  : selection.filter((s) => s.position !== it.position),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            aria-label={`Percent of line ${it.position}`}
                            className="w-20"
                            disabled={!sel}
                            value={sel?.mode === "percent" ? sel.percent : sel ? "100" : ""}
                            onChange={(e) =>
                              applyPicker(
                                selection.map((s) =>
                                  s.position === it.position
                                    ? {
                                        position: s.position,
                                        mode: "percent" as const,
                                        percent: e.target.value,
                                      }
                                    : s,
                                ),
                              )
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton name="intent" value="save" variant="secondary" pendingLabel="Saving…">
            Save draft
          </SubmitButton>
          <SubmitButton name="intent" value="issue" pendingLabel="Issuing…">
            Save and issue
          </SubmitButton>
          <Button asChild variant="tertiary">
            <Link href={creditNote ? `/credit-notes/${creditNote.id}` : `/invoices/${invoice.id}`}>
              Cancel
            </Link>
          </Button>
        </div>
      </div>
      <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <ScaledPreview pageWidthPx={paper.width * PT_TO_PX} pageHeightPx={paper.height * PT_TO_PX}>
          <DocumentPreview vm={preview} config={config} />
        </ScaledPreview>
      </aside>
    </form>
  );
}
