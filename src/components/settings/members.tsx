"use client";

import { Check, Copy, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import {
  deactivateMemberAction,
  inviteMemberAction,
  reactivateMemberAction,
  revokeInvitationAction,
  setMemberRoleAction,
  type InviteState,
} from "@/server/actions/members";
import type { InvitationDto, MemberDto } from "@/server/dal/members";

const ROLE_LABELS = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" } as const;
const ROLE_HINTS = {
  OWNER: "Everything, including settings and members",
  EDITOR: "Clients, catalogue, invoices, credit notes, payments, e-mail",
  VIEWER: "Read-only",
} as const;

function RoleSelect({ member, self }: { member: MemberDto; self: boolean }) {
  return (
    <form action={setMemberRoleAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={member.id} />
      <Select
        name="role"
        aria-label={`Role of ${member.email}`}
        defaultValue={member.role}
        disabled={self || member.deactivatedAt !== null}
        className="w-28"
      >
        {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      {self || member.deactivatedAt ? null : (
        <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      )}
    </form>
  );
}

function InviteForm() {
  const [state, action] = useActionState<InviteState | null, FormData>(inviteMemberAction, null);
  const [copied, setCopied] = useState(false);
  const failed = state && !state.ok ? state : null;
  const invited = state?.ok ? state.invited : null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={failed} />
      {invited ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 p-3 text-app-body text-ink"
        >
          <span>
            {invited.sent
              ? `Invitation e-mailed to ${invited.email}.`
              : `Invitation ready for ${invited.email}. ${
                  invited.error
                    ? `The e-mail could not be sent (${invited.error}); `
                    : "No SMTP is configured; "
                }send them this link:`}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-app-mono">{invited.signInUrl}</code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(invited.signInUrl);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
            </Button>
          </span>
        </div>
      ) : null}
      <FieldGroup className="sm:grid-cols-[1fr_auto]">
        <Field label="Email" htmlFor="inviteEmail" error={failed?.fieldErrors.email} required>
          <Input
            id="inviteEmail"
            name="email"
            type="email"
            placeholder="person@example.com"
            defaultValue={failed?.values.email ?? ""}
          />
        </Field>
        <Field label="Role" htmlFor="inviteRole" error={failed?.fieldErrors.role}>
          <Select id="inviteRole" name="role" defaultValue={failed?.values.role ?? "EDITOR"}>
            {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]} — {ROLE_HINTS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </FieldGroup>
      <div>
        <SubmitButton pendingLabel="Inviting…">
          <UserPlus /> Invite
        </SubmitButton>
      </div>
    </form>
  );
}

/** Settings → Users (spec §9b): members, pending invitations and the invite form. OWNER only. */
export function MembersPanel({
  members,
  invitations,
  selfId,
  locale,
  timeZone,
}: {
  members: MemberDto[];
  invitations: InvitationDto[];
  selfId: string;
  locale: string;
  timeZone: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Invite someone</CardTitle>
            <CardDescription>
              They sign in with the invited address (an identity provider or a password) and get the
              role you choose.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>At least one active owner always remains.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table cards>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH>Role</TH>
                <TH>Last sign-in</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {members.map((m) => {
                const self = m.id === selfId;
                return (
                  <TR key={m.id}>
                    <TD label="Person">
                      <span className="flex items-center gap-3">
                        <Avatar name={m.name} email={m.email} src={m.avatarKey} size="sm" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-app-label text-ink">
                            {m.name}
                            {self ? " (you)" : ""}
                          </span>
                          <span className="truncate text-app-caption text-ink-subtle">
                            {m.email}
                          </span>
                        </span>
                      </span>
                    </TD>
                    <TD label="Role">
                      <RoleSelect member={m} self={self} />
                    </TD>
                    <TD label="Last sign-in" mono>
                      {m.lastSignInAt
                        ? formatDateTime(new Date(m.lastSignInAt), locale, timeZone)
                        : "—"}
                    </TD>
                    <TD label="Status">
                      {m.deactivatedAt ? (
                        <Pill tone="danger">Deactivated</Pill>
                      ) : (
                        <Pill tone="success">Active</Pill>
                      )}
                    </TD>
                    <TD label="" className="text-right">
                      {self ? null : m.deactivatedAt ? (
                        <ConfirmAction
                          action={reactivateMemberAction}
                          title={`Reactivate ${m.email}?`}
                          description="They can sign in again with their previous role."
                          confirmLabel="Reactivate"
                          hidden={{ userId: m.id }}
                          trigger="Reactivate"
                          size="sm"
                        />
                      ) : (
                        <ConfirmAction
                          action={deactivateMemberAction}
                          title={`Deactivate ${m.email}?`}
                          description="Every session ends now and they cannot sign in until reactivated. Their history stays."
                          confirmLabel="Deactivate"
                          hidden={{ userId: m.id }}
                          destructive
                          trigger="Deactivate"
                          size="sm"
                        />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Addresses that may sign in but have not yet.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table cards>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Invited</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {invitations.length === 0 ? (
                <TableEmpty colSpan={4}>No pending invitations.</TableEmpty>
              ) : (
                invitations.map((i) => (
                  <TR key={i.email}>
                    <TD label="Email">{i.email}</TD>
                    <TD label="Role">{ROLE_LABELS[i.role]}</TD>
                    <TD label="Invited" mono>
                      {formatDateTime(new Date(i.invitedAt), locale, timeZone)}
                      {i.invitedBy ? ` · ${i.invitedBy}` : ""}
                    </TD>
                    <TD label="" className="text-right">
                      <ConfirmAction
                        action={revokeInvitationAction}
                        title={`Revoke the invitation for ${i.email}?`}
                        confirmLabel="Revoke"
                        hidden={{ email: i.email }}
                        destructive
                        trigger="Revoke"
                        size="sm"
                      />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
