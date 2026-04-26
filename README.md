# AI Trading Swarm

AI Trading Swarm is a Next.js full-stack trading workstation built around a multi-agent decision engine.

It combines:

- live and demo OKX market/account connectivity
- a role-based AI swarm for signal generation
- validator and veto layers for safer trade decisions
- Ollama-backed model reasoning with Gemini-grounded web research
- a terminal-style dashboard for operators
- Redis-backed caching and throttling
- local durable history for swarm runs and executions

## Quick Start

### Prerequisites

- Docker + Docker Compose v2
- 4 GB RAM minimum

### Start Everything

```bash
cp .env.example .env
# Edit .env — change all "change-me" values
docker compose -f docker-compose.full.yml up -d
```

### Service URLs

| Service | URL |
| --- | --- |
| App | http://localhost |
| Grafana | http://localhost:3001 (`admin` / see `GF_SECURITY_ADMIN_PASSWORD` in `.env`) |
| MinIO Console | http://localhost:9001 |
| Jaeger UI | http://localhost:16686 |
| Prometheus | http://localhost:9090 |

For a deployed Docker host behind the bundled Nginx reverse proxy, you can
route observability services with dedicated subdomains such as:

- `grafana.yourdomain.com`
- `minio.yourdomain.com`
- `jaeger.yourdomain.com`
- `prometheus.yourdomain.com`

These hostnames must resolve to the same server as the app so Nginx can route
them to the internal containers.

### First-Time Migration

```bash
# After containers are healthy:
bash scripts/migrate-uploads.sh
bash scripts/backfill-vectors.sh
```

## Core Concepts

### Market layer

The app fetches:

- ticker
- candles
- order book
- positions
- trading wallet
- funding wallet
- spot buying power for the selected symbol

### Swarm layer

The current swarm is built from five active voting models:

- `deepseek-v3.2:cloud` -> `trend_follower`
- `gemma4:31b-cloud` -> `momentum_analyst`
- `kimi-k2.5:cloud` -> `sentiment_reader`
- `ministral-3:cloud` -> `macro_filter` (veto layer)
- `glm-5.1:cloud` -> `execution_tactician` (veto layer)

The system computes weighted consensus, then runs structural and veto validation before anything can be considered executable.

### Research layer

When configured, agents can enrich their decision context using:

- Gemini Search grounding via `@ai-sdk/google`

Research is cached briefly to avoid duplicate lookups across agents.

### Trust and observability

The app now includes:

- canonical `/api/*` routes for frontend data access
- runtime status endpoint for OKX / Redis / Ollama / web research
- source-health metadata in API responses
- local durable history storage for swarm runs and trade executions

## Project Structure

```text
src/
  app/
    api/
      market/
      swarm/
      trade/
      system/
  components/
    dashboard/
    ui/
  lib/
    agents/
    ai/
    api/
    configs/
    observability/
    okx/
    persistence/
    prompts/
    redis/
    swarm/
  types/
```

## Canonical API Routes

Use these routes from the frontend:

### Market

- `GET /api/market/ticker?symbol=BTC-USDT`
- `GET /api/market/candles?symbol=BTC-USDT&timeframe=1H&limit=20`

### Swarm

- `GET /api/swarm/consensus?symbol=BTC-USDT&timeframe=1H`
- `GET /api/swarm/stream?symbol=BTC-USDT&timeframe=1H`
- `POST /api/swarm/analyze`
- `GET /api/swarm/history?limit=50`

### Trade

- `GET /api/trade/account?symbol=BTC-USDT`
- `GET /api/trade/positions`
- `POST /api/trade/execute`
- `GET /api/trade/history?limit=50`

### System

- `GET /api/system/status`

## Environment Variables

Create your local env from `.env.local.example`.

### OKX

```bash
OKX_API_KEY=
OKX_SECRET=
OKX_PASSPHRASE=
OKX_API_REGION=global
OKX_BASE_URL=https://www.okx.com
OKX_WS_URL=wss://ws.okx.com:8443/ws/v5/public
OKX_ACCOUNT_MODE=paper
```

Use `OKX_ACCOUNT_MODE=live` for real account access.

### Redis

```bash
REDIS_URL=redis://localhost:6379
```

If Redis is missing, the app falls back to in-memory cache behavior.

### Ollama

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_API_KEY=
```

Use Ollama for the existing reasoning models.

### Google Generative AI

```bash
GOOGLE_GENERATIVE_AI_API_KEY=
GOOGLE_EMBEDDING_MODEL=gemini-embedding-001
GOOGLE_SEARCH_MODEL=gemini-2.5-flash
```

Google now powers vector embeddings and Gemini Search-grounded research.

## Getting Started

Install dependencies and run the dev server:

```bash
pnpm install
pnpm dev
```

Then open:

```text
http://localhost:3000
```

## Useful Commands

```bash
pnpm dev
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm exec biome check .
pnpm exec biome format --write .
```

## Runtime Notes

### Live vs demo

The footer shows runtime service status and account mode.

- `OKX LIVE` means private requests are live-account scoped
- `OKX PAPER` means simulated-trading header mode
- `REDIS MEM` means Redis is not configured and memory fallback is active
- `SEARCH WEB` means Gemini Search grounding is enabled

### Fallback market data

Some market helpers still fall back to synthetic data if the public OKX request fails.
This is useful in development, but you should treat it as non-production behavior.

Recommended future hardening:

- add an env flag to disable synthetic fallback in production
- surface explicit fallback warnings in the dashboard panels

## Persistence

The app now keeps a local durable history file under:

```text
.data/history.json
```

This currently stores:

- swarm runs
- trade executions

It is a bridge toward full database-backed persistence.

## Next Recommended Steps

1. Add Postgres-backed persistence for swarm runs, votes, executions, and portfolio snapshots.
2. Add unit tests for consensus, validator, and OKX parsing logic.
3. Add explicit fallback-data warnings and source-health display in panels.
4. Build history pages for swarm runs and executions.
5. Add internal paper-trading mode independent of OKX demo.
