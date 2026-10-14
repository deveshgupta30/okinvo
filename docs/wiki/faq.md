---
title: FAQ
path: faq
order: 21
description: Short answers to the questions that come up first
---

# FAQ

**Can I edit an issued invoice?**
No. Issued documents are immutable so their numbers, hashes and verification stay meaningful.
Void it (while unpaid), void and reissue it as a new draft, or raise a credit note.

**Why is there a gap in my numbers?**
There is none: voided invoices keep their number and stay in the register. Drafts never consume
a number, and a failed issue allocates nothing.

**Can I delete a client or a service?**
Only while nothing references it. Afterwards archive it; its documents stay as issued.

**Where do I change the template?**
Settings > Templates, never on the invoice form. A profile can override it under Settings >
Profiles > Template. Documents issued earlier keep the configuration they were issued with.

**How do I let my accountant in?**
Settings > Users > Invite with the Viewer role. They can read every register and document and
export them, nothing else. Or hand over the documents ZIP from Settings > Data.

**My SMTP is not configured. Can I still send?**
The composer offers "Open in mail app" with the subject and body and downloads the PDF for you
to attach, plus "Mark as sent".

**Does anything leave my server?**
Nothing, unless you configure it: your SMTP server for e-mail, your identity provider for
sign-in, an S3 endpoint for storage, and the NIC IRP when you register e-invoices through the
NIC connector. There is no telemetry and nothing is fetched at runtime.

**How do I move to another machine?**
Restore the latest backup (database dump and storage tarball) on the new host with the same
`FIELD_ENCRYPTION_KEY` and `AUTH_SECRET`; without the encryption key the encrypted columns are
unreadable.

**Which browsers?**
The latest two versions of Chrome, Firefox, Safari and Edge. The register and overview pages
work on a phone; the builder stacks on a phone and still previews.

**Where is the API documentation?**
`/api/openapi.json` on your instance, `openapi/okinvo.json` in the repository, and the
[API and SDK](api-and-sdk.md) page here.

**How do I update these docs?**
Edit `docs/wiki/*.md` in the repository, regenerate screenshots with `pnpm docs:screenshots`
if the UI changed, and publish with `pnpm docs:sync` against the Wiki.js profile.
