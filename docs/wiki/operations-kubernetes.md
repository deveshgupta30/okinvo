---
title: "Operations: Kubernetes"
path: operations-kubernetes
order: 20
description: The Kustomize base and overlays, first install, upgrade, backups and validation
---

# Operations: Kubernetes

`k8s/` holds Kustomize manifests with the same images and semantics as Compose: one namespace,
`okinvo`, with Postgres (StatefulSet), the app (Deployment with the migrate image as an init
container), a nightly backup CronJob, default-deny NetworkPolicies and an Ingress.

| Overlay | Blob storage | Replicas | Rate limits |
| --- | --- | --- | --- |
| `overlays/compose-parity` | local, RWO volume | 1 (Recreate) | in memory |
| `overlays/with-seaweedfs` (experimental) | SeaweedFS S3 | 2 (RollingUpdate, PDB) | Postgres |
| `overlays/with-docs` | as compose-parity, plus the Wiki.js documentation site | 1 | in memory |

The backup CronJob gets `docker/backup/*.sh` through a generated ConfigMap from outside `k8s/`,
so every build needs the relaxed load restrictor shown below.

## First install

```bash
kubectl create namespace okinvo
kubectl -n okinvo create secret generic okinvo-secrets --from-env-file=.env.secrets   # keys: base/secret.example.yaml
# patch APP_URL, AUTH_ALLOWED_EMAILS and the Ingress host in the overlay's kustomization.yaml, then
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/overlays/compose-parity | kubectl apply -f -
kubectl -n okinvo rollout status deployment/okinvo
```

The init container runs the migrations before the app starts; a failed migration keeps the old
pod serving until the new one is created, so take a backup before upgrading.

## Upgrade

```bash
cd k8s/base && kustomize edit set image docker.io/deveshgupta30/okinvo:1.1.0 && cd -
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/overlays/compose-parity | kubectl apply -f -
```

Every merge to `main` also publishes `ghcr.io/deveshgupta30/okinvo:sha-<short commit>` (and
`-migrate`), and each release as `:X.Y.Z`. The packages are public, so setting that image is
enough: no `imagePullSecret` is needed.

## Backups and restore

The CronJob runs `backup.sh --now` at 02:00 cluster time into the `backups` volume and writes
`last-backup.json`, which Settings > Data shows. Run one now, or restore with a one-off pod
(the exact `kubectl run` override is in `k8s/README.md`):

```bash
kubectl -n okinvo create job --from=cronjob/okinvo-backup backup-now
```

## The documentation site

`overlays/with-docs` adds Wiki.js on `docs.<host>` with its own `wiki` database. The overlay
mounts the init script into the Postgres StatefulSet, which runs it on the first initialisation
only; on an existing install create the database once by hand
(`kubectl -n okinvo exec postgres-0 -- psql -U okinvo -d okinvo -c 'CREATE DATABASE wiki'`).

## Validation

CI builds every overlay and checks it with kubeconform's strict schema check:

```bash
for o in compose-parity with-seaweedfs with-docs; do
  kubectl kustomize --load-restrictor LoadRestrictionsNone "k8s/overlays/$o" > "/tmp/$o.yaml"
done
docker run --rm -v /tmp:/m ghcr.io/yannh/kubeconform:v0.7.0 -strict -summary /m/compose-parity.yaml /m/with-seaweedfs.yaml /m/with-docs.yaml
```

Assumptions to adjust: the ingress controller lives in a namespace labelled `ingress-nginx`,
certificates come from cert-manager's `letsencrypt` ClusterIssuer, and the namespace enforces the
`restricted` Pod Security Standard, which every pod satisfies.

Related: [Operations: Compose](operations-compose.md), [Exports and backups](exports-and-backups.md).
