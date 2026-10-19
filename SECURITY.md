# Security policy

Thanks for looking out for okinvo. It handles invoices, client details and bank information, so
security reports get my attention before anything else.

## Reporting a vulnerability

Please do not open a public issue or discussion. Report it privately through GitHub:
[open a security advisory](https://github.com/deveshgupta30/okinvo/security/advisories/new).

Include what you found, how to reproduce it and what an attacker could do with it. A proof of
concept against your own instance is welcome; please don't test against anyone else's.

What to expect:

- an acknowledgement within a few days;
- a fix, or a plan for one, once I can reproduce it;
- credit in the release notes if you want it.

## Scope

In scope: the okinvo code in this repository, its Docker images (`ghcr.io/deveshgupta30/okinvo`,
`docker.io/deveshgupta30/okinvo`), the Compose files and the Kubernetes manifests.

Out of scope: someone's own deployment choices (a weak `.env`, an exposed database port, a
missing TLS proxy), and vulnerabilities in third-party services. If you found a problem on a
specific okinvo instance, report it to that operator; the contact is on `/legal/security` of
their site.

## Supported versions

Only the latest `main` (and the newest image built from it) gets security fixes. okinvo is a
small self-hosted project, so please upgrade before reporting if you can.

See also [Security](docs/wiki/security.md) in the user guide for how okinvo protects data.
