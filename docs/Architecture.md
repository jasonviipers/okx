# Platform Architecture — Full Open-Source Stack

## Overview

This document defines the complete target architecture for migrating from the existing stack (Redis + SQLite + Nginx + Cron) to a production-grade, fully open-source, one-click deployable platform. Every component runs inside Docker Compose with no paid services.

---

## Architectural Principles

- **Zero paid dependencies** — all services are open-source with permissive licenses
- **One-click deployment** — single `docker compose up -d` bootstraps the entire platform
- **Low latency** — SQLite (local I/O) for persistent reads, Redis for hot-path caching/queues
- **Observability-first** — traces, metrics, and logs flow automatically to the monitoring stack
- **Vector-native memory** — `sqlite-vss` extension enables semantic search directly in SQLite
- **Immutable object storage** — MinIO replaces any cloud blob storage (S3-compatible API)
- **Migration-safe** — Drizzle ORM handles schema versioning; no breaking changes required

---

## Component Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INGRESS LAYER                              │
│   Nginx (TLS termination, rate limiting, WebSocket proxy)           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                        APP LAYER                                    │
│   Next.js 20 (Node Alpine) — SSR + API routes + background tasks    │
│   Exposed only on internal Docker network (port 3000)               │
└───────┬────────────┬────────────┬──────────────┬────────────────────┘
        │            │            │              │
┌───────▼──┐  ┌──────▼──┐  ┌─────▼──────┐  ┌───▼──────────────────┐
│  Redis   │  │ SQLite   │  │   MinIO    │  │  Cron Worker         │
│  8.x     │  │ + VSS    │  │  (S3 API)  │  │  (Dockerfile.cron)   │
│  Alpine  │  │ (file)   │  │            │  │                      │
│          │  │          │  │            │  └──────────────────────┘
│ Realtime │  │ Data +   │  │ Artifacts  │
│ Queues   │  │ Memory   │  │ Uploads    │
│ Sessions │  │ Vectors  │  │ Exports    │
└──────────┘  └──────────┘  └────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     OBSERVABILITY LAYER                             │
│                                                                     │
│  OpenTelemetry Collector  →  Jaeger (distributed traces)           │
│  Prometheus (scrapes app + Redis + MinIO)  →  Grafana (dashboards) │
│  Loki (log aggregation)  ←  Promtail (log shipper)                 │
│                                                                     │
│  All dashboards accessible at http://localhost:3001 (Grafana)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Service Responsibilities

### Nginx
- TLS termination (self-signed in dev, Certbot-ready in prod)
- WebSocket upgrade headers (`Connection: upgrade`)
- 50 MB client body limit for file uploads
- Rate limiting on `/api/` routes (burst 20, rate 10r/s)
- Static asset caching headers

### Next.js App
- Server-side rendering + React Server Components
- REST/streaming API routes under `/api/`
- Background autonomy worker at `/api/ai/system/autonomy/worker`
- Connects to Redis via `REDIS_URL`, SQLite via `.data/db.sqlite`
- Instruments all spans via OpenTelemetry SDK

### Redis 8.x
- Session store (TTL-based keys)
- Real-time pub/sub for live signals
- BullMQ job queues for async AI tasks
- Append-only file persistence (`--appendonly yes`)

### SQLite + sqlite-vss
- Primary relational database (`swarm_memory`, users, sessions, etc.)
- Vector extension enables `vss_search()` for semantic memory retrieval
- Lives in Docker volume `.data/db.sqlite` (survives container restarts)
- Migrations managed by Drizzle ORM (auto-run on startup)

### MinIO
- S3-compatible object storage running locally
- Buckets: `uploads` (user files), `exports` (generated reports), `artifacts` (AI outputs)
- Accessible via standard AWS SDK (`endpoint: http://minio:9000`)
- Console UI at `http://localhost:9001`

### Cron Worker
- Lightweight container calling the app's worker endpoint on schedule
- Uses `CRON_SECRET` for authenticated requests
- Configurable schedule via `CRON_SCHEDULE` env var (default `*/5 * * * *`)

### OpenTelemetry Collector
- Receives traces from the app via OTLP gRPC (port 4317)
- Exports to Jaeger for trace visualization
- Also ships metrics to Prometheus remote-write endpoint

### Prometheus
- Scrapes: app `/metrics`, Redis exporter, MinIO `/minio/health/live`
- 15-second scrape interval
- 30-day retention

### Grafana
- Pre-provisioned datasources: Prometheus, Loki, Jaeger
- Dashboard: Platform Overview (latency p50/p95/p99, queue depth, error rate)
- Port 3001 (avoids conflict with app on 3000)

### Loki + Promtail
- Promtail reads Docker container logs via `/var/lib/docker/containers`
- Ships to Loki with labels: `{service="app"}`, `{service="redis"}`, etc.
- Queryable from Grafana Explore tab

---

## Data Flow

### Write Path (Signal → Storage)
```
AI Agent generates signal
  → POST /api/signals
    → Validate + enrich (Redis cache for market data)
    → INSERT INTO swarm_memory (SQLite)
    → vss_insert() for vector embedding
    → PUBLISH redis channel "signals:live"
    → Enqueue MinIO export job (BullMQ)
```

### Read Path (Query → Response)
```
Client requests signals
  → GET /api/signals?q=<query>
    → Check Redis cache (TTL 30s)
    → Cache miss → vss_search() in SQLite for semantic match
    → Return top-k results, populate cache
    → Stream response via Server-Sent Events
```

### Observability Path
```
Every request → OTel SDK auto-instrumentation
  → Span exported to OTel Collector (gRPC 4317)
    → Collector fans out to Jaeger + Prometheus
  → Container stdout → Promtail → Loki
```

---

## Environment Variables

```bash
# App
NODE_ENV=production
REDIS_URL=redis://redis:6379
DATABASE_URL=file:/app/.data/db.sqlite
NEXTAUTH_SECRET=<32-char-random>
CRON_SECRET=<32-char-random>

# MinIO
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=<strong-secret>
MINIO_BUCKET_UPLOADS=uploads
MINIO_BUCKET_EXPORTS=exports

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=platform-app
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0

# Grafana
GF_SECURITY_ADMIN_PASSWORD=<strong-secret>
GF_SERVER_HTTP_PORT=3001
```

---

## Migration Strategy

### Phase 1 — Additive (no breaking changes)
1. Deploy the base `docker-compose.yml` stack alongside any existing app-only deployment
2. MinIO starts accepting new uploads (old files remain on disk)
3. OTel instrumentation added to app (zero-overhead until collector runs)
4. sqlite-vss extension loaded; vector table created alongside existing tables

### Phase 2 — Data Migration
1. Run `scripts/migrate-uploads.sh` to sync `.data/uploads/` → MinIO bucket
2. Run `scripts/backfill-vectors.sh` to embed existing `swarm_memory` rows
3. Validate row counts and spot-check vectors

### Phase 3 — Cutover
1. Switch Nginx to new compose network
2. Enable Prometheus scraping + Grafana dashboards
3. Decommission old cron container (new BullMQ scheduler takes over)

### Rollback
- All SQLite data is in a persistent volume or mounted `.data` directory; rollback = `docker compose down && docker compose -f docker-compose.yml up -d`
- MinIO data is independent; old disk path remains untouched during migration

---

## Security Checklist

- [ ] Redis bind to `127.0.0.1` inside container (not exposed on host)
- [ ] MinIO credentials rotated from defaults before production
- [ ] Grafana admin password set via env (not hardcoded)
- [ ] Nginx rate limiting active on all `/api/` routes
- [ ] OTel collector not exposed on host ports (internal network only)
- [ ] `.env` in `.gitignore`; use Docker secrets for production

---

## Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| API p99 latency | < 200 ms | SQLite on local NVMe, Redis hot cache |
| Signal fan-out (pub/sub) | < 10 ms | Redis pub/sub |
| Vector search (1M rows) | < 50 ms | sqlite-vss ANN index |
| File upload (10 MB) | < 2 s | MinIO local network |
| Log query (24h window) | < 3 s | Loki chunk index |
