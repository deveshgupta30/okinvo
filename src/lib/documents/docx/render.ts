import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
  type ISectionOptions,
  type ParagraphChild,
} from "docx";
import type { TemplateConfig } from "@/lib/schemas";
import { PT_PER_MM, templateStyle, type TemplateStyle } from "../templates/styles";
import { splitPageOf } from "../page-text";
import type { DocumentViewModel } from "../view-model";

/**
 * DOCX twin of the PDF (spec §9d): the same view-model and template config, laid out with the
 * `docx` writer - page size and margins, header band or plain header, parties, an items table
 * whose header row repeats on every page, totals, words, payment details, notes, terms, the QR
 * and signature block, and a footer with the number and "Page n of N". Parameters only: nothing
 * the user typed becomes markup, and no font outside the catalogue is referenced.
 */
export interface DocxImages {
  logo?: Buffer | undefined;
  header?: Buffer | undefined;
  qr?: Buffer | undefined;
  signature?: Buffer | undefined;
  stamp?: Buffer | undefined;
}

const TWIPS_PER_PT = 20;
const twips = (pt: number) => Math.round(pt * TWIPS_PER_PT);
const hex = (c: string) => c.replace(/^#/, "").toUpperCase();
/** Half-points, as Word measures run sizes. */
const half = (pt: number) => Math.round(pt * 2);

const NO_BORDER: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};
const CELL_NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

function rule(color: string, size = 4): IBorderOptions {
  return { style: BorderStyle.SINGLE, size, color: hex(color) };
}

function pageNumberPng(dataUrl: string | undefined): Buffer | undefined {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return undefined;
  return Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
}

interface Ctx {
  s: TemplateStyle;
  vm: DocumentViewModel;
  images: DocxImages;
  contentWidth: number; // twips
}

interface RunOptions {
  bold?: boolean | undefined;
  italics?: boolean | undefined;
  size?: number | undefined;
  color?: string | undefined;
  font?: string | undefined;
}

/** Builds a run; undefined options are dropped (exactOptionalPropertyTypes). */
function run(text: string, o: RunOptions = {}) {
  const clean = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return new TextRun({ text, ...clean });
}

function para(
  children: ParagraphChild[] | string,
  o: Omit<ConstructorParameters<typeof Paragraph>[0] & object, "children" | "text"> = {},
): Paragraph {
  return new Paragraph({
    ...o,
    children: typeof children === "string" ? [run(children)] : children,
  });
}

function lines(
  ctx: Ctx,
  texts: string[],
  o: { muted?: boolean; bold?: boolean } = {},
): Paragraph[] {
  return texts.map((t) =>
    para([run(t, { color: o.muted ? hex(ctx.s.muted) : undefined, bold: o.bold })], {
      spacing: { after: 0 },
    }),
  );
}

function cell(
  children: Paragraph[] | Table[],
  o: {
    width?: number;
    fill?: string;
    borders?: typeof CELL_NO_BORDERS;
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
    verticalAlign?: "top" | "center" | "bottom";
    columnSpan?: number;
  } = {},
): TableCell {
  return new TableCell({
    children,
    ...(o.width !== undefined ? { width: { size: o.width, type: WidthType.DXA } } : {}),
    ...(o.fill ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(o.fill) } } : {}),
    borders: o.borders ?? CELL_NO_BORDERS,
    ...(o.margins ? { margins: o.margins } : {}),
    ...(o.verticalAlign ? { verticalAlign: o.verticalAlign } : {}),
    ...(o.columnSpan ? { columnSpan: o.columnSpan } : {}),
  });
}

function fullWidthTable(rows: TableRow[], columnWidths: number[]): Table {
  return new Table({
    rows,
    columnWidths,
    width: { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: NO_BORDERS,
  });
}

function identityBlock(ctx: Ctx, color?: string): Paragraph[] {
  const { vm, s } = ctx;
  const out: Paragraph[] = [];
  out.push(
    para(
      [run(vm.issuer.legalName, { bold: true, size: half(s.base + 4), color, font: s.heading })],
      {
        spacing: { after: 0 },
      },
    ),
  );
  if (vm.issuer.tradeName)
    out.push(
      para([run(vm.issuer.tradeName, { color: color ?? hex(s.muted) })], { spacing: { after: 0 } }),
    );
  return out;
}

function issuerDetails(ctx: Ctx): Paragraph[] {
  const { vm } = ctx;
  const details: string[] = [
    ...vm.issuer.addressLines,
    ...(vm.issuer.email ? [vm.issuer.email] : []),
    ...(vm.issuer.phone ? [vm.issuer.phone] : []),
    ...(vm.issuer.website ? [vm.issuer.website] : []),
  ];
  const ids: string[] = [
    ...(vm.issuer.gstin ? [`GSTIN ${vm.issuer.gstin}`] : []),
    ...(vm.issuer.pan ? [`PAN ${vm.issuer.pan}`] : []),
    ...(vm.issuer.cin ? [`CIN ${vm.issuer.cin}`] : []),
    ...(vm.issuer.ukVatNumber ? [`VAT ${vm.issuer.ukVatNumber}`] : []),
    ...(vm.issuer.lutNumber
      ? [
          `LUT ${vm.issuer.lutNumber}${vm.issuer.lutFiscalYear ? ` (${vm.issuer.lutFiscalYear})` : ""}`,
        ]
      : []),
  ];
  return [...lines(ctx, details, { muted: true }), ...lines(ctx, ids)];
}

function metaBlock(ctx: Ctx, withTitle: boolean): Paragraph[] {
  const { vm, s } = ctx;
  const out: Paragraph[] = [];
  if (withTitle) {
    out.push(
      para(
        [
          run(vm.title, {
            bold: true,
            size: half(s.base * 2),
            font: s.heading,
            color: hex(s.variant === "ledger" ? s.accent : s.text),
          }),
        ],
        { alignment: AlignmentType.RIGHT, spacing: { after: 0 } },
      ),
    );
    if (vm.number) {
      out.push(
        para([run(vm.number, { bold: true, size: half(s.base + 2), font: s.heading })], {
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
        }),
      );
    }
  }
  if (vm.replaces)
    out.push(
      para([run(vm.replaces, { color: hex(s.muted) })], {
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
      }),
    );
  const meta: [string, string][] = [[vm.labels.issueDate, vm.issueDate]];
  if (vm.dueDate) meta.push([vm.labels.dueDate, vm.dueDate]);
  if (vm.paymentTerms) meta.push([vm.labels.terms, vm.paymentTerms]);
  if (vm.einvoice) {
    meta.push([vm.text.irn, vm.einvoice.irn]);
    meta.push([vm.text.ackNo, `${vm.einvoice.ackNo} · ${vm.text.ackDate} ${vm.einvoice.ackDate}`]);
  }
  for (const [label, value] of meta) {
    out.push(
      para([run(`${label}  `, { color: hex(s.muted), size: half(s.base - 1) }), run(value)], {
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
      }),
    );
  }
  if (vm.poReference) {
    out.push(
      para([run(`${vm.labels.poReference}: ${vm.poReference}`, { color: hex(s.muted) })], {
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
      }),
    );
  }
  return out;
}

function imageParagraph(
  data: Buffer | undefined,
  heightPt: number,
  maxWidthPt: number,
  align?: (typeof AlignmentType)[keyof typeof AlignmentType],
): Paragraph | null {
  if (!data) return null;
  // Word scales to the box we give; a logo is fitted by height, capped by width.
  const widthPt = Math.min(maxWidthPt, heightPt * 3);
  return new Paragraph({
    ...(align ? { alignment: align } : {}),
    spacing: { after: 0 },
    children: [
      new ImageRun({
        type: "png",
        data,
        transformation: {
          width: Math.round(widthPt * (96 / 72)),
          height: Math.round(heightPt * (96 / 72)),
        },
      }),
    ],
  });
}

function headerSection(ctx: Ctx): (Paragraph | Table)[] {
  const { s, vm, images, contentWidth } = ctx;
  const inBand = s.headerStyle !== "none";
  const out: (Paragraph | Table)[] = [];
  if (inBand) {
    const bandText = s.headerText === "light" ? "FFFFFF" : hex(s.text);
    const fill = s.headerStyle === "band" ? s.headerColor : "#f3f4f6";
    const left: Paragraph[] = [];
    const logo = imageParagraph(
      images.logo && vm.showLogo ? images.logo : undefined,
      s.logoHeight,
      160,
    );
    if (logo) left.push(logo);
    left.push(...identityBlock(ctx, bandText));
    const right = [
      para(
        [run(vm.title, { bold: true, size: half(s.base * 2), font: s.heading, color: bandText })],
        {
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
        },
      ),
      ...(vm.number
        ? [
            para(
              [
                run(vm.number, {
                  bold: true,
                  size: half(s.base + 2),
                  font: s.heading,
                  color: bandText,
                }),
              ],
              { alignment: AlignmentType.RIGHT, spacing: { after: 0 } },
            ),
          ]
        : []),
    ];
    const pad = twips(10);
    const w = Math.round(contentWidth / 2);
    out.push(
      fullWidthTable(
        [
          new TableRow({
            children: [
              cell(left, {
                width: w,
                fill,
                margins: { top: pad, bottom: pad, left: pad, right: pad },
                verticalAlign: VerticalAlign.CENTER,
              }),
              cell(right, {
                width: contentWidth - w,
                fill,
                margins: { top: pad, bottom: pad, left: pad, right: pad },
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
          }),
        ],
        [w, contentWidth - w],
      ),
    );
    out.push(para("", { spacing: { after: twips(6) } }));
    const w2 = Math.round(contentWidth * 0.6);
    out.push(
      fullWidthTable(
        [
          new TableRow({
            children: [
              cell(issuerDetails(ctx), { width: w2 }),
              cell(metaBlock(ctx, false), { width: contentWidth - w2 }),
            ],
          }),
        ],
        [w2, contentWidth - w2],
      ),
    );
  } else {
    const left: Paragraph[] = [];
    const logo = imageParagraph(
      images.logo && vm.showLogo ? images.logo : undefined,
      s.logoHeight,
      160,
    );
    if (logo) left.push(logo);
    left.push(...identityBlock(ctx), ...issuerDetails(ctx));
    const w = Math.round(contentWidth * 0.6);
    out.push(
      fullWidthTable(
        [
          new TableRow({
            children: [
              cell(left, { width: w }),
              cell(metaBlock(ctx, true), { width: contentWidth - w }),
            ],
          }),
        ],
        [w, contentWidth - w],
      ),
    );
  }
  if (vm.headerNote)
    out.push(
      para([run(vm.headerNote, { color: hex(s.muted) })], {
        spacing: { before: twips(4), after: 0 },
      }),
    );
  // header rule
  out.push(
    new Paragraph({
      spacing: { before: twips(6), after: twips(10) },
      border: { bottom: rule(s.accentRule ? s.accent : s.hairline, s.accentRule ? 12 : 6) },
      children: [],
    }),
  );
  return out;
}

function eyebrow(ctx: Ctx, text: string): Paragraph {
  return para(
    [run(text.toUpperCase(), { color: hex(ctx.s.muted), size: half(ctx.s.base - 1.5) })],
    { spacing: { after: twips(2) } },
  );
}

function partiesSection(ctx: Ctx): Table {
  const { vm, s, contentWidth } = ctx;
  const docLabel = vm.kind === "CREDIT_NOTE" ? vm.labels.creditNote : vm.labels.invoice;
  const columns: Paragraph[][] = [];
  columns.push([
    eyebrow(ctx, vm.labels.billTo),
    ...lines(ctx, [vm.client.displayName], { bold: true }),
    ...lines(ctx, vm.client.contactPerson ? [vm.client.contactPerson] : []),
    ...lines(ctx, vm.client.billingAddressLines, { muted: true }),
    ...lines(
      ctx,
      [
        ...(vm.client.email ? [vm.client.email] : []),
        ...(vm.client.phone ? [vm.client.phone] : []),
      ],
      { muted: true },
    ),
    ...lines(
      ctx,
      vm.client.taxId ? [`${vm.client.taxIdType ?? vm.text.taxId} ${vm.client.taxId}`] : [],
    ),
  ]);
  if (vm.client.shippingAddressLines?.length) {
    columns.push([
      eyebrow(ctx, vm.labels.shipTo),
      ...lines(ctx, vm.client.shippingAddressLines, { muted: true }),
    ]);
  }
  if (vm.placeOfSupply || vm.creditNote) {
    const col: Paragraph[] = [];
    if (vm.placeOfSupply)
      col.push(eyebrow(ctx, vm.labels.placeOfSupply), ...lines(ctx, [vm.placeOfSupply]));
    if (vm.creditNote) {
      col.push(
        eyebrow(
          ctx,
          `Against ${docLabel === vm.labels.creditNote ? vm.labels.invoice.toLowerCase() : "invoice"}`,
        ),
        ...lines(ctx, [`${vm.creditNote.againstNumber} · ${vm.creditNote.againstDate}`]),
        ...lines(ctx, [vm.creditNote.reason], { muted: true }),
      );
    }
    columns.push(col);
  }
  const w = Math.floor(contentWidth / columns.length);
  const pad = s.tinted ? twips(8) : 0;
  return fullWidthTable(
    [
      new TableRow({
        children: columns.map((c) =>
          cell(c, {
            width: w,
            ...(s.tinted ? { fill: s.tint } : {}),
            margins: { top: pad, bottom: pad, left: pad, right: pad },
          }),
        ),
      }),
    ],
    columns.map(() => w),
  );
}

function itemsTable(ctx: Ctx): Table {
  const { vm, s, contentWidth } = ctx;
  const cols = vm.columns;
  const spec: { key: string; label: string; share: number; align?: "right" }[] = [
    { key: "pos", label: "#", share: 4 },
    { key: "desc", label: vm.labels.description, share: 0 },
    ...(cols.sac ? [{ key: "sac", label: vm.labels.sacHsn, share: 9 }] : []),
    ...(cols.qty
      ? [
          { key: "qty", label: vm.labels.qty, share: 7, align: "right" as const },
          { key: "unit", label: vm.labels.unit, share: 7 },
        ]
      : []),
    ...(cols.rate
      ? [{ key: "rate", label: vm.labels.rate, share: 12, align: "right" as const }]
      : []),
    ...(cols.tax ? [{ key: "tax", label: vm.labels.tax, share: 13, align: "right" as const }] : []),
    { key: "amount", label: vm.labels.amount, share: 14, align: "right" as const },
  ];
  const used = spec.reduce((n, c) => n + c.share, 0);
  const widths = spec.map((c) =>
    Math.round((contentWidth * (c.key === "desc" ? 100 - used : c.share)) / 100),
  );
  const pad = twips(s.dense ? 3 : 5);
  const margins = { top: pad, bottom: pad, left: pad, right: pad };
  const headFill = s.tinted ? s.tint : s.tableBorders ? "#f3f4f6" : undefined;
  const headBorder = rule(s.tableBorders ? s.hairline : s.accentRule ? s.accent : s.hairline, 6);
  const rowBorder = s.tableStyle === "plain" ? NO_BORDER : rule(s.hairline, 3);
  const sideBorder = s.tableBorders ? rule(s.hairline, 6) : NO_BORDER;

  const head = new TableRow({
    tableHeader: true,
    children: spec.map((c, i) =>
      cell(
        [
          para(
            [run(c.label, { color: hex(s.tinted ? s.accent : s.muted), size: half(s.base - 1) })],
            {
              alignment: c.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
              spacing: { after: 0 },
            },
          ),
        ],
        {
          width: widths[i]!,
          ...(headFill ? { fill: headFill } : {}),
          margins,
          borders: {
            top: s.tableBorders ? sideBorder : NO_BORDER,
            bottom: headBorder,
            left: sideBorder,
            right: sideBorder,
          },
        },
      ),
    ),
  });
  const rows = vm.items.map((it, idx) => {
    const values: Record<string, string> = {
      pos: String(it.position),
      desc: it.description,
      sac: it.sacHsnCode ?? "",
      qty: it.qty,
      unit: it.unit,
      rate: it.rate,
      tax: it.taxAmount,
      amount: cols.tax ? it.lineSubtotal : it.lineTotal,
    };
    const zebra = s.tableStyle === "zebra" && idx % 2 === 1 ? s.zebra : undefined;
    return new TableRow({
      cantSplit: true,
      children: spec.map((c, i) => {
        const children: Paragraph[] =
          c.key === "desc"
            ? [
                para(it.description, { spacing: { after: 0 } }),
                ...(it.sku
                  ? [
                      para(
                        [run(`SKU ${it.sku}`, { color: hex(s.muted), size: half(s.base - 1.5) })],
                        { spacing: { after: 0 } },
                      ),
                    ]
                  : []),
              ]
            : c.key === "tax"
              ? [
                  para(it.taxAmount, { alignment: AlignmentType.RIGHT, spacing: { after: 0 } }),
                  para([run(it.taxRate, { color: hex(s.muted), size: half(s.base - 1.5) })], {
                    alignment: AlignmentType.RIGHT,
                    spacing: { after: 0 },
                  }),
                ]
              : [
                  para(values[c.key] ?? "", {
                    alignment: c.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    spacing: { after: 0 },
                  }),
                ];
        return cell(children, {
          width: widths[i]!,
          ...(zebra ? { fill: zebra } : {}),
          margins,
          borders: { top: NO_BORDER, bottom: rowBorder, left: sideBorder, right: sideBorder },
        });
      }),
    });
  });
  return new Table({
    rows: [head, ...rows],
    columnWidths: widths,
    width: { size: contentWidth, type: WidthType.DXA },
    borders: s.tableBorders
      ? {
          ...NO_BORDERS,
          top: rule(s.hairline, 6),
          bottom: rule(s.hairline, 6),
          left: rule(s.hairline, 6),
          right: rule(s.hairline, 6),
        }
      : NO_BORDERS,
  });
}

function totalsSection(ctx: Ctx): (Paragraph | Table)[] {
  const { vm, s, contentWidth } = ctx;
  const boxW = Math.round(contentWidth * 0.46);
  const labelW = Math.round(boxW * 0.55);
  const rows = vm.totals.rows.map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              para(
                [
                  run(r.label, {
                    bold: !!r.emphasis,
                    size: r.emphasis ? half(s.base + 1.5) : undefined,
                  }),
                ],
                { spacing: { after: 0 } },
              ),
            ],
            {
              width: labelW,
              borders: {
                ...CELL_NO_BORDERS,
                top: r.emphasis
                  ? rule(s.accentRule ? s.accent : s.minimal ? s.hairline : s.text, 6)
                  : NO_BORDER,
              },
              margins: { top: twips(2), bottom: twips(2) },
            },
          ),
          cell(
            [
              para(
                [
                  run(r.value, {
                    bold: !!r.emphasis,
                    size: r.emphasis ? half(s.base + 1.5) : undefined,
                  }),
                ],
                { alignment: AlignmentType.RIGHT, spacing: { after: 0 } },
              ),
            ],
            {
              width: boxW - labelW,
              borders: {
                ...CELL_NO_BORDERS,
                top: r.emphasis
                  ? rule(s.accentRule ? s.accent : s.minimal ? s.hairline : s.text, 6)
                  : NO_BORDER,
              },
              margins: { top: twips(2), bottom: twips(2) },
            },
          ),
        ],
      }),
  );
  const boxBorders = s.boxedTotals
    ? {
        top: rule(s.hairline, 6),
        bottom: rule(s.hairline, 6),
        left: rule(s.hairline, 6),
        right: rule(s.hairline, 6),
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      }
    : NO_BORDERS;
  const inner = new Table({
    rows,
    columnWidths: [labelW, boxW - labelW],
    width: { size: boxW, type: WidthType.DXA },
    borders: boxBorders,
  });
  const pad = s.tinted || s.boxedTotals ? twips(8) : 0;
  const wrapper = fullWidthTable(
    [
      new TableRow({
        cantSplit: true,
        children: [
          cell([para("")], { width: contentWidth - boxW }),
          cell([inner], {
            width: boxW,
            ...(s.tinted ? { fill: s.tint } : {}),
            margins: { top: pad, bottom: pad, left: pad, right: pad },
          }),
        ],
      }),
    ],
    [contentWidth - boxW, boxW],
  );
  const out: (Paragraph | Table)[] = [para("", { spacing: { after: twips(4) } }), wrapper];
  if (vm.totals.amountInWords && s.wordsPosition === "below-total") {
    out.push(
      para(
        [
          run(`${vm.labels.amountInWords}: `, { color: hex(s.muted) }),
          run(vm.totals.amountInWords),
        ],
        { spacing: { before: twips(8), after: 0 } },
      ),
    );
  }
  if (vm.supplyStatement)
    out.push(
      para([run(vm.supplyStatement, { italics: true, color: hex(s.muted) })], {
        spacing: { before: twips(8), after: 0 },
      }),
    );
  return out;
}

function sectionTitle(ctx: Ctx, text: string): Paragraph {
  const { s } = ctx;
  return para(
    [
      run(text, {
        bold: true,
        font: s.heading,
        size: half(s.base + 0.5),
        color: hex(s.variant === "ledger" ? s.accent : s.text),
      }),
    ],
    {
      spacing: { before: twips(14), after: twips(3) },
      keepNext: true,
    },
  );
}

function trailingSections(ctx: Ctx): Paragraph[] {
  const { vm, s } = ctx;
  const out: Paragraph[] = [];
  if (vm.paymentMethods.length > 0) {
    out.push(sectionTitle(ctx, vm.labels.paymentDetails));
    for (const m of vm.paymentMethods) {
      out.push(para([run(m.name, { bold: true })], { spacing: { after: 0 }, keepNext: true }));
      for (const l of m.lines) {
        out.push(
          para([...(l.label ? [run(`${l.label}  `, { color: hex(s.muted) })] : []), run(l.value)], {
            spacing: { after: 0 },
          }),
        );
      }
      if (m.instructions)
        out.push(
          para([run(m.instructions, { color: hex(s.muted), size: half(s.base - 1.5) })], {
            spacing: { after: twips(4) },
          }),
        );
    }
  }
  if (vm.notes)
    out.push(
      sectionTitle(ctx, vm.labels.notes),
      ...vm.notes.split("\n").map((t) => para(t, { spacing: { after: 0 } })),
    );
  if (vm.terms)
    out.push(
      sectionTitle(ctx, vm.labels.terms),
      ...vm.terms
        .split("\n")
        .map((t) => para([run(t, { color: hex(s.muted) })], { spacing: { after: 0 } })),
    );
  return out;
}

function closingRow(ctx: Ctx): (Paragraph | Table)[] {
  const { vm, s, images, contentWidth } = ctx;
  const left: Paragraph[] = [];
  const qr = images.qr ?? pageNumberPng(vm.qrDataUrl);
  if (s.qrPosition !== "header" && qr) {
    const p = imageParagraph(qr, 64, 64);
    if (p)
      left.push(
        p,
        para([run(vm.text.scanToVerify, { color: hex(s.muted), size: half(s.base - 1.5) })], {
          spacing: { after: 0 },
        }),
      );
  }
  if (vm.totals.amountInWords && s.wordsPosition === "footer") {
    left.push(
      para(
        [
          run(`${vm.labels.amountInWords}: `, { color: hex(s.muted) }),
          run(vm.totals.amountInWords),
        ],
        { spacing: { before: twips(8), after: 0 } },
      ),
    );
  }
  if (vm.footer)
    left.push(
      para([run(vm.footer, { color: hex(s.muted), size: half(s.base - 1.5) })], {
        spacing: { before: twips(6), after: 0 },
      }),
    );
  const right: Paragraph[] = [];
  if (vm.showSignature || vm.showStamp) {
    const stamp =
      images.stamp && vm.showStamp
        ? imageParagraph(images.stamp, 50, 80, AlignmentType.RIGHT)
        : null;
    const sig =
      images.signature && vm.showSignature
        ? imageParagraph(images.signature, 36, 120, AlignmentType.RIGHT)
        : null;
    if (stamp) right.push(stamp);
    if (sig) right.push(sig);
    right.push(
      para([run(vm.issuer.legalName, { bold: true })], {
        alignment: AlignmentType.RIGHT,
        spacing: { before: twips(4), after: 0 },
      }),
    );
    right.push(
      para([run(vm.signatureCaption, { color: hex(s.muted), size: half(s.base - 1.5) })], {
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
      }),
    );
  }
  const w = Math.round(contentWidth * 0.6);
  return [
    para("", { spacing: { before: twips(16), after: 0 } }),
    fullWidthTable(
      [
        new TableRow({
          cantSplit: true,
          children: [
            cell(left.length ? left : [para("")], { width: w }),
            cell(right.length ? right : [para("")], {
              width: contentWidth - w,
              verticalAlign: VerticalAlign.BOTTOM,
            }),
          ],
        }),
      ],
      [w, contentWidth - w],
    ),
  ];
}

/** Renders the view-model to a .docx (OOXML) buffer. */
export async function renderDocx(
  vm: DocumentViewModel,
  config: TemplateConfig,
  images: DocxImages = {},
): Promise<Buffer> {
  const s = templateStyle(config, vm.locale);
  const pageW = twips(s.paper.width);
  const pageH = twips(s.paper.height);
  const margin = twips(s.margin);
  const contentWidth = pageW - 2 * margin;
  const ctx: Ctx = { s, vm, images, contentWidth };
  const docLabel = vm.kind === "CREDIT_NOTE" ? vm.labels.creditNote : vm.labels.invoice;

  const children: ISectionOptions["children"] = [
    ...headerSection(ctx),
    partiesSection(ctx),
    para("", { spacing: { after: twips(4) } }),
    ...(vm.items.length > 0 ? [itemsTable(ctx)] : []),
    ...totalsSection(ctx),
    ...trailingSections(ctx),
    ...closingRow(ctx),
  ];

  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: "right", position: contentWidth }],
        children: [
          run(
            `${vm.number ? `${docLabel} ${vm.number}` : vm.title}${vm.isVoid ? ` · ${vm.text.void}` : ""}`,
            {
              color: hex(s.muted),
              size: half(s.base - 2),
            },
          ),
          new TextRun({ children: ["\t"] }),
          ...(s.pageNumbers
            ? [
                ...splitPageOf(vm.text.pageOf).map(
                  (part) =>
                    new TextRun({
                      ...(part === "{page}"
                        ? { children: [PageNumber.CURRENT] }
                        : part === "{total}"
                          ? { children: [PageNumber.TOTAL_PAGES] }
                          : { text: part }),
                      color: hex(s.muted),
                      size: half(s.base - 2),
                    }),
                ),
              ]
            : []),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: "okinvo",
    title: `${vm.title} ${vm.number ?? ""}`.trim(),
    styles: {
      default: {
        document: { run: { font: s.body, size: half(s.base), color: hex(s.text) } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: pageW, height: pageH },
            margin: { top: margin, right: margin, bottom: margin + twips(18), left: margin },
          },
        },
        footers: { default: footer },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Column proportions are shared with the PDF: a few helpers exported for tests. */
export const DOCX_INTERNALS = { twips, hex, PT_PER_MM };
