import { z } from "zod";
import { fEmailList, fInt, fOptional } from "@/lib/forms";
import { SMTP_SECURITY } from "./smtp";

export const MAX_RECIPIENTS = 10;

/** SPEC §4.16 composer: valid addresses, at most ten recipients, body ≤ 10 000 characters. */
export const SendEmailInputSchema = z
  .object({
    to: fEmailList,
    cc: fEmailList.default([]),
    bcc: fEmailList.default([]),
    subject: z.string().trim().min(1, "required").max(200),
    body: z.string().trim().min(1, "required").max(10_000),
  })
  .superRefine((v, ctx) => {
    if (v.to.length === 0) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "at least one recipient" });
    }
    if (v.to.length + v.cc.length + v.bcc.length > MAX_RECIPIENTS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `at most ${MAX_RECIPIENTS} recipients in total`,
      });
    }
  });
export type SendEmailInput = z.infer<typeof SendEmailInputSchema>;

export const SmtpSettingsInputSchema = z.object({
  host: z.string().trim().min(1, "required").max(253),
  port: fInt.pipe(z.number().min(1).max(65535)),
  security: z.enum(SMTP_SECURITY),
  user: fOptional(z.string().trim().max(200)),
  /** Blank keeps the stored password. */
  password: fOptional(z.string().max(500)),
  from: z.email("must be a valid email"),
  fromName: fOptional(z.string().trim().max(80)),
  replyTo: fOptional(z.email("must be a valid email")),
});
export type SmtpSettingsInput = z.infer<typeof SmtpSettingsInputSchema>;

export const EmailDefaultsInputSchema = z.object({
  cc: fEmailList.default([]),
  bcc: fEmailList.default([]),
});
export type EmailDefaultsInput = z.infer<typeof EmailDefaultsInputSchema>;
