# AI Trading Swarm

AI Trading Swarm is a Next.js trading workstation with autonomous execution, local persistence, and a bundled observability stack.

## What Runs

- Next.js app with API routes and dashboard
- Redis for cache and throttling
- SQLite plus `sqlite-vss` for local persistence and vector search
- MinIO for object storage
- OpenTelemetry Collector, Jaeger, Prometheus, Loki, Promtail, and Grafana
- Cron worker for the autonomy endpoint

## Deployment Modes

This repo supports two Docker deployment shapes:

- `docker-compose.yml`
  Use this on Dokploy or any VPS that already has Traefik/Nginx on `80/443`.
  It starts the full app and observability stack without binding a competing edge proxy.

- `docker-compose.dokploy.yml`
  Optional override for Dokploy when you want Traefik-routed subdomains for the app,
  Grafana, Prometheus, Jaeger, and the MinIO console.

- `docker-compose.standalone.yml`
  Adds the bundled `nginx` service that binds `80/443`.
  Use this only when this repo should own ingress itself.

## One-Click Install

Prerequisites:

- Docker with Compose v2
- 4 GB RAM minimum

For Dokploy or a VPS with an existing reverse proxy:

```bash
./scripts/install-stack.sh
```

For Dokploy with Traefik labels and an external `dokploy-network`:

```bash
./scripts/install-stack.sh dokploy-traefik
```

For a standalone host where this project should also provide Nginx on `80/443`:

```bash
./scripts/install-stack.sh standalone
```

The installer will:

- create `.env` from `.env.example` if it is missing
- create the local `.data` directory
- build and start the correct compose stack

Review `.env` before exposing the stack publicly. Rotate every placeholder secret.

## Service URLs

| Service | URL |
| --- | --- |
| App | Routed by Dokploy/Traefik, or `http://localhost` when using the standalone Nginx override |
| Grafana | `http://localhost:3001` |
| MinIO Console | `http://localhost:9001` |
| Jaeger UI | `http://localhost:16686` |
| Prometheus | `http://localhost:9090` |

When using `docker-compose.dokploy.yml`, route these through Traefik instead of host ports
by setting compose env vars such as `TRAEFIK_APP_RULE`, `TRAEFIK_GRAFANA_RULE`,
`TRAEFIK_MINIO_CONSOLE_RULE`, `TRAEFIK_JAEGER_RULE`, and `TRAEFIK_PROMETHEUS_RULE`.

## Important Dokploy Note

If your VPS already runs Dokploy, Docker is not the issue when `docker ps` shows only the web container. The issue is usually deployment shape:

- Dokploy's Traefik already owns `80/443`
- this repo's old bundled `nginx` service also tried to own `80/443`
- Grafana, Prometheus, Loki, Jaeger, MinIO, and cron do not appear unless Dokploy deploys the full compose stack rather than only the app image

Use `docker-compose.yml` for Dokploy deployments, optionally with
`docker-compose.dokploy.yml` when you want Traefik-managed hostnames. Do not use the
standalone Nginx override on a Dokploy host.

## Environment

For Docker deployments, start from `.env.example`.

For non-Docker local development, use `.env.local.example`.

Key variables:

```bash
APP_URL=http://localhost
NEXT_PUBLIC_APP_URL=http://localhost
REDIS_URL=redis://redis:6379
DATABASE_URL=file:/app/.data/db.sqlite
MINIO_ENDPOINT=http://minio:9000
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
GF_SECURITY_ADMIN_PASSWORD=change-me-strong-password
CRON_SECRET=change-me-32-chars-minimum
```

Trading defaults in the example env are conservative:

- `OKX_ACCOUNT_MODE=paper`
- `AUTONOMOUS_TRADING_ENABLED=false`

That means a fresh deployment will stay flat until you explicitly configure and enable autonomous trading.

## First-Time Migration

After the stack is healthy:

```bash
sh scripts/migrate-uploads.sh
sh scripts/backfill-vectors.sh
```

## Development

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Useful Commands

```bash
pnpm exec tsc --noEmit
pnpm exec biome check .
pnpm exec biome format --write .
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f app
```
