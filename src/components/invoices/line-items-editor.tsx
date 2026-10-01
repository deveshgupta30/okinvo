"use client";

import type React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/lib/forms";
import type { BuilderItem } from "@/lib/invoices/client-preview";
import { UNIT_LABELS, UNIT_TYPES } from "@/lib/schemas/service-input";
import type { ServiceDto } from "@/server/dal/services";

const EXEMPT = "__exempt";

const EMPTY: BuilderItem = {
  description: "",
  sacHsnCode: "",
  unitType: "HOUR",
  quantity: "1",
  unitPrice: "",
  taxRate: "18",
};

export function LineItemsEditor({
  items,
  services,
  rates,
  allowExempt = false,
  errors,
  onChange,
}: {
  items: BuilderItem[];
  services: ServiceDto[];
  rates: readonly string[] | null;
  /** UK VAT: offer "Exempt" beside the rates (SPEC §4.7). */
  allowExempt?: boolean | undefined;
  errors?: FieldErrors | undefined;
  onChange: (items: BuilderItem[]) => void;
}) {
  const rows = items.length === 0 ? [EMPTY] : items;
  const update = (i: number, patch: Partial<BuilderItem>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const addFromService = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    const row: BuilderItem = {
      description: s.description ? `${s.name}\n${s.description}` : s.name,
      sacHsnCode: s.sacHsnCode ?? "",
      unitType: s.unitType,
      quantity: "1",
      unitPrice: s.defaultRate,
      taxRate: s.defaultTaxRate,
      serviceItemId: s.id,
    };
    const base = items.length === 0 ? [] : rows;
    onChange([...base, row]);
  };
  const err = (i: number, key: keyof BuilderItem) => errors?.[`items.${i}.${key}`];
  /**
   * Enter in a single-line field never submits the form (that would save or issue by accident):
   * on the last row it adds a line, otherwise it moves to the next row's description.
   */
  const rowKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (i === rows.length - 1) onChange([...rows, EMPTY]);
    const focusNext = () =>
      document
        .querySelector<HTMLTextAreaElement>(`[aria-label="Line ${i + 2} description"]`)
        ?.focus();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focusNext);
    else focusNext();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {services.length > 0 ? (
          <Select
            aria-label="Add from catalogue"
            className="w-64"
            value=""
            onChange={(e) => {
              addFromService(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Add from catalogue…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.defaultRate} {s.currency}/{UNIT_LABELS[s.unitType].toLowerCase()}
              </option>
            ))}
          </Select>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...(items.length === 0 ? [] : rows), EMPTY])}
        >
          <Plus /> Add line
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full border-collapse text-app-table">
          <thead className="bg-surface-2 text-app-label text-ink-subtle">
            <tr>
              <th className="px-2 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">Description</th>
              <th className="px-2 py-2 text-left font-medium">SAC/HSN</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-left font-medium">Unit</th>
              <th className="px-2 py-2 text-right font-medium">Rate</th>
              <th className="px-2 py-2 text-right font-medium">Tax %</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((row, i) => (
              <tr key={i} className="align-top">
                <td className="px-2 py-2 text-ink-subtle">{i + 1}</td>
                <td className="min-w-64 px-2 py-2">
                  {row.serviceItemId ? (
                    <input
                      type="hidden"
                      name={`items[${i}].serviceItemId`}
                      value={row.serviceItemId}
                    />
                  ) : null}
                  <Textarea
                    name={`items[${i}].description`}
                    aria-label={`Line ${i + 1} description`}
                    rows={2}
                    className="min-h-9"
                    value={row.description}
                    invalid={Boolean(err(i, "description"))}
                    onChange={(e) => update(i, { description: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        onChange([...rows, EMPTY]);
                      }
                    }}
                  />
                  {err(i, "description") ? (
                    <p role="alert" className="text-app-caption text-semantic-danger">
                      {err(i, "description")?.join(" ")}
                    </p>
                  ) : null}
                </td>
                <td className="w-28 px-2 py-2">
                  <Input
                    name={`items[${i}].sacHsnCode`}
                    aria-label={`Line ${i + 1} SAC/HSN`}
                    className="font-mono"
                    value={row.sacHsnCode}
                    invalid={Boolean(err(i, "sacHsnCode"))}
                    onChange={(e) => update(i, { sacHsnCode: e.target.value })}
                    onKeyDown={rowKeyDown(i)}
                  />
                </td>
                <td className="w-24 px-2 py-2">
                  <Input
                    name={`items[${i}].quantity`}
                    aria-label={`Line ${i + 1} quantity`}
                    type="number"
                    step="0.001"
                    min="0"
                    value={row.quantity}
                    invalid={Boolean(err(i, "quantity"))}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                    onKeyDown={rowKeyDown(i)}
                  />
                </td>
                <td className="w-28 px-2 py-2">
                  <Select
                    name={`items[${i}].unitType`}
                    aria-label={`Line ${i + 1} unit`}
                    value={row.unitType}
                    onChange={(e) =>
                      update(i, { unitType: e.target.value as BuilderItem["unitType"] })
                    }
                  >
                    {UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="w-32 px-2 py-2">
                  <Input
                    name={`items[${i}].unitPrice`}
                    aria-label={`Line ${i + 1} rate`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.unitPrice}
                    invalid={Boolean(err(i, "unitPrice"))}
                    onChange={(e) => update(i, { unitPrice: e.target.value })}
                    onKeyDown={rowKeyDown(i)}
                  />
                </td>
                <td className="w-24 px-2 py-2">
                  {rates ? (
                    <>
                      <input type="hidden" name={`items[${i}].taxRate`} value={row.taxRate} />
                      <input
                        type="hidden"
                        name={`items[${i}].taxExempt`}
                        value={row.taxExempt ? "true" : "false"}
                      />
                      <Select
                        aria-label={`Line ${i + 1} tax rate`}
                        value={
                          row.taxExempt
                            ? EXEMPT
                            : rates.includes(row.taxRate)
                              ? row.taxRate
                              : rates[0]
                        }
                        onChange={(e) =>
                          e.target.value === EXEMPT
                            ? update(i, { taxRate: "0", taxExempt: true })
                            : update(i, { taxRate: e.target.value, taxExempt: false })
                        }
                      >
                        {rates.map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                        {allowExempt ? <option value={EXEMPT}>Exempt</option> : null}
                      </Select>
                    </>
                  ) : (
                    <Input
                      name={`items[${i}].taxRate`}
                      aria-label={`Line ${i + 1} tax rate`}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={row.taxRate}
                      onChange={(e) => update(i, { taxRate: e.target.value })}
                      onKeyDown={rowKeyDown(i)}
                    />
                  )}
                </td>
                <td className="px-1 py-2 whitespace-nowrap">
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon"
                    aria-label="Move down"
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon"
                    aria-label="Remove line"
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errors?.items ? (
        <p role="alert" className="text-app-caption text-semantic-danger">
          {errors.items.join(" ")}
        </p>
      ) : null}
      <p className="text-app-caption text-ink-subtle">Ctrl/⌘+Enter in a description adds a line.</p>
    </div>
  );
}
