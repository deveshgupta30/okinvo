#!/usr/bin/env bash
# Prints fresh secrets in .env syntax. Usage: scripts/gen-secrets.sh >> .env  (then delete the placeholder lines)
set -euo pipefail
echo "AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "FIELD_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
