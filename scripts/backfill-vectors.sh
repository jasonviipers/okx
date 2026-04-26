#!/bin/bash
# Re-embed all swarm_memory rows that lack a vector
# Calls the app's internal backfill API endpoint
set -e

curl -X POST http://localhost:3000/api/ai/memory/backfill \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
