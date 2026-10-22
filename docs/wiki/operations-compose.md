---
title: "Operations: Docker Compose"
path: operations-compose
order: 19
description: Install, configure, upgrade and back up okinvo with Docker Compose
---

# Operations: Docker Compose

`compose.yml` at the repository root is the production stack: Caddy (automatic TLS), the app,
a one-shot migration container, Postgres 18, the nightly backup service, and two optional
profiles.

## Install

```bash
cp .env.example .env && scripts/gen-secrets.sh >> .env   # then delete the two placeholder secret lines
# edit APP_DOMAIN, APP_URL, AUTH_ALLOWED_EMAILS and one AUTH_* provider pair (or AUTH_PASSWORD_SIGNIN=true)
docker compose up -d --build
```

The order is migrate, app, caddy. `https://<APP_DOMAIN>/api/health/ready` answers 200 once the
app is up. Caddy obtains the certificate for `APP_DOMAIN` itself (an internal certificate for
`localhost`).

## From published images

Every merge to `main` pushes the app and migration images to the GitHub Container Registry as
`ghcr.io/deveshgupta30/okinvo:<tag>` and `<tag>-migrate`, where `<tag>` is the release version
(currently `1.0.1`), `sha-<short commit>` or `latest`. `compose.example.yml` is the same stack without the build step, so a host needs no
Node toolchain:

```bash
cp compose.example.yml compose.local.yml        # gitignored; edit it freely
docker compose -f compose.local.yml pull
docker compose -f compose.local.yml up -d
```

Pin `OKINVO_VERSION` in `.env` to a version such as `1.0.1` or a `sha-` tag for repeatable installs. `OKINVO_IMAGE` switches
the registry, for example to `docker.io/deveshgupta30/okinvo` for the versioned Docker Hub
releases. The checkout is still needed for `docker/`, which the services mount.

## Configuration

Every variable the app reads is documented in the README's configuration table and in
`.env.example`. Compose-only variables: `APP_DOMAIN` (Caddy site), `DOCS_DOMAIN` (the docs
site), `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BACKUP_CRON`,
`BACKUP_RETENTION_DAYS`, `OKINVO_VERSION` (image tag), `OKINVO_IMAGE` (image repository, read
only by `compose.example.yml`) and the build provenance pair `BUILD_SHA`, `BUILD_DATE`. Placeholder secrets stop the app on purpose.

## Another port

If something already owns ports 80 and 443, serve on another port with a local
`compose.override.yml` (applied automatically, keep it out of git):

```yaml
services:
  caddy:
    environment: { APP_DOMAIN: "localhost:8443" }
    ports: !override ["8443:8443"]
```

and set `APP_URL=https://localhost:8443`.

## Upgrade

```bash
git pull
docker compose up -d --build        # or set OKINVO_VERSION to a published tag and skip --build
```

From published images: change `OKINVO_VERSION` in `.env`, then
`docker compose -f compose.local.yml pull && docker compose -f compose.local.yml up -d`.

The migration container runs `prisma migrate deploy` before the new app starts; a failed
migration leaves the old app running. Take a backup first.

## Backups

The `backup` service runs `pg_dump` and a storage tarball nightly into the `backups` volume and
prunes by retention. See [Exports and backups](exports-and-backups.md#backups) for running one
now and for the restore procedure.

## Optional profiles

- `--profile s3`: a SeaweedFS S3 server for the document store (`STORAGE_DRIVER=s3`), the
  prerequisite for more than one app replica.
- `--profile docs`: this documentation site on Wiki.js, on its own host `DOCS_DOMAIN`, with its
  own `wiki` database created on the first start of Postgres (`docker/postgres/initdb/10-wiki.sh`;
  on an existing install create it once by hand: `docker compose exec postgres psql -U okinvo -d
  okinvo -c 'CREATE DATABASE wiki'`). Publish the pages with `pnpm docs:sync` and a Wiki.js API
  key (`WIKI_URL`, `WIKI_TOKEN`); `--dry-run` shows the plan.

## Air-gapped hosts

The image contains everything it needs. Build it on a connected machine with
`scripts/release.sh`, move it with `docker save` and `docker load`, and run it where there is no
internet. Nothing in the app fetches from the network unless `OUTBOUND_ALLOW` lists a host.

## Health

- `/api/health/live`: the process answers.
- `/api/health/ready`: the database answers too; Compose and Kubernetes probe this.
- `/api/health/status`: the owner's JSON behind Settings > Status.

Related: [Operations: Kubernetes](operations-kubernetes.md), [Security](security.md).
