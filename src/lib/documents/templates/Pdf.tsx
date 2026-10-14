/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> is a PDF primitive without alt */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text as PlainText,
  View,
  type DocumentProps,
  type TextProps,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { TemplateConfig } from "@/lib/schemas";
import { PROTECT_PERMISSIONS, type ProtectOptions } from "../protect";
import { pageOf } from "../page-text";
import type { DocumentViewModel, TotalsRow } from "../view-model";
import { RunText as Text } from "./run-text";
import { SYMBOL_FAMILY, splitCurrency, templateStyle, type TemplateStyle } from "./styles";

export interface PdfImages {
  logo?: string;
  signature?: string;
  stamp?: string;
  /** Letterhead header image, spanning the page width on every page. */
  header?: string;
}

interface Props {
  vm: DocumentViewModel;
  config: TemplateConfig;
  images: PdfImages;
  createdAt: Date;
  /** When set, the file is AES-256 encrypted: open with the user password, print only. */
  protect?: ProtectOptions | undefined;
}

/** Currency strings: the symbol run goes to the face that has the glyph (₹ is not in latin). */
function Money({ value, style }: { value: string; style?: TextProps["style"] }) {
  const { prefix, number, suffix } = splitCurrency(value);
  const needsSymbol = /[^\x00-\x7F]/.test(prefix + suffix);
  const styleProp = style ? { style } : {};
  // digits and symbols only: the plain primitive, no script runs to cut
  if (!needsSymbol) return <PlainText {...styleProp}>{value}</PlainText>;
  return (
    <PlainText {...styleProp}>
      {prefix ? <PlainText style={{ fontFamily: SYMBOL_FAMILY }}>{prefix}</PlainText> : null}
      {number}
      {suffix ? <PlainText style={{ fontFamily: SYMBOL_FAMILY }}>{suffix}</PlainText> : null}
    </PlainText>
  );
}

function makeStyles(s: TemplateStyle) {
  const pad = s.dense ? 3 : 5;
  return StyleSheet.create({
    page: {
      fontFamily: s.body,
      fontSize: s.base,
      color: s.text,
      paddingTop: s.headerStyle === "none" ? s.margin : s.headerHeight + 14,
      paddingBottom: s.margin + 18,
      paddingHorizontal: s.margin,
      lineHeight: 1.35,
      // RTL document language (spec §9c): text aligns right; numbers keep their own alignment
      textAlign: s.rtl ? "right" : "left",
    },
    heading: { fontFamily: s.heading, fontWeight: 600 },
    muted: { color: s.muted },
    small: { fontSize: s.base - 1.5 },
    mono: { fontFamily: s.body },
    header: {
      flexDirection: s.rtl ? "row-reverse" : "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    bandFill: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: s.headerHeight,
      backgroundColor: s.headerColor,
    },
    bandImage: {
      position: "absolute",
      top: 0,
      left: 0,
      width: s.paper.width,
      height: s.headerHeight,
      objectFit: "cover",
      opacity: s.headerImageOpacity,
    },
    band: {
      position: "absolute",
      top: 0,
      left: s.margin,
      right: s.margin,
      height: s.headerHeight,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerRule: {
      marginTop: 10,
      marginBottom: 14,
      borderBottomWidth: s.accentRule ? 2 : 1,
      borderBottomColor: s.accentRule ? s.accent : s.hairline,
    },
    title: {
      fontFamily: s.heading,
      fontWeight: 600,
      fontSize: s.base * 2,
      lineHeight: 1.2,
      letterSpacing: -0.3,
      color: s.variant === "ledger" ? s.accent : s.text,
    },
    meta: { flexDirection: "row", gap: 14, marginTop: 6 },
    metaLabel: { color: s.muted, fontSize: s.base - 1 },
    parties: {
      flexDirection: "row",
      gap: 24,
      marginBottom: 14,
      ...(s.tinted ? { backgroundColor: s.tint, padding: 8, borderRadius: 3 } : {}),
    },
    party: { flex: 1 },
    eyebrow: {
      fontSize: s.base - 1.5,
      color: s.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 3,
    },
    table: {
      marginTop: 4,
      borderWidth: s.tableBorders ? 1 : 0,
      borderColor: s.hairline,
    },
    th: {
      flexDirection: s.rtl ? "row-reverse" : "row",
      backgroundColor: s.tinted ? s.tint : s.tableBorders ? "#f3f4f6" : "transparent",
      borderBottomWidth: 1,
      borderBottomColor: s.tableBorders ? s.hairline : s.accentRule ? s.accent : s.hairline,
      paddingVertical: pad,
      paddingHorizontal: pad,
      fontSize: s.base - 1,
      color: s.tinted ? s.accent : s.muted,
      fontWeight: 500,
    },
    tr: {
      flexDirection: s.rtl ? "row-reverse" : "row",
      paddingVertical: pad + 1,
      paddingHorizontal: pad,
      borderBottomWidth: s.tableStyle === "plain" ? 0 : 0.5,
      borderBottomColor: s.hairline,
    },
    zebra: { backgroundColor: s.zebra },
    cell: { paddingRight: 4 },
    num: { textAlign: "right" },
    totalsWrap: {
      flexDirection: "row",
      justifyContent: s.rtl ? "flex-start" : "flex-end",
      marginTop: 10,
    },
    totals: {
      width: "46%",
      borderWidth: s.boxedTotals ? 1 : 0,
      borderColor: s.hairline,
      padding: s.boxedTotals ? 6 : 0,
      ...(s.tinted ? { backgroundColor: s.tint, padding: 8, borderRadius: 3 } : {}),
    },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    totalEmphasis: {
      borderTopWidth: 1,
      borderTopColor: s.accentRule ? s.accent : s.minimal ? s.hairline : s.text,
      marginTop: 3,
      paddingTop: 4,
      fontWeight: 600,
      fontSize: s.base + 1.5,
    },
    words: { marginTop: 8, fontSize: s.base - 0.5 },
    section: { marginTop: 14 },
    sectionTitle: {
      fontFamily: s.heading,
      fontWeight: 600,
      fontSize: s.base + 0.5,
      marginBottom: 3,
      color: s.variant === "ledger" ? s.accent : s.text,
    },
    payLine: { flexDirection: "row", gap: 6 },
    payLabel: { color: s.muted, width: 90 },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 24,
    },
    signatureBox: { alignItems: "flex-end", width: 170 },
    pageFooter: {
      position: "absolute",
      // anchored from the top edge: react-pdf 4.9 drops a fixed box anchored with `bottom` when it holds a render-prop Text
      top: s.paper.height - s.margin / 2 - 12,
      left: s.margin,
      right: s.margin,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: s.base - 2,
      color: s.muted,
    },
    watermark: {
      position: "absolute",
      top: s.paper.height / 2 - 40,
      left: 0,
      right: 0,
      textAlign: "center",
      fontSize: 48,
      fontFamily: s.heading,
      fontWeight: 600,
      color: "#9ca3af",
      opacity: 0.18,
      transform: "rotate(-30deg)",
    },
    statement: { marginTop: 8, fontStyle: "italic", color: s.muted },
    qr: { width: 64, height: 64 },
  });
}

function widths(cols: DocumentViewModel["columns"]) {
  const w = {
    pos: "4%",
    desc: "0%",
    sac: cols.sac ? "9%" : "0%",
    qty: cols.qty ? "7%" : "0%",
    unit: cols.qty ? "7%" : "0%",
    rate: cols.rate ? "12%" : "0%",
    tax: cols.tax ? "13%" : "0%",
    amount: "14%",
  };
  const used = [w.pos, w.sac, w.qty, w.unit, w.rate, w.tax, w.amount].reduce(
    (n, x) => n + parseFloat(x),
    0,
  );
  w.desc = `${100 - used}%`;
  return w;
}

export function DocumentPdf({
  vm,
  config,
  images,
  createdAt,
  protect,
}: Props): ReactElement<DocumentProps> {
  const s = templateStyle(config, vm.locale);
  const st = makeStyles(s);
  const w = widths(vm.columns);
  // every string below prints through script runs bound to this document's language
  const run = { base: s.body, locale: vm.locale };
  const docLabel = vm.kind === "CREDIT_NOTE" ? vm.labels.creditNote : vm.labels.invoice;
  const totalsRows = (rows: TotalsRow[]) =>
    rows.map((r) => (
      <View key={r.key} style={r.emphasis ? [st.totalRow, st.totalEmphasis] : st.totalRow}>
        <Text run={run}>{r.label}</Text>
        <Money value={r.value} />
      </View>
    ));
  const qr = vm.qrDataUrl ? (
    <View style={{ alignItems: "center", width: 80 }}>
      <Image src={vm.qrDataUrl} style={st.qr} />
      <Text run={run} style={[st.small, st.muted, { marginTop: 2 }]}>
        {vm.text.scanToVerify}
      </Text>
    </View>
  ) : null;

  const logo =
    images.logo && vm.showLogo ? (
      <Image
        src={images.logo}
        style={{ height: s.logoHeight, objectFit: "contain", maxWidth: 160 }}
      />
    ) : null;
  // With a band or image header the identity (logo, name, title, number) moves onto the band.
  const inBand = s.headerStyle !== "none";
  const bandText = s.headerText === "light" ? "#ffffff" : s.text;

  return (
    <Document
      title={`${vm.title} ${vm.number ?? "(draft)"}`}
      author={vm.issuer.legalName}
      creator="okinvo"
      producer="okinvo"
      creationDate={createdAt}
      modificationDate={createdAt}
      {...(protect
        ? {
            pdfVersion: "1.7ext3" as const, // AES-256 (R10)
            userPassword: protect.userPassword,
            ownerPassword: protect.ownerPassword,
            permissions: PROTECT_PERMISSIONS,
          }
        : {})}
    >
      <Page size={[s.paper.width, s.paper.height]} style={st.page}>
        {vm.watermark ? (
          <Text run={run} fixed style={st.watermark}>
            {vm.watermark}
          </Text>
        ) : null}

        {s.headerStyle === "band" ? <View fixed style={st.bandFill} /> : null}
        {s.headerStyle === "image" && images.header ? (
          <Image fixed src={images.header} style={st.bandImage} />
        ) : null}
        {inBand ? (
          <View style={st.band}>
            <View
              style={{
                flexDirection: s.logoAlign === "right" ? "row-reverse" : "row",
                gap: 12,
                alignItems: "center",
              }}
            >
              {logo}
              <View>
                <Text run={run} style={[st.heading, { fontSize: s.base + 5, color: bandText }]}>
                  {vm.issuer.legalName}
                </Text>
                {vm.issuer.tradeName ? (
                  <Text run={run} style={{ color: bandText, opacity: 0.8 }}>
                    {vm.issuer.tradeName}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text run={run} style={[st.title, { color: bandText }]}>
                {vm.title}
              </Text>
              {vm.number ? (
                <Text
                  run={run}
                  style={[st.heading, { fontSize: s.base + 2, marginTop: 2, color: bandText }]}
                >
                  {vm.number}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Header */}
        <View style={st.header}>
          <View
            style={{
              flex: 1,
              flexDirection: s.logoAlign === "right" ? "row-reverse" : "row",
              gap: 12,
              alignItems: "flex-start",
              justifyContent: s.logoAlign === "center" ? "center" : "flex-start",
            }}
          >
            {inBand ? null : logo}
            <View>
              {inBand ? null : (
                <Text run={run} style={[st.heading, { fontSize: s.base + 3 }]}>
                  {vm.issuer.legalName}
                </Text>
              )}
              {vm.issuer.tradeName && !inBand ? (
                <Text run={run} style={st.muted}>
                  {vm.issuer.tradeName}
                </Text>
              ) : null}
              {vm.issuer.addressLines.map((l, i) => (
                <Text run={run} key={i} style={st.muted}>
                  {l}
                </Text>
              ))}
              {vm.issuer.email ? (
                <Text run={run} style={st.muted}>
                  {vm.issuer.email}
                </Text>
              ) : null}
              {vm.issuer.phone ? (
                <Text run={run} style={st.muted}>
                  {vm.issuer.phone}
                </Text>
              ) : null}
              {vm.issuer.website ? (
                <Text run={run} style={st.muted}>
                  {vm.issuer.website}
                </Text>
              ) : null}
              {vm.issuer.gstin ? <Text run={run}>GSTIN {vm.issuer.gstin}</Text> : null}
              {vm.issuer.pan ? <Text run={run}>PAN {vm.issuer.pan}</Text> : null}
              {vm.issuer.cin ? <Text run={run}>CIN {vm.issuer.cin}</Text> : null}
              {vm.issuer.ukVatNumber ? <Text run={run}>VAT {vm.issuer.ukVatNumber}</Text> : null}
              {vm.issuer.lutNumber ? (
                <Text run={run}>
                  LUT {vm.issuer.lutNumber}
                  {vm.issuer.lutFiscalYear ? ` (${vm.issuer.lutFiscalYear})` : ""}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {inBand ? null : (
              <Text run={run} style={st.title}>
                {vm.title}
              </Text>
            )}
            {vm.number && !inBand ? (
              <Text run={run} style={[st.heading, { fontSize: s.base + 2, marginTop: 2 }]}>
                {vm.number}
              </Text>
            ) : null}
            {vm.replaces ? (
              <Text run={run} style={st.muted}>
                {vm.replaces}
              </Text>
            ) : null}
            <View style={[st.meta, { justifyContent: "flex-end" }]}>
              <View>
                <Text run={run} style={st.metaLabel}>
                  {vm.labels.issueDate}
                </Text>
                <Text run={run}>{vm.issueDate}</Text>
              </View>
              {vm.dueDate ? (
                <View>
                  <Text run={run} style={st.metaLabel}>
                    {vm.labels.dueDate}
                  </Text>
                  <Text run={run}>{vm.dueDate}</Text>
                </View>
              ) : null}
              {vm.paymentTerms ? (
                <View>
                  <Text run={run} style={st.metaLabel}>
                    {vm.labels.terms}
                  </Text>
                  <Text run={run}>{vm.paymentTerms}</Text>
                </View>
              ) : null}
            </View>
            {vm.poReference ? (
              <Text run={run} style={[st.muted, { marginTop: 4 }]}>
                {vm.labels.poReference}: {vm.poReference}
              </Text>
            ) : null}
            {s.qrPosition === "header" ? <View style={{ marginTop: 6 }}>{qr}</View> : null}
          </View>
        </View>
        {vm.headerNote ? (
          <Text run={run} style={[st.muted, { marginTop: 6 }]}>
            {vm.headerNote}
          </Text>
        ) : null}
        <View style={st.headerRule} />

        {/* Parties */}
        <View style={st.parties}>
          <View style={st.party}>
            <Text run={run} style={st.eyebrow}>
              {vm.labels.billTo}
            </Text>
            <Text run={run} style={st.heading}>
              {vm.client.displayName}
            </Text>
            {vm.client.contactPerson ? <Text run={run}>{vm.client.contactPerson}</Text> : null}
            {vm.client.billingAddressLines.map((l, i) => (
              <Text run={run} key={i} style={st.muted}>
                {l}
              </Text>
            ))}
            {vm.client.email ? (
              <Text run={run} style={st.muted}>
                {vm.client.email}
              </Text>
            ) : null}
            {vm.client.phone ? (
              <Text run={run} style={st.muted}>
                {vm.client.phone}
              </Text>
            ) : null}
            {vm.client.taxId ? (
              <Text run={run}>
                {vm.client.taxIdType ?? vm.text.taxId} {vm.client.taxId}
              </Text>
            ) : null}
          </View>
          {vm.client.shippingAddressLines?.length ? (
            <View style={st.party}>
              <Text run={run} style={st.eyebrow}>
                {vm.labels.shipTo}
              </Text>
              {vm.client.shippingAddressLines.map((l, i) => (
                <Text run={run} key={i} style={st.muted}>
                  {l}
                </Text>
              ))}
            </View>
          ) : null}
          {vm.placeOfSupply || vm.creditNote ? (
            <View style={st.party}>
              {vm.placeOfSupply ? (
                <>
                  <Text run={run} style={st.eyebrow}>
                    {vm.labels.placeOfSupply}
                  </Text>
                  <Text run={run}>{vm.placeOfSupply}</Text>
                </>
              ) : null}
              {vm.creditNote ? (
                <View style={{ marginTop: vm.placeOfSupply ? 6 : 0 }}>
                  <Text run={run} style={st.eyebrow}>
                    Against{" "}
                    {docLabel === vm.labels.creditNote
                      ? vm.labels.invoice.toLowerCase()
                      : "invoice"}
                  </Text>
                  <Text run={run}>
                    {vm.creditNote.againstNumber} · {vm.creditNote.againstDate}
                  </Text>
                  <Text run={run} style={[st.muted, { marginTop: 2 }]}>
                    {vm.creditNote.reason}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Items */}
        {vm.items.length > 0 ? (
          <View style={st.table}>
            <View style={st.th} fixed>
              <Text run={run} style={[st.cell, { width: w.pos }]}>
                #
              </Text>
              <Text run={run} style={[st.cell, { width: w.desc }]}>
                {vm.labels.description}
              </Text>
              {vm.columns.sac ? (
                <Text run={run} style={[st.cell, { width: w.sac }]}>
                  {vm.labels.sacHsn}
                </Text>
              ) : null}
              {vm.columns.qty ? (
                <Text run={run} style={[st.cell, st.num, { width: w.qty }]}>
                  {vm.labels.qty}
                </Text>
              ) : null}
              {vm.columns.qty ? (
                <Text run={run} style={[st.cell, { width: w.unit }]}>
                  {vm.labels.unit}
                </Text>
              ) : null}
              {vm.columns.rate ? (
                <Text run={run} style={[st.cell, st.num, { width: w.rate }]}>
                  {vm.labels.rate}
                </Text>
              ) : null}
              {vm.columns.tax ? (
                <Text run={run} style={[st.cell, st.num, { width: w.tax }]}>
                  {vm.labels.tax}
                </Text>
              ) : null}
              <Text run={run} style={[st.cell, st.num, { width: w.amount }]}>
                {vm.labels.amount}
              </Text>
            </View>
            {vm.items.map((it, idx) => (
              <View
                key={it.position}
                style={s.tableStyle === "zebra" && idx % 2 === 1 ? [st.tr, st.zebra] : st.tr}
                wrap={false}
              >
                <Text run={run} style={[st.cell, { width: w.pos }]}>
                  {it.position}
                </Text>
                <Text run={run} style={[st.cell, { width: w.desc }]}>
                  {it.sku ? `${it.description}\nSKU ${it.sku}` : it.description}
                </Text>
                {vm.columns.sac ? (
                  <Text run={run} style={[st.cell, { width: w.sac }]}>
                    {it.sacHsnCode ?? ""}
                  </Text>
                ) : null}
                {vm.columns.qty ? (
                  <Text run={run} style={[st.cell, st.num, { width: w.qty }]}>
                    {it.qty}
                  </Text>
                ) : null}
                {vm.columns.qty ? (
                  <Text run={run} style={[st.cell, { width: w.unit }]}>
                    {it.unit}
                  </Text>
                ) : null}
                {vm.columns.rate ? (
                  <Text run={run} style={[st.cell, st.num, { width: w.rate }]}>
                    {it.rate}
                  </Text>
                ) : null}
                {vm.columns.tax ? (
                  <View style={[st.cell, { width: w.tax }]}>
                    <Text run={run} style={st.num}>
                      {it.taxAmount}
                    </Text>
                    <Text run={run} style={[st.num, st.small, st.muted]}>
                      {it.taxRate}
                    </Text>
                  </View>
                ) : null}
                <Text run={run} style={[st.cell, st.num, { width: w.amount }]}>
                  {vm.columns.tax ? it.lineSubtotal : it.lineTotal}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Totals */}
        <View wrap={false}>
          <View style={st.totalsWrap}>
            {s.qrPosition === "beside-totals" && qr ? <View style={{ flex: 1 }}>{qr}</View> : null}
            <View style={st.totals}>{totalsRows(vm.totals.rows)}</View>
          </View>
          {vm.totals.amountInWords && s.wordsPosition === "below-total" ? (
            <Text run={run} style={st.words}>
              <Text run={run} style={st.muted}>
                {vm.labels.amountInWords}:{" "}
              </Text>
              {vm.totals.amountInWords}
            </Text>
          ) : null}
        </View>
        {vm.supplyStatement ? (
          <Text run={run} style={st.statement}>
            {vm.supplyStatement}
          </Text>
        ) : null}

        {/* Payment details */}
        {vm.paymentMethods.length > 0 ? (
          <View style={st.section} minPresenceAhead={40}>
            <Text run={run} style={st.sectionTitle}>
              {vm.labels.paymentDetails}
            </Text>
            <View style={{ flexDirection: "row", gap: 18, flexWrap: "wrap" }}>
              {vm.paymentMethods.map((m, i) => (
                <View key={i} style={{ minWidth: "40%" }}>
                  <Text run={run} style={{ fontWeight: 500 }}>
                    {m.name}
                  </Text>
                  {m.lines.map((l, j) => (
                    <View key={j} style={st.payLine}>
                      {l.label ? (
                        <Text run={run} style={st.payLabel}>
                          {l.label}
                        </Text>
                      ) : null}
                      <Text run={run}>{l.value}</Text>
                    </View>
                  ))}
                  {m.instructions ? (
                    <Text run={run} style={[st.muted, st.small]}>
                      {m.instructions}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {vm.notes ? (
          <View style={st.section} minPresenceAhead={30}>
            <Text run={run} style={st.sectionTitle}>
              {vm.labels.notes}
            </Text>
            <Text run={run}>{vm.notes}</Text>
          </View>
        ) : null}
        {vm.terms ? (
          <View style={st.section} minPresenceAhead={30}>
            <Text run={run} style={st.sectionTitle}>
              {vm.labels.terms}
            </Text>
            <Text run={run} style={st.muted}>
              {vm.terms}
            </Text>
          </View>
        ) : null}

        {/* Footer: QR + words + signature */}
        <View style={st.footerRow} wrap={false}>
          <View style={{ flex: 1 }}>
            {s.qrPosition === "footer" ? qr : null}
            {vm.totals.amountInWords && s.wordsPosition === "footer" ? (
              <Text run={run} style={st.words}>
                <Text run={run} style={st.muted}>
                  {vm.labels.amountInWords}:{" "}
                </Text>
                {vm.totals.amountInWords}
              </Text>
            ) : null}
            {vm.footer ? (
              <Text run={run} style={[st.muted, st.small, { marginTop: 6 }]}>
                {vm.footer}
              </Text>
            ) : null}
          </View>
          {vm.showSignature || vm.showStamp ? (
            <View style={st.signatureBox}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                {images.stamp && vm.showStamp ? (
                  <Image src={images.stamp} style={{ height: 50, objectFit: "contain" }} />
                ) : null}
                {images.signature && vm.showSignature ? (
                  <Image src={images.signature} style={{ height: 36, objectFit: "contain" }} />
                ) : null}
              </View>
              <Text run={run} style={{ fontWeight: 500, marginTop: 4 }}>
                {vm.issuer.legalName}
              </Text>
              <Text run={run} style={[st.muted, st.small]}>
                {vm.signatureCaption}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={st.pageFooter} fixed>
          <Text run={run}>
            {vm.number ? `${docLabel} ${vm.number}` : vm.title}
            {vm.isVoid ? ` · ${vm.text.void}` : ""}
          </Text>
          {s.pageNumbers ? (
            <Text
              run={run}
              render={({ pageNumber, totalPages }) =>
                pageOf(vm.text.pageOf, pageNumber, totalPages)
              }
            />
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
