"use client";

import { useActionState, useMemo, useState } from "react";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DocumentPreview, PAPER, sampleViewModel } from "@/lib/documents";
import { FONT_CATALOG } from "@/lib/documents/fonts/catalog";
import {
  DEFAULT_LABELS,
  LABEL_KEYS,
  TEMPLATE_IDS,
  type FontId,
  type LabelKey,
  type TemplateConfig,
  type TemplateId,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { saveTemplateAction } from "@/server/actions/templates";

const PT_TO_PX = 96 / 72;

const FONTS_BY_CATEGORY = {
  sans: FONT_CATALOG.filter((f) => f.category === "sans"),
  serif: FONT_CATALOG.filter((f) => f.category === "serif"),
};

/** Native select (type to jump) grouped Sans/Serif; each family name is set in itself. */
function FontPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: FontId;
  onChange: (id: FontId) => void;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as FontId)}>
      {(["sans", "serif"] as const).map((category) => (
        <optgroup key={category} label={category === "sans" ? "Sans" : "Serif"}>
          {FONTS_BY_CATEGORY[category].map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: `"${f.family}"` }}>
              {f.family}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

const TEMPLATE_INFO: Record<TemplateId, { name: string; character: string }> = {
  ledger: {
    name: "Ledger",
    character: "Modern and airy, sans-serif, accent rule under the header.",
  },
  classic: {
    name: "Classic",
    character: "Traditional bordered table, serif headings, boxed totals.",
  },
  compact: {
    name: "Compact",
    character: "Dense layout for long item lists; smaller type, fewer separators.",
  },
};

export function TemplateForm({
  scope,
  initial,
  cancelHref,
}: {
  scope: "instance" | string;
  initial: TemplateConfig;
  cancelHref?: string;
}) {
  const [state, action] = useActionState(saveTemplateAction.bind(null, scope), null);
  const [config, setConfig] = useState<TemplateConfig>(initial);
  const vm = useMemo(() => sampleViewModel(config), [config]);
  const paper = PAPER[config.paper.size];
  const json = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const sampleHref = `/api/documents/preview?sample=1&config=${base64url(JSON.stringify(config))}`;

  const set = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const setLabel = (key: LabelKey, value: string) =>
    setConfig((c) => {
      const labels = { ...c.labels };
      if (value.trim()) labels[key] = value;
      else delete labels[key];
      return { ...c, labels };
    });

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[6fr_6fr]">
      <input type="hidden" name="configJson" value={JSON.stringify(config)} />
      <div className="flex min-w-0 flex-col gap-6">
        <FormMessage state={state} />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Template</CardTitle>
              <CardDescription>
                Three built-ins; the customisation below applies to whichever you pick.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Template">
              {TEMPLATE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={config.templateId === id}
                  onClick={() => set("templateId", id)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors duration-150 hover:bg-surface-2",
                    config.templateId === id ? "border-primary bg-surface-2" : "border-hairline",
                  )}
                >
                  <span className="block text-app-label text-ink">{TEMPLATE_INFO[id].name}</span>
                  <span className="mt-1 block text-app-caption text-ink-subtle">
                    {TEMPLATE_INFO[id].character}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paper and type</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label="Paper size" htmlFor="paperSize">
                <Select
                  id="paperSize"
                  value={config.paper.size}
                  onChange={(e) =>
                    set("paper", {
                      ...config.paper,
                      size: e.target.value as TemplateConfig["paper"]["size"],
                    })
                  }
                >
                  <option value="A4">A4</option>
                  <option value="LETTER">Letter</option>
                </Select>
              </Field>
              <Field label="Margins" htmlFor="margins">
                <Select
                  id="margins"
                  value={config.paper.margins}
                  onChange={(e) =>
                    set("paper", {
                      ...config.paper,
                      margins: e.target.value as TemplateConfig["paper"]["margins"],
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="narrow">Narrow</option>
                </Select>
              </Field>
              <Field label="Heading font" htmlFor="fontHeading">
                <FontPicker
                  id="fontHeading"
                  value={config.font.heading}
                  onChange={(heading) => set("font", { ...config.font, heading })}
                />
              </Field>
              <Field label="Body font" htmlFor="fontBody">
                <FontPicker
                  id="fontBody"
                  value={config.font.body}
                  onChange={(body) => set("font", { ...config.font, body })}
                />
              </Field>
              <Field label="Table style" htmlFor="tableStyle">
                <Select
                  id="tableStyle"
                  value={config.table.style}
                  onChange={(e) =>
                    set("table", { style: e.target.value as TemplateConfig["table"]["style"] })
                  }
                >
                  <option value="ruled">Ruled</option>
                  <option value="zebra">Zebra</option>
                  <option value="plain">Plain</option>
                </Select>
              </Field>
              <Field label="Accent colour" htmlFor="accent">
                <div className="flex gap-2">
                  <input
                    id="accent"
                    type="color"
                    value={config.colors.accent}
                    onChange={(e) => set("colors", { ...config.colors, accent: e.target.value })}
                    className="h-8 w-12 rounded-md border border-input bg-surface-1"
                  />
                  <Input
                    value={config.colors.accent}
                    className="font-mono"
                    onChange={(e) => set("colors", { ...config.colors, accent: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Text colour" htmlFor="textColour">
                <div className="flex gap-2">
                  <input
                    id="textColour"
                    type="color"
                    value={config.colors.text}
                    onChange={(e) => set("colors", { ...config.colors, text: e.target.value })}
                    className="h-8 w-12 rounded-md border border-input bg-surface-1"
                  />
                  <Input
                    value={config.colors.text}
                    className="font-mono"
                    onChange={(e) => set("colors", { ...config.colors, text: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Logo position" htmlFor="logoPosition">
                <Select
                  id="logoPosition"
                  value={config.logo.position}
                  onChange={(e) =>
                    set("logo", {
                      ...config.logo,
                      position: e.target.value as TemplateConfig["logo"]["position"],
                    })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                  <option value="right">Right</option>
                </Select>
              </Field>
              <Field label="Logo height (mm)" htmlFor="logoHeight">
                <Input
                  id="logoHeight"
                  type="number"
                  min="8"
                  max="40"
                  value={config.logo.heightMm}
                  onChange={(e) =>
                    set("logo", { ...config.logo, heightMm: Number(e.target.value) || 16 })
                  }
                />
              </Field>
              <Field label="Document title" htmlFor="titleMode">
                <div className="flex gap-2">
                  <Select
                    id="titleMode"
                    value={config.title.mode}
                    onChange={(e) =>
                      set("title", {
                        ...config.title,
                        mode: e.target.value as TemplateConfig["title"]["mode"],
                      })
                    }
                    className="w-40"
                  >
                    <option value="auto">Automatic (GST-aware)</option>
                    <option value="custom">Custom</option>
                  </Select>
                  <Input
                    placeholder="e.g. PROFORMA INVOICE"
                    maxLength={40}
                    value={config.title.custom ?? ""}
                    disabled={config.title.mode !== "custom"}
                    onChange={(e) => set("title", { ...config.title, custom: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="QR position" htmlFor="qrPosition">
                <Select
                  id="qrPosition"
                  value={config.qr.position}
                  onChange={(e) =>
                    set("qr", { position: e.target.value as TemplateConfig["qr"]["position"] })
                  }
                >
                  <option value="footer">Footer</option>
                  <option value="header">Header</option>
                  <option value="beside-totals">Beside totals</option>
                </Select>
              </Field>
              <Field label="Amount in words" htmlFor="words">
                <Select
                  id="words"
                  value={config.totals.amountInWords}
                  onChange={(e) =>
                    set("totals", {
                      ...config.totals,
                      amountInWords: e.target.value as TemplateConfig["totals"]["amountInWords"],
                    })
                  }
                >
                  <option value="below-total">Below totals</option>
                  <option value="footer">Footer</option>
                  <option value="hidden">Hidden</option>
                </Select>
              </Field>
            </FieldGroup>
            <div className="grid gap-2 md:grid-cols-3">
              <Checkbox
                label="Subtotal row"
                checked={config.totals.showSubtotal}
                onChange={(e) =>
                  set("totals", { ...config.totals, showSubtotal: e.target.checked })
                }
              />
              <Checkbox
                label="Discount row"
                checked={config.totals.showDiscount}
                onChange={(e) =>
                  set("totals", { ...config.totals, showDiscount: e.target.checked })
                }
              />
              <Checkbox
                label="Tax lines"
                checked={config.totals.showTaxLines}
                onChange={(e) =>
                  set("totals", { ...config.totals, showTaxLines: e.target.checked })
                }
              />
              <Checkbox
                label="TDS expected"
                checked={config.totals.showTdsExpected}
                onChange={(e) =>
                  set("totals", { ...config.totals, showTdsExpected: e.target.checked })
                }
              />
              <Checkbox
                label="Rounding row"
                checked={config.totals.showRounding}
                onChange={(e) =>
                  set("totals", { ...config.totals, showRounding: e.target.checked })
                }
              />
              <Checkbox
                label="Page numbers"
                checked={config.pageNumbers}
                onChange={(e) => set("pageNumbers", e.target.checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Text</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label="Header note" htmlFor="headerNote">
                <Textarea
                  id="headerNote"
                  maxLength={300}
                  value={config.text.headerNote ?? ""}
                  onChange={(e) => set("text", { ...config.text, headerNote: e.target.value })}
                />
              </Field>
              <Field label="Footer" htmlFor="footer">
                <Textarea
                  id="footer"
                  maxLength={300}
                  value={config.text.footer ?? ""}
                  onChange={(e) => set("text", { ...config.text, footer: e.target.value })}
                />
              </Field>
              <Field label="Signature caption" htmlFor="signatureCaption">
                <Input
                  id="signatureCaption"
                  maxLength={60}
                  value={config.text.signatureCaption ?? ""}
                  placeholder={DEFAULT_LABELS.signature}
                  onChange={(e) =>
                    set("text", { ...config.text, signatureCaption: e.target.value })
                  }
                />
              </Field>
              <Field label="Draft watermark" htmlFor="draftWatermark">
                <Input
                  id="draftWatermark"
                  maxLength={40}
                  value={config.text.draftWatermark}
                  onChange={(e) => set("text", { ...config.text, draftWatermark: e.target.value })}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Labels</CardTitle>
              <CardDescription>Leave a field blank to keep the default wording.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {LABEL_KEYS.map((key) => (
                <Field key={key} label={DEFAULT_LABELS[key]} htmlFor={`label-${key}`}>
                  <Input
                    id={`label-${key}`}
                    maxLength={40}
                    value={config.labels[key] ?? ""}
                    placeholder={DEFAULT_LABELS[key]}
                    onChange={(e) => setLabel(key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingLabel="Saving…">Save template</SubmitButton>
          <Button asChild variant="secondary">
            <a href={sampleHref} target="_blank" rel="noopener">
              Download sample PDF
            </a>
          </Button>
          <Button type="button" variant="secondary" onClick={() => downloadJson(json)}>
            Export JSON
          </Button>
          {cancelHref ? (
            <Button asChild variant="tertiary">
              <a href={cancelHref}>Cancel</a>
            </Button>
          ) : null}
        </div>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <ScaledPreview pageWidthPx={paper.width * PT_TO_PX} pageHeightPx={paper.height * PT_TO_PX}>
          <DocumentPreview vm={vm} config={config} />
        </ScaledPreview>
      </aside>
    </form>
  );
}

function base64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function downloadJson(json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "okinvo-template.json";
  a.click();
  URL.revokeObjectURL(url);
}
