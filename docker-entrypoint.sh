#!/bin/sh
set -eu

echo "Running database migrations..."
node_modules/.bin/drizzle-kit migrate --config=drizzle.config.ts

echo "Starting application..."
exec node_modules/.bin/next start -H 0.0.0.0 -p 3000
