"use client";

import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SliderField } from "@/components/ui/slider-field";
import { Select } from "@/components/ui/select";
import { AssetPicker } from "@/components/forms/asset-picker";
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
  const t = useTranslations("settings.templates.form");
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as FontId)}>
      {(["sans", "serif"] as const).map((category) => (
        <optgroup key={category} label={category === "sans" ? t("fontSans") : t("fontSerif")}>
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

export function TemplateForm({
  scope,
  initial,
  cancelHref,
}: {
  scope: "instance" | string;
  initial: TemplateConfig;
  cancelHref?: string;
}) {
  const t = useTranslations("settings.templates.form");
  const tc = useTranslations("common");
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
              <CardTitle>{t("templateTitle")}</CardTitle>
              <CardDescription>{t("templateDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="grid gap-3 md:grid-cols-3"
              role="radiogroup"
              aria-label={t("templateGroup")}
            >
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
                  <span className="block text-app-label text-ink">{t(`templates.${id}.name`)}</span>
                  <span className="mt-1 block text-app-caption text-ink-subtle">
                    {t(`templates.${id}.character`)}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("paperTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label={t("paperSize")} htmlFor="paperSize">
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
                  <option value="LETTER">{t("paperLetter")}</option>
                </Select>
              </Field>
              <Field label={t("margins")} htmlFor="margins">
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
                  <option value="normal">{t("marginsNormal")}</option>
                  <option value="narrow">{t("marginsNarrow")}</option>
                </Select>
              </Field>
              <Field label={t("headingFont")} htmlFor="fontHeading">
                <FontPicker
                  id="fontHeading"
                  value={config.font.heading}
                  onChange={(heading) => set("font", { ...config.font, heading })}
                />
              </Field>
              <Field label={t("bodyFont")} htmlFor="fontBody">
                <FontPicker
                  id="fontBody"
                  value={config.font.body}
                  onChange={(body) => set("font", { ...config.font, body })}
                />
              </Field>
              <Field label={t("tableStyle")} htmlFor="tableStyle">
                <Select
                  id="tableStyle"
                  value={config.table.style}
                  onChange={(e) =>
                    set("table", { style: e.target.value as TemplateConfig["table"]["style"] })
                  }
                >
                  <option value="ruled">{t("tableRuled")}</option>
                  <option value="zebra">{t("tableZebra")}</option>
                  <option value="plain">{t("tablePlain")}</option>
                </Select>
              </Field>
              <Field label={t("accentColour")} htmlFor="accent">
                <div className="flex gap-2">
                  <input
                    id="accent"
                    type="color"
                    value={config.colors.accent}
                    onChange={(e) => set("colors", { ...config.colors, accent: e.target.value })}
                    className="h-8 w-12 rounded-md border border-input bg-surface-1"
                  />
                  <Input
                    id="accent-hex"
                    value={config.colors.accent}
                    className="font-mono"
                    onChange={(e) => set("colors", { ...config.colors, accent: e.target.value })}
                  />
                </div>
              </Field>
              <Field label={t("textColour")} htmlFor="textColour">
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
              <Field label={t("logoPosition")} htmlFor="logoPosition">
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
                  <option value="left">{t("positionLeft")}</option>
                  <option value="center">{t("positionCentre")}</option>
                  <option value="right">{t("positionRight")}</option>
                </Select>
              </Field>
              <Field label={t("logoHeight")} htmlFor="logoHeight">
                <SliderField
                  id="logoHeight"
                  label={t("logoHeight")}
                  min={8}
                  max={40}
                  value={config.logo.heightMm}
                  onChange={(n) => set("logo", { ...config.logo, heightMm: n })}
                  format={(n) => `${n} mm`}
                />
              </Field>
              <Field label={t("documentTitle")} htmlFor="titleMode">
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
                    <option value="auto">{t("titleAuto")}</option>
                    <option value="custom">{t("titleCustom")}</option>
                  </Select>
                  <Input
                    placeholder={t("titlePlaceholder")}
                    maxLength={40}
                    value={config.title.custom ?? ""}
                    disabled={config.title.mode !== "custom"}
                    onChange={(e) => set("title", { ...config.title, custom: e.target.value })}
                  />
                </div>
              </Field>
              <Field label={t("qrPosition")} htmlFor="qrPosition">
                <Select
                  id="qrPosition"
                  value={config.qr.position}
                  onChange={(e) =>
                    set("qr", { position: e.target.value as TemplateConfig["qr"]["position"] })
                  }
                >
                  <option value="footer">{t("qrFooter")}</option>
                  <option value="header">{t("qrHeader")}</option>
                  <option value="beside-totals">{t("qrBesideTotals")}</option>
                </Select>
              </Field>
              <Field label={t("amountInWords")} htmlFor="words">
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
                  <option value="below-total">{t("wordsBelowTotal")}</option>
                  <option value="footer">{t("wordsFooter")}</option>
                  <option value="hidden">{t("wordsHidden")}</option>
                </Select>
              </Field>
            </FieldGroup>
            <div className="grid gap-2 md:grid-cols-3">
              <Checkbox
                label={t("subtotalRow")}
                checked={config.totals.showSubtotal}
                onChange={(e) =>
                  set("totals", { ...config.totals, showSubtotal: e.target.checked })
                }
              />
              <Checkbox
                label={t("discountRow")}
                checked={config.totals.showDiscount}
                onChange={(e) =>
                  set("totals", { ...config.totals, showDiscount: e.target.checked })
                }
              />
              <Checkbox
                label={t("taxLines")}
                checked={config.totals.showTaxLines}
                onChange={(e) =>
                  set("totals", { ...config.totals, showTaxLines: e.target.checked })
                }
              />
              <Checkbox
                label={t("tdsExpected")}
                checked={config.totals.showTdsExpected}
                onChange={(e) =>
                  set("totals", { ...config.totals, showTdsExpected: e.target.checked })
                }
              />
              <Checkbox
                label={t("roundingRow")}
                checked={config.totals.showRounding}
                onChange={(e) =>
                  set("totals", { ...config.totals, showRounding: e.target.checked })
                }
              />
              <Checkbox
                label={t("pageNumbers")}
                checked={config.pageNumbers}
                onChange={(e) => set("pageNumbers", e.target.checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("headerTitle")}</CardTitle>
              <CardDescription>{t("headerDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label={t("headerStyle")} htmlFor="headerStyle">
                <Select
                  id="headerStyle"
                  value={config.header.style}
                  onChange={(e) =>
                    set("header", {
                      ...config.header,
                      style: e.target.value as TemplateConfig["header"]["style"],
                    })
                  }
                >
                  <option value="none">{t("headerNone")}</option>
                  <option value="band">{t("headerBand")}</option>
                  <option value="image">{t("headerImage")}</option>
                </Select>
              </Field>
              <Field label={t("bandColour")} htmlFor="headerColor">
                <div className="flex gap-2">
                  <input
                    id="headerColor"
                    type="color"
                    value={config.header.color}
                    onChange={(e) => set("header", { ...config.header, color: e.target.value })}
                    className="h-8 w-12 rounded-md border border-input bg-surface-1"
                  />
                  <Input
                    value={config.header.color}
                    className="font-mono"
                    aria-label={t("bandColourHex")}
                    onChange={(e) => set("header", { ...config.header, color: e.target.value })}
                  />
                </div>
              </Field>
              <AssetPicker
                name="headerImageAssetId"
                kind="LETTERHEAD"
                label={t("headerImageLabel")}
                assetId={config.header.imageAssetId ?? null}
                hint={t("headerImageHint")}
                onChange={(assetId) =>
                  set(
                    "header",
                    (() => {
                      const { imageAssetId: _drop, ...rest } = config.header;
                      return assetId ? { ...rest, imageAssetId: assetId, style: "image" } : rest;
                    })(),
                  )
                }
              />
              <Field label={t("imageOpacity")} htmlFor="headerOpacity">
                <SliderField
                  id="headerOpacity"
                  label={t("imageOpacity")}
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.header.imageOpacity}
                  onChange={(n) => set("header", { ...config.header, imageOpacity: n })}
                  format={(n) => `${Math.round(n * 100)}%`}
                />
              </Field>
              <Field label={t("headerHeight")} htmlFor="headerHeight">
                <SliderField
                  id="headerHeight"
                  label={t("headerHeight")}
                  min={20}
                  max={60}
                  value={config.header.heightMm}
                  onChange={(n) => set("header", { ...config.header, heightMm: n })}
                  format={(n) => `${n} mm`}
                />
              </Field>
              <Field label={t("bandText")} htmlFor="headerText">
                <Select
                  id="headerText"
                  value={config.header.text}
                  onChange={(e) =>
                    set("header", {
                      ...config.header,
                      text: e.target.value as TemplateConfig["header"]["text"],
                    })
                  }
                >
                  <option value="auto">{t("bandTextAuto")}</option>
                  <option value="light">{t("bandTextLight")}</option>
                  <option value="dark">{t("bandTextDark")}</option>
                </Select>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("textTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label={t("headerNote")} htmlFor="headerNote">
                <Textarea
                  id="headerNote"
                  maxLength={300}
                  value={config.text.headerNote ?? ""}
                  onChange={(e) => set("text", { ...config.text, headerNote: e.target.value })}
                />
              </Field>
              <Field label={t("footer")} htmlFor="footer">
                <Textarea
                  id="footer"
                  maxLength={300}
                  value={config.text.footer ?? ""}
                  onChange={(e) => set("text", { ...config.text, footer: e.target.value })}
                />
              </Field>
              <Field label={t("signatureCaption")} htmlFor="signatureCaption">
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
              <Field label={t("draftWatermark")} htmlFor="draftWatermark">
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
              <CardTitle>{t("labelsTitle")}</CardTitle>
              <CardDescription>{t("labelsDescription")}</CardDescription>
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
          <SubmitButton pendingLabel={tc("saving")}>{t("save")}</SubmitButton>
          <Button asChild variant="secondary">
            <a href={sampleHref} target="_blank" rel="noopener">
              {t("downloadSample")}
            </a>
          </Button>
          <Button type="button" variant="secondary" onClick={() => downloadJson(json)}>
            {t("exportJson")}
          </Button>
          {cancelHref ? (
            <Button asChild variant="tertiary">
              <a href={cancelHref}>{tc("cancel")}</a>
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
