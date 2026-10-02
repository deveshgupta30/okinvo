import type { CSSProperties } from "react";
import type { TemplateConfig } from "@/lib/schemas";
import type { DocumentViewModel } from "../view-model";
import { templateStyle } from "./styles";

/**
 * HTML twin of Pdf.tsx, rendered from the same view-model (v2 §12.1). Documents are paper: always
 * light, sized to the paper, independent of the app theme (v2 §24.8). Inline styles carry the
 * config's colours, so this file is the one place outside tokens.css that sets them.
 */
export function DocumentPreview({
  vm,
  config,
  className,
}: {
  vm: DocumentViewModel;
  config: TemplateConfig;
  className?: string;
}) {
  const s = templateStyle(config);
  const px = (pt: number) => `${(pt * 96) / 72}px`;
  const base = (pt: number): CSSProperties => ({ fontSize: px(pt) });
  const muted: CSSProperties = { color: s.muted };
  const heading: CSSProperties = { fontFamily: `"${s.heading}", sans-serif`, fontWeight: 600 };
  const num: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const pad = px(s.dense ? 3 : 5);
  const cellBorder = s.tableStyle === "plain" ? "none" : `0.5px solid ${s.hairline}`;
  const docLabel = vm.kind === "CREDIT_NOTE" ? vm.labels.creditNote : vm.labels.invoice;
  const qr = vm.qrDataUrl ? (
    <div style={{ width: px(80), textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated server-side */}
      <img src={vm.qrDataUrl} alt="Verification QR" style={{ width: px(64), height: px(64) }} />
      <div style={{ ...muted, ...base(s.base - 1.5) }}>Scan to verify</div>
    </div>
  ) : vm.verifyUrl ? (
    <div
      style={{
        width: px(64),
        height: px(64),
        border: `1px dashed ${s.hairline}`,
        ...muted,
        ...base(s.base - 2),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      QR
    </div>
  ) : null;
  const inBand = s.headerStyle !== "none";
  const bandText = s.headerText === "light" ? "#ffffff" : s.text;
  const logo =
    vm.issuer.logoUrl && vm.showLogo ? (
      // eslint-disable-next-line @next/next/no-img-element -- session-gated asset route
      <img
        src={vm.issuer.logoUrl}
        alt=""
        style={{ height: px(s.logoHeight), maxWidth: px(160), objectFit: "contain" }}
      />
    ) : null;
  const words = vm.totals.amountInWords ? (
    <div style={{ marginTop: px(8), ...base(s.base - 0.5) }}>
      <span style={muted}>{vm.labels.amountInWords}: </span>
      {vm.totals.amountInWords}
    </div>
  ) : null;

  return (
    <div
      className={className}
      data-document-preview
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#ffffff",
        color: s.text,
        fontFamily: `"${s.body}", sans-serif`,
        fontSize: px(s.base),
        lineHeight: 1.35,
        width: px(s.paper.width),
        minHeight: px(s.paper.height),
        padding: px(s.margin),
        paddingTop: px(inBand ? s.headerHeight + 14 : s.margin),
        paddingBottom: px(s.margin + 18),
        boxSizing: "border-box",
      }}
    >
      {vm.watermark ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "45%",
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: px(48),
            ...heading,
            color: "#9ca3af",
            opacity: 0.18,
            transform: "rotate(-30deg)",
            pointerEvents: "none",
          }}
        >
          {vm.watermark}
        </div>
      ) : null}

      {s.headerStyle === "band" ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: px(s.headerHeight),
            background: s.headerColor,
          }}
        />
      ) : null}
      {s.headerStyle === "image" && vm.headerImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- session-gated asset route
        <img
          data-header-image
          src={vm.headerImageUrl}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: px(s.headerHeight),
            objectFit: "cover",
            opacity: s.headerImageOpacity,
          }}
        />
      ) : null}
      {inBand ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: px(s.margin),
            right: px(s.margin),
            height: px(s.headerHeight),
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: bandText,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: s.logoAlign === "right" ? "row-reverse" : "row",
              gap: px(12),
              alignItems: "center",
            }}
          >
            {logo}
            <div>
              <div style={{ ...heading, ...base(s.base + 5) }}>{vm.issuer.legalName}</div>
              {vm.issuer.tradeName ? (
                <div style={{ opacity: 0.8 }}>{vm.issuer.tradeName}</div>
              ) : null}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...heading, fontSize: px(s.base * 2), letterSpacing: "-0.3px" }}>
              {vm.title}
            </div>
            {vm.number ? (
              <div style={{ ...heading, ...base(s.base + 2), marginTop: px(2) }}>{vm.number}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: px(12),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: s.logoAlign === "right" ? "row-reverse" : "row",
            gap: px(12),
            flex: 1,
            justifyContent: s.logoAlign === "center" ? "center" : "flex-start",
          }}
        >
          {inBand ? null : logo}
          <div>
            {inBand ? null : (
              <div style={{ ...heading, ...base(s.base + 3) }}>{vm.issuer.legalName}</div>
            )}
            {vm.issuer.tradeName && !inBand ? <div style={muted}>{vm.issuer.tradeName}</div> : null}
            {vm.issuer.addressLines.map((l, i) => (
              <div key={i} style={muted}>
                {l}
              </div>
            ))}
            {vm.issuer.email ? <div style={muted}>{vm.issuer.email}</div> : null}
            {vm.issuer.phone ? <div style={muted}>{vm.issuer.phone}</div> : null}
            {vm.issuer.website ? <div style={muted}>{vm.issuer.website}</div> : null}
            {vm.issuer.gstin ? <div>GSTIN {vm.issuer.gstin}</div> : null}
            {vm.issuer.pan ? <div>PAN {vm.issuer.pan}</div> : null}
            {vm.issuer.cin ? <div>CIN {vm.issuer.cin}</div> : null}
            {vm.issuer.ukVatNumber ? <div>VAT {vm.issuer.ukVatNumber}</div> : null}
            {vm.issuer.lutNumber ? (
              <div>
                LUT {vm.issuer.lutNumber}
                {vm.issuer.lutFiscalYear ? ` (${vm.issuer.lutFiscalYear})` : ""}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {inBand ? null : (
            <div
              style={{
                ...heading,
                fontSize: px(s.base * 2),
                letterSpacing: "-0.3px",
                color: s.variant === "ledger" ? s.accent : s.text,
              }}
            >
              {vm.title}
            </div>
          )}
          {vm.number && !inBand ? (
            <div style={{ ...heading, ...base(s.base + 2), marginTop: px(2) }}>{vm.number}</div>
          ) : null}
          {vm.replaces ? <div style={muted}>{vm.replaces}</div> : null}
          <div
            style={{ display: "flex", gap: px(14), justifyContent: "flex-end", marginTop: px(6) }}
          >
            <div>
              <div style={{ ...muted, ...base(s.base - 1) }}>{vm.labels.issueDate}</div>
              <div>{vm.issueDate}</div>
            </div>
            {vm.dueDate ? (
              <div>
                <div style={{ ...muted, ...base(s.base - 1) }}>{vm.labels.dueDate}</div>
                <div>{vm.dueDate}</div>
              </div>
            ) : null}
            {vm.paymentTerms ? (
              <div>
                <div style={{ ...muted, ...base(s.base - 1) }}>Terms</div>
                <div>{vm.paymentTerms}</div>
              </div>
            ) : null}
          </div>
          {vm.poReference ? (
            <div style={{ ...muted, marginTop: px(4) }}>
              {vm.labels.poReference}: {vm.poReference}
            </div>
          ) : null}
          {s.qrPosition === "header" ? (
            <div style={{ marginTop: px(6), display: "flex", justifyContent: "flex-end" }}>
              {qr}
            </div>
          ) : null}
        </div>
      </header>
      {vm.headerNote ? <div style={{ ...muted, marginTop: px(6) }}>{vm.headerNote}</div> : null}
      <div
        style={{
          marginTop: px(10),
          marginBottom: px(14),
          borderBottom: s.accentRule ? `2px solid ${s.accent}` : `1px solid ${s.hairline}`,
        }}
      />

      <section
        style={{
          display: "flex",
          gap: px(24),
          marginBottom: px(14),
          ...(s.tinted ? { background: s.tint, padding: px(8), borderRadius: px(3) } : {}),
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              ...muted,
              ...base(s.base - 1.5),
              textTransform: "uppercase",
              letterSpacing: "0.6px",
              marginBottom: px(3),
            }}
          >
            {vm.labels.billTo}
          </div>
          <div style={heading}>{vm.client.displayName}</div>
          {vm.client.contactPerson ? <div>{vm.client.contactPerson}</div> : null}
          {vm.client.billingAddressLines.map((l, i) => (
            <div key={i} style={muted}>
              {l}
            </div>
          ))}
          {vm.client.email ? <div style={muted}>{vm.client.email}</div> : null}
          {vm.client.phone ? <div style={muted}>{vm.client.phone}</div> : null}
          {vm.client.taxId ? (
            <div>
              {vm.client.taxIdType ?? "Tax ID"} {vm.client.taxId}
            </div>
          ) : null}
        </div>
        {vm.client.shippingAddressLines?.length ? (
          <div style={{ flex: 1 }}>
            <div
              style={{
                ...muted,
                ...base(s.base - 1.5),
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                marginBottom: px(3),
              }}
            >
              {vm.labels.shipTo}
            </div>
            {vm.client.shippingAddressLines.map((l, i) => (
              <div key={i} style={muted}>
                {l}
              </div>
            ))}
          </div>
        ) : null}
        {vm.placeOfSupply || vm.creditNote ? (
          <div style={{ flex: 1 }}>
            {vm.placeOfSupply ? (
              <>
                <div
                  style={{
                    ...muted,
                    ...base(s.base - 1.5),
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    marginBottom: px(3),
                  }}
                >
                  {vm.labels.placeOfSupply}
                </div>
                <div>{vm.placeOfSupply}</div>
              </>
            ) : null}
            {vm.creditNote ? (
              <div style={{ marginTop: vm.placeOfSupply ? px(6) : 0 }}>
                <div
                  style={{
                    ...muted,
                    ...base(s.base - 1.5),
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    marginBottom: px(3),
                  }}
                >
                  Against invoice
                </div>
                <div>
                  {vm.creditNote.againstNumber} · {vm.creditNote.againstDate}
                </div>
                <div style={{ ...muted, marginTop: px(2) }}>{vm.creditNote.reason}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {vm.items.length > 0 ? (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: px(4),
            border: s.tableBorders ? `1px solid ${s.hairline}` : "none",
          }}
        >
          <thead>
            <tr
              style={{
                background: s.tinted ? s.tint : s.tableBorders ? "#f3f4f6" : "transparent",
                ...muted,
                ...(s.tinted ? { color: s.accent } : {}),
                ...base(s.base - 1),
                fontWeight: 500,
                borderBottom: `1px solid ${s.tableBorders ? s.hairline : s.accentRule ? s.accent : s.hairline}`,
              }}
            >
              <th style={{ textAlign: "left", padding: pad, width: "5%" }}>#</th>
              <th style={{ textAlign: "left", padding: pad }}>{vm.labels.description}</th>
              {vm.columns.sac ? (
                <th style={{ textAlign: "left", padding: pad, width: "11%" }}>
                  {vm.labels.sacHsn}
                </th>
              ) : null}
              {vm.columns.qty ? (
                <th style={{ ...num, padding: pad, width: "9%" }}>{vm.labels.qty}</th>
              ) : null}
              {vm.columns.qty ? (
                <th style={{ textAlign: "left", padding: pad, width: "8%" }}>{vm.labels.unit}</th>
              ) : null}
              {vm.columns.rate ? (
                <th style={{ ...num, padding: pad, width: "13%" }}>{vm.labels.rate}</th>
              ) : null}
              {vm.columns.tax ? (
                <th style={{ ...num, padding: pad, width: "15%" }}>{vm.labels.tax}</th>
              ) : null}
              <th style={{ ...num, padding: pad, width: "16%" }}>{vm.labels.amount}</th>
            </tr>
          </thead>
          <tbody>
            {vm.items.map((it, idx) => (
              <tr
                key={it.position}
                style={{
                  background: s.tableStyle === "zebra" && idx % 2 === 1 ? s.zebra : "transparent",
                  borderBottom: cellBorder,
                }}
              >
                <td style={{ padding: pad, verticalAlign: "top" }}>{it.position}</td>
                <td style={{ padding: pad, verticalAlign: "top", whiteSpace: "pre-wrap" }}>
                  {it.sku ? `${it.description}\nSKU ${it.sku}` : it.description}
                </td>
                {vm.columns.sac ? (
                  <td style={{ padding: pad, verticalAlign: "top" }}>{it.sacHsnCode ?? ""}</td>
                ) : null}
                {vm.columns.qty ? (
                  <td style={{ ...num, padding: pad, verticalAlign: "top" }}>{it.qty}</td>
                ) : null}
                {vm.columns.qty ? (
                  <td style={{ padding: pad, verticalAlign: "top" }}>{it.unit}</td>
                ) : null}
                {vm.columns.rate ? (
                  <td style={{ ...num, padding: pad, verticalAlign: "top" }}>{it.rate}</td>
                ) : null}
                {vm.columns.tax ? (
                  <td style={{ ...num, padding: pad, verticalAlign: "top" }}>
                    {it.taxAmount} ({it.taxRate})
                  </td>
                ) : null}
                <td style={{ ...num, padding: pad, verticalAlign: "top" }}>
                  {vm.columns.tax ? it.lineSubtotal : it.lineTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: px(10), gap: px(16) }}>
        {s.qrPosition === "beside-totals" && qr ? <div style={{ flex: 1 }}>{qr}</div> : null}
        <div
          style={{
            width: "46%",
            border: s.boxedTotals ? `1px solid ${s.hairline}` : "none",
            padding: s.boxedTotals ? px(6) : 0,
            ...(s.tinted ? { background: s.tint, padding: px(8), borderRadius: px(3) } : {}),
          }}
        >
          {vm.totals.rows.map((r) => (
            <div
              key={r.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: `${px(2)} 0`,
                ...(r.emphasis
                  ? {
                      borderTop: `1px solid ${s.accentRule ? s.accent : s.minimal ? s.hairline : s.text}`,
                      marginTop: px(3),
                      paddingTop: px(4),
                      fontWeight: 600,
                      ...base(s.base + 1.5),
                    }
                  : {}),
              }}
            >
              <span>{r.label}</span>
              <span style={num}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      {s.wordsPosition === "below-total" ? words : null}
      {vm.supplyStatement ? (
        <div style={{ ...muted, marginTop: px(8), fontStyle: "italic" }}>{vm.supplyStatement}</div>
      ) : null}

      {vm.paymentMethods.length > 0 ? (
        <section style={{ marginTop: px(14) }}>
          <div
            style={{
              ...heading,
              ...base(s.base + 0.5),
              marginBottom: px(3),
              color: s.variant === "ledger" ? s.accent : s.text,
            }}
          >
            {vm.labels.paymentDetails}
          </div>
          <div style={{ display: "flex", gap: px(18), flexWrap: "wrap" }}>
            {vm.paymentMethods.map((m, i) => (
              <div key={i} style={{ minWidth: "40%" }}>
                <div style={{ fontWeight: 500 }}>{m.name}</div>
                {m.lines.map((l, j) => (
                  <div key={j} style={{ display: "flex", gap: px(6) }}>
                    {l.label ? (
                      <span style={{ ...muted, width: px(90), flexShrink: 0 }}>{l.label}</span>
                    ) : null}
                    <span>{l.value}</span>
                  </div>
                ))}
                {m.instructions ? (
                  <div style={{ ...muted, ...base(s.base - 1.5) }}>{m.instructions}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {vm.notes ? (
        <section style={{ marginTop: px(14) }}>
          <div
            style={{
              ...heading,
              ...base(s.base + 0.5),
              marginBottom: px(3),
              color: s.variant === "ledger" ? s.accent : s.text,
            }}
          >
            {vm.labels.notes}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{vm.notes}</div>
        </section>
      ) : null}
      {vm.terms ? (
        <section style={{ marginTop: px(14) }}>
          <div
            style={{
              ...heading,
              ...base(s.base + 0.5),
              marginBottom: px(3),
              color: s.variant === "ledger" ? s.accent : s.text,
            }}
          >
            {vm.labels.terms}
          </div>
          <div style={{ ...muted, whiteSpace: "pre-wrap" }}>{vm.terms}</div>
        </section>
      ) : null}

      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: px(24),
        }}
      >
        <div style={{ flex: 1 }}>
          {s.qrPosition === "footer" ? qr : null}
          {s.wordsPosition === "footer" ? words : null}
          {vm.footer ? (
            <div style={{ ...muted, ...base(s.base - 1.5), marginTop: px(6) }}>{vm.footer}</div>
          ) : null}
        </div>
        {vm.showSignature || vm.showStamp ? (
          <div style={{ width: px(170), textAlign: "right" }}>
            <div
              style={{
                display: "flex",
                gap: px(8),
                justifyContent: "flex-end",
                alignItems: "flex-end",
              }}
            >
              {vm.issuer.stampUrl && vm.showStamp ? (
                // eslint-disable-next-line @next/next/no-img-element -- session-gated asset route
                <img
                  src={vm.issuer.stampUrl}
                  alt=""
                  style={{ height: px(50), objectFit: "contain" }}
                />
              ) : null}
              {vm.issuer.signatureUrl && vm.showSignature ? (
                // eslint-disable-next-line @next/next/no-img-element -- session-gated asset route
                <img
                  src={vm.issuer.signatureUrl}
                  alt=""
                  style={{ height: px(36), objectFit: "contain" }}
                />
              ) : null}
            </div>
            <div style={{ fontWeight: 500, marginTop: px(4) }}>{vm.issuer.legalName}</div>
            <div style={{ ...muted, ...base(s.base - 1.5) }}>{vm.signatureCaption}</div>
          </div>
        ) : null}
      </footer>

      <div
        style={{
          position: "absolute",
          bottom: px(s.margin / 2),
          left: px(s.margin),
          right: px(s.margin),
          display: "flex",
          justifyContent: "space-between",
          ...muted,
          ...base(s.base - 2),
        }}
      >
        <span>
          {vm.number ? `${docLabel} ${vm.number}` : vm.title}
          {vm.isVoid ? " · VOID" : ""}
        </span>
        {s.pageNumbers ? <span>Page 1 of 1</span> : null}
      </div>
    </div>
  );
}
