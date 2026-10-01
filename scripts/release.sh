#!/usr/bin/env bash
# Build (and optionally push) the okinvo images (IMPLEMENTATION_PLAN_v2.md §18.2).
#
#   scripts/release.sh --version 1.0.0 [--push] [--platform linux/amd64,linux/arm64]
#                      [--skip-checks] [--dry-run]
#
# 1. Refuses a dirty working tree; runs lint, typecheck and the unit/integration tests.
# 2. Builds the runner image for the host architecture, loads it into Docker and scans it with
#    Trivy (the binary if installed, otherwise the aquasec/trivy container) BEFORE anything leaves
#    this machine.
# 3. With --push only: multi-arch buildx of the `runner` and `migrate` targets, tagged
#    X.Y.Z, X.Y and latest (+ "-migrate"), pushed to docker.io/deveshgupta30/okinvo, then the
#    annotated git tag vX.Y.Z is created and pushed. Without --push nothing is pushed or tagged.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${OKINVO_IMAGE:-docker.io/deveshgupta30/okinvo}"
SOURCE="https://github.com/deveshgupta30/okinvo"
VERSION=""
PUSH=0
PLATFORM="linux/amd64,linux/arm64"
SKIP_CHECKS=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    --push) PUSH=1; shift ;;
    --platform) PLATFORM="${2:-}"; shift 2 ;;
    --skip-checks) SKIP_CHECKS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "release.sh: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "release.sh: --version X.Y.Z is required" >&2; exit 2; }
MINOR="${VERSION%.*}"

run() { # print, then execute unless --dry-run
  printf '▸ %s\n' "$*"
  if [ "$DRY_RUN" -eq 0 ]; then "$@"; fi
}

if [ "$DRY_RUN" -eq 0 ] && ! git diff --quiet --ignore-submodules HEAD; then
  echo "release.sh: working tree is dirty — commit or stash first" >&2
  exit 1
fi

if [ "$SKIP_CHECKS" -eq 0 ]; then
  run pnpm lint
  run pnpm typecheck
  run pnpm test
fi

LABELS=(
  --label "org.opencontainers.image.version=$VERSION"
  --label "org.opencontainers.image.source=$SOURCE"
  --label "org.opencontainers.image.revision=$(git rev-parse HEAD)"
)

run docker buildx inspect okinvo >/dev/null 2>&1 || run docker buildx create --name okinvo --use
run docker buildx use okinvo

# 1. Host-architecture build, loaded locally, scanned before any push.
run docker buildx build -f docker/Dockerfile --target runner --load -t "$IMAGE:$VERSION" "${LABELS[@]}" .
if command -v trivy >/dev/null 2>&1; then
  run trivy image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed "$IMAGE:$VERSION"
elif docker image inspect aquasec/trivy:latest >/dev/null 2>&1 || docker pull aquasec/trivy:latest >/dev/null 2>&1; then
  run docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
    image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed "$IMAGE:$VERSION"
else
  echo "release.sh: Trivy not available — image NOT scanned" >&2
fi

if [ "$PUSH" -eq 0 ]; then
  echo "release.sh: built and scanned $IMAGE:$VERSION locally. Re-run with --push to publish"
  echo "            $IMAGE:{$VERSION,$MINOR,latest} and the -migrate images for $PLATFORM, and tag v$VERSION."
  exit 0
fi

# 2. Multi-arch build and push of both targets (the host arch is a cache hit).
for target in runner migrate; do
  suffix=""
  [ "$target" = migrate ] && suffix="-migrate"
  run docker buildx build --platform "$PLATFORM" -f docker/Dockerfile --target "$target" "${LABELS[@]}" \
    -t "$IMAGE:$VERSION$suffix" -t "$IMAGE:$MINOR$suffix" -t "$IMAGE:latest$suffix" --push .
done

run git tag -a "v$VERSION" -m "okinvo $VERSION"
run git push origin "v$VERSION"
echo "release.sh: published $IMAGE:$VERSION (+ $MINOR, latest, -migrate) and tag v$VERSION"
