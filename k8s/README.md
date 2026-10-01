# okinvo on Kubernetes

Kustomize manifests with the same images and semantics as `compose.yml`
(`IMPLEMENTATION_PLAN_v2.md` §17). One namespace, `okinvo`, holds Postgres, the app (with the
migrate image as an init container), a nightly backup CronJob, default-deny NetworkPolicies and
an Ingress.

| Overlay | Blob storage | Replicas | Rate limits |
| --- | --- | --- | --- |
| `overlays/compose-parity` | local, RWO volume `app-data` | 1 (`Recreate`) | in memory |
| `overlays/with-seaweedfs` (**experimental**) | SeaweedFS S3 (`seaweedfs` StatefulSet) | 2 (`RollingUpdate`, PDB) | Postgres |

`with-seaweedfs` is experimental: the S3 driver is not exercised by the automated tests or the
restore drill, `backup.sh` covers the database only there (snapshot the `seaweed-data` volume
yourself), the `okinvo` bucket must exist before the first upload (create it with `weed shell`
or any S3 client against `seaweedfs:8333`), and Settings → Data cannot show the backup status
because the app pods mount no volumes. The backup CronJob itself still runs: it mounts
`app-data` (empty under S3) and `backups`, so keep it on a node that can attach them.

The backup CronJob gets `docker/backup/*.sh` through a generated ConfigMap. That directory sits
outside `k8s/`, so every build needs the relaxed load restrictor shown below.

## First install

```bash
kubectl create namespace okinvo
kubectl -n okinvo create secret generic okinvo-secrets --from-env-file=.env.secrets   # keys: base/secret.example.yaml
# with-seaweedfs only:
kubectl -n okinvo create secret generic seaweedfs-s3 --from-file=s3.json=docker/seaweedfs/s3.json

# patch APP_URL, AUTH_ALLOWED_EMAILS and the Ingress host in the overlay's kustomization.yaml, then
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/overlays/compose-parity | kubectl apply -f -
kubectl -n okinvo rollout status deployment/okinvo
```

The app pod's init container runs `prisma migrate deploy` before the app starts; a failed
migration keeps the old pod serving (`Recreate` strategy: it keeps the previous pod only until
the new one is created — take a backup before upgrading).

## Upgrade

```bash
# set the image tag in base/kustomization.yaml (`images:`), or:
cd k8s/base && kustomize edit set image docker.io/deveshgupta30/okinvo:1.1.0 && cd -
kubectl kustomize --load-restrictor LoadRestrictionsNone k8s/overlays/compose-parity | kubectl apply -f -
```

## Backups and restore

`okinvo-backup` runs `backup.sh --now` at 02:00 cluster time into the `backups` PVC and writes
`last-backup.json`, which Settings → Data shows (the app mounts the PVC read-only). Run one now
or restore:

```bash
kubectl -n okinvo create job --from=cronjob/okinvo-backup backup-now
kubectl -n okinvo scale deployment/okinvo --replicas=0
kubectl -n okinvo run restore --rm -it --restart=Never --image=postgres:18.6-alpine \
  --overrides='{"spec":{"containers":[{"name":"restore","image":"postgres:18.6-alpine","command":["/bin/sh","/backup/restore.sh","/backups/pg/<dump>","/backups/storage/<tgz>"],"envFrom":[{"configMapRef":{"name":"okinvo-config"}},{"secretRef":{"name":"okinvo-secrets"}}],"volumeMounts":[{"name":"scripts","mountPath":"/backup"},{"name":"app-data","mountPath":"/data"},{"name":"backups","mountPath":"/backups"}]}],"volumes":[{"name":"scripts","configMap":{"name":"okinvo-backup-scripts"}},{"name":"app-data","persistentVolumeClaim":{"claimName":"app-data"}},{"name":"backups","persistentVolumeClaim":{"claimName":"backups"}}]}}'
kubectl -n okinvo scale deployment/okinvo --replicas=1
```

## Validation (CI does the same)

```bash
for o in compose-parity with-seaweedfs; do
  kubectl kustomize --load-restrictor LoadRestrictionsNone "k8s/overlays/$o" > "/tmp/$o.yaml"
done
docker run --rm -v /tmp:/m ghcr.io/yannh/kubeconform:v0.7.0 -strict -summary /m/compose-parity.yaml /m/with-seaweedfs.yaml
```

Assumptions to adjust: the ingress controller lives in a namespace labelled
`kubernetes.io/metadata.name=ingress-nginx` (NetworkPolicy `app`), certificates come from
cert-manager's `letsencrypt` ClusterIssuer (Ingress annotation), and the namespace enforces the
`restricted` Pod Security Standard, which every pod here satisfies.
