#!/bin/bash
# Sync existing .data/uploads/ directory to MinIO
set -e

MC_ALIAS="local"
mc alias set "$MC_ALIAS" http://localhost:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mirror --overwrite .data/uploads/ "$MC_ALIAS/uploads/"
echo "Upload migration complete."
