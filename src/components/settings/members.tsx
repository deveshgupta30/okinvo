"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Avatar } from "@/components/ui/avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pill } from "@/components/ui/status-pill";
import { ListTable } from "@/components/ui/list-table";
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

/** Role enum value to its catalogue key (labels under `roles`, hints under `roleHints`). */
const ROLE_KEYS = { OWNER: "owner", EDITOR: "editor", VIEWER: "viewer" } as const;
const ROLES = Object.keys(ROLE_KEYS) as (keyof typeof ROLE_KEYS)[];

function RoleSelect({ member, self }: { member: MemberDto; self: boolean }) {
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  return (
    <form action={setMemberRoleAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={member.id} />
      <Select
        name="role"
        aria-label={t("roleOf", { email: member.email })}
        defaultValue={member.role}
        disabled={self || member.deactivatedAt !== null}
        className="w-28"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`roles.${ROLE_KEYS[r]}`)}
          </option>
        ))}
      </Select>
      {self || member.deactivatedAt ? null : (
        <SubmitButton variant="secondary" size="sm" pendingLabel={tc("saving")}>
          {tc("save")}
        </SubmitButton>
      )}
    </form>
  );
}

function InviteForm() {
  const t = useTranslations("settings.users");
  const [state, action] = useActionState<InviteState | null, FormData>(inviteMemberAction, null);
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
              ? t("invite.sent", { email: invited.email })
              : invited.error
                ? t("invite.readyWithError", { email: invited.email, error: invited.error })
                : t("invite.readyNoSmtp", { email: invited.email })}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-app-mono">{invited.signInUrl}</code>
            <CopyButton value={invited.signInUrl} label={t("invite.copyLink")} />
          </span>
        </div>
      ) : null}
      <FieldGroup className="sm:grid-cols-[1fr_auto]">
        <Field
          label={t("invite.email")}
          htmlFor="inviteEmail"
          error={failed?.fieldErrors.email}
          required
        >
          <Input
            id="inviteEmail"
            name="email"
            type="email"
            placeholder={t("invite.emailPlaceholder")}
            defaultValue={failed?.values.email ?? ""}
          />
        </Field>
        <Field label={t("invite.role")} htmlFor="inviteRole" error={failed?.fieldErrors.role}>
          <Select id="inviteRole" name="role" defaultValue={failed?.values.role ?? "EDITOR"}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t("roleOption", {
                  role: t(`roles.${ROLE_KEYS[r]}`),
                  hint: t(`roleHints.${ROLE_KEYS[r]}`),
                })}
              </option>
            ))}
          </Select>
        </Field>
      </FieldGroup>
      <div>
        <SubmitButton pendingLabel={t("invite.inviting")}>
          <UserPlus /> {t("invite.submit")}
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
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("invite.title")}</CardTitle>
            <CardDescription>{t("invite.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("members.title")}</CardTitle>
            <CardDescription>{t("members.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ListTable
            empty={null}
            columns={[
              { key: "person", header: t("members.columns.person") },
              { key: "role", header: t("members.columns.role") },
              { key: "lastSignIn", header: t("members.columns.lastSignIn") },
              { key: "status", header: t("members.columns.status") },
              { key: "actions", header: "", sortable: false },
            ]}
            rows={members.map((m) => {
              const self = m.id === selfId;
              return {
                id: m.id,
                cells: {
                  person: {
                    node: (
                      <>
                        <span className="flex items-center gap-3">
                          <Avatar name={m.name} email={m.email} src={m.avatarKey} size="sm" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-app-label text-ink">
                              {self ? t("members.nameYou", { name: m.name }) : m.name}
                            </span>
                            <span className="truncate text-app-caption text-ink-subtle">
                              {m.email}
                            </span>
                          </span>
                        </span>
                      </>
                    ),
                    sort: m.name,
                  },
                  role: {
                    node: (
                      <>
                        <RoleSelect member={m} self={self} />
                      </>
                    ),
                    sort: m.role,
                  },
                  lastSignIn: {
                    node: (
                      <>
                        {m.lastSignInAt
                          ? formatDateTime(new Date(m.lastSignInAt), locale, timeZone)
                          : tc("emptyValue")}
                      </>
                    ),
                    mono: true,
                    sort: m.lastSignInAt ?? "",
                  },
                  status: {
                    node: (
                      <>
                        {m.deactivatedAt ? (
                          <Pill tone="danger">{t("members.deactivated")}</Pill>
                        ) : (
                          <Pill tone="success">{tc("active")}</Pill>
                        )}
                      </>
                    ),
                    sort: m.deactivatedAt ? 1 : 0,
                  },
                  actions: {
                    node: (
                      <>
                        {self ? null : m.deactivatedAt ? (
                          <ConfirmAction
                            action={reactivateMemberAction}
                            title={t("members.reactivate.title", { email: m.email })}
                            description={t("members.reactivate.description")}
                            confirmLabel={t("members.reactivate.confirm")}
                            hidden={{ userId: m.id }}
                            trigger={t("members.reactivate.confirm")}
                            size="sm"
                          />
                        ) : (
                          <ConfirmAction
                            action={deactivateMemberAction}
                            title={t("members.deactivate.title", { email: m.email })}
                            description={t("members.deactivate.description")}
                            confirmLabel={t("members.deactivate.confirm")}
                            hidden={{ userId: m.id }}
                            destructive
                            trigger={t("members.deactivate.confirm")}
                            size="sm"
                          />
                        )}
                      </>
                    ),
                    className: "text-right",
                  },
                },
              };
            })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("invitations.title")}</CardTitle>
            <CardDescription>{t("invitations.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ListTable
            empty={t("invitations.empty")}
            columns={[
              { key: "email", header: t("invitations.columns.email") },
              { key: "role", header: t("invitations.columns.role") },
              { key: "invited", header: t("invitations.columns.invited") },
              { key: "actions", header: "", sortable: false },
            ]}
            rows={invitations.map((i) => ({
              id: i.email,
              cells: {
                email: { node: <>{i.email}</>, sort: i.email },
                role: { node: <>{t(`roles.${ROLE_KEYS[i.role]}`)}</>, sort: i.role },
                invited: {
                  node: (
                    <>
                      {i.invitedBy
                        ? t("invitations.invitedAtBy", {
                            date: formatDateTime(new Date(i.invitedAt), locale, timeZone),
                            by: i.invitedBy,
                          })
                        : formatDateTime(new Date(i.invitedAt), locale, timeZone)}
                    </>
                  ),
                  mono: true,
                  sort: i.invitedAt,
                },
                actions: {
                  node: (
                    <>
                      <ConfirmAction
                        action={revokeInvitationAction}
                        title={t("invitations.revokeTitle", { email: i.email })}
                        confirmLabel={tc("revoke")}
                        hidden={{ email: i.email }}
                        destructive
                        trigger={tc("revoke")}
                        size="sm"
                      />
                    </>
                  ),
                  className: "text-right",
                },
              },
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
