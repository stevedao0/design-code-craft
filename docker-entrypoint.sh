#!/bin/bash
set -e

# =========================================
# VCPMC Docker Entrypoint
# =========================================
# Loads environment from .env.production (passed via env_file in compose).
# No secrets files needed — all secrets come from env vars.
# =========================================

echo "Starting VCPMC App (production)..."
echo "  APP_ENV=${APP_ENV:-unset}"
echo "  DATABASE_URL=<hidden>"
echo "  JWT_SECRET_KEY=<hidden>"

# Ensure storage directories exist (bind-mounted as rw, mkdir succeeds)
mkdir -p /app/storage
mkdir -p /app/storage/preview
mkdir -p /app/storage/gcn_qr
mkdir -p /app/storage/logs

exec "$@"
