#!/bin/sh
set -eu

until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "Waiting for MinIO..."
  sleep 2
done

for bucket in "$MINIO_BUCKET_TELEMETRY" "$MINIO_BUCKET_BACKUPS" "$MINIO_BUCKET_MARKET_DATA"; do
  mc mb --ignore-existing "local/$bucket"
  mc anonymous set private "local/$bucket"
done

if [ "$MINIO_ACCESS_KEY" != "$MINIO_ROOT_USER" ] || [ "$MINIO_SECRET_KEY" != "$MINIO_ROOT_PASSWORD" ]; then
  mc admin user add local "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null 2>&1 || true
  mc admin policy attach local readwrite --user "$MINIO_ACCESS_KEY" >/dev/null 2>&1 || true
fi

echo "MinIO bootstrap complete."
