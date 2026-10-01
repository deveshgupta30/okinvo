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
  return (
    <Table>
      <THead>
        <TR>
          <TH>When</TH>
          {showDocument ? <TH>Document</TH> : null}
          <TH>To</TH>
          <TH>Subject</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={showDocument ? 5 : 4}>Nothing sent yet.</TableEmpty>
        ) : (
          rows.map((m) => (
            <TR key={m.id}>
              <TD mono className="whitespace-nowrap">
                {formatDateTime(new Date(m.createdAt), "en-GB", timeZone)}
              </TD>
              {showDocument ? <TD mono>{m.documentNumber ?? "—"}</TD> : null}
              <TD>
                {m.to.join(", ")}
                {m.cc.length ? (
                  <span className="block text-app-caption text-ink-subtle">
                    cc {m.cc.join(", ")}
                  </span>
                ) : null}
              </TD>
              <TD>{m.subject}</TD>
              <TD>
                <Pill tone={TONE[m.status]}>{m.status.toLowerCase()}</Pill>
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
