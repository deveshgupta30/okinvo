import { useLocale, useTranslations } from "next-intl";
import { Mono } from "@/components/ui/mono";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { EmailMessageDto } from "@/server/dal/emails";

const TONE = { SENT: "success", FAILED: "danger", MANUAL: "neutral" } as const;

export function SentLog({
  rows,
  timeZone,
  showDocument,
}: {
  rows: EmailMessageDto[];
  timeZone: string;
  showDocument?: boolean;
}) {
  const t = useTranslations("email.sentLog");
  const locale = useLocale();
  return (
    <Table>
      <THead>
        <TR>
          <TH>{t("when")}</TH>
          {showDocument ? <TH>{t("document")}</TH> : null}
          <TH>{t("to")}</TH>
          <TH>{t("subject")}</TH>
          <TH>{t("status")}</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={showDocument ? 5 : 4}>{t("empty")}</TableEmpty>
        ) : (
          rows.map((m) => (
            <TR key={m.id}>
              <TD mono className="whitespace-nowrap">
                {formatDateTime(new Date(m.createdAt), locale, timeZone)}
              </TD>
              {showDocument ? <TD mono>{m.documentNumber ?? t("noDocument")}</TD> : null}
              <TD>
                {m.to.join(", ")}
                {m.cc.length ? (
                  <span className="block text-app-caption text-ink-subtle">
                    {t("cc", { list: m.cc.join(", ") })}
                  </span>
                ) : null}
              </TD>
              <TD>{m.subject}</TD>
              <TD>
                <Pill tone={TONE[m.status]}>{t(`statuses.${m.status}`)}</Pill>
                {m.error ? (
                  <span
                    className="block max-w-xs truncate text-app-caption text-semantic-danger"
                    title={m.error}
                  >
                    {m.error}
                  </span>
                ) : null}
                {m.providerMessageId ? (
                  <Mono className="block max-w-xs truncate text-app-caption text-ink-subtle">
                    {m.providerMessageId}
                  </Mono>
                ) : null}
              </TD>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
