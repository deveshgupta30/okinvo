---
title: Security
path: security
order: 18
description: How okinvo protects sign-in, data at rest, documents, the API and the audit trail
---

# Security

## Sign-in and sessions

- Sign-in through Google, GitHub, Keycloak, Casdoor or any OpenID Connect provider, or with a
  password when `AUTH_PASSWORD_SIGNIN` is on. A provider appears only when configured.
- Only allow-listed or invited addresses get an account; a password sign-up needs the exact
  address on the list. Identities from different providers with the same verified e-mail are
  one user.
- Sessions are server-side, HttpOnly, 30 days, and revocable per session or everywhere from
  Settings > Security. Sign-in, sign-out and revocation are audited.

## Authorization

Every page, server action, route handler and MCP tool resolves the signed-in user and the
data-access layer checks the role before touching a row. The UI hides what a role cannot do;
the server is the boundary. API keys are capped by their user's current role and revoked with
the user.

## Data at rest

Tax ids, payment-method details, SMTP and connector credentials, share-link tokens and
protected-PDF passwords are encrypted with `FIELD_ENCRYPTION_KEY`; verification tokens and API
keys are stored as SHA-256 hashes. Encrypted columns never leave the instance in exports.

## Documents

Issued documents are immutable and hashed; the verification page lists every version's hash and
checks a file in the browser without uploading it. Nothing in blob storage is publicly
reachable: files are served through the app after the role check, or through a share link with
its own rules. Uploads are re-encoded and size-limited.

## Transport and browser

HTTPS with HSTS through Caddy or your ingress, a nonce-based Content Security Policy, same-origin
checks on state-changing requests, no inline scripts, no third-party resources: fonts, flags
and wordlists ship inside the image.

## Input

Every text field accepts standard keyboard characters only, enforced in the browser and at
every server boundary. Every database access is parameterised, nothing shells out, and exported
cells pass a formula-injection guard.

## Rate limits and audit

Sign-in, verification, share-link passwords, uploads, exports, e-mail sending and API keys are
rate-limited (in memory, or in Postgres for several replicas). The audit log is append-only and
records actor, role, action, entity, a before/after diff with encrypted fields redacted, address,
user agent and time, for every state change.

## Containers and supply chain

Non-root, read-only containers with all capabilities dropped; secrets only through the
environment; pinned dependencies kept current by Renovate; Trivy scans of the repository, the
configuration and the image in CI.

## Disclosure

Report a weakness to the operator contact on `/legal/security` of your instance, or open a
private security advisory on the GitHub repository for the software itself (`SECURITY.md` in
the repository has the details). Every published image also gets a Docker Scout CVE report.

Related: [Roles and members](roles-and-members.md), [Sharing](sharing-and-protected-pdfs.md).
