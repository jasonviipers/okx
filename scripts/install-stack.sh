#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

MODE="${1:-dokploy}"
COMPOSE_FILES="-f docker-compose.yml"

case "$MODE" in
  dokploy|vps)
    ;;
  standalone|local)
    COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.standalone.yml"
    ;;
  *)
    echo "Usage: $0 [dokploy|standalone]" >&2
    exit 1
    ;;
esac

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Review secrets before exposing the stack." >&2
fi

mkdir -p .data

echo "Starting stack with: docker compose $COMPOSE_FILES up -d --build"
# shellcheck disable=SC2086
docker compose $COMPOSE_FILES up -d --build
