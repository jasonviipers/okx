# AI Trading Swarm

A Next.js platform for autonomous AI-driven market analysis and OKX trade execution. The system combines a deterministic decision engine, real-time market data, swarm intelligence, and optional LLM overlays to produce `BUY`, `SELL`, or `HOLD` decisions on spot crypto instruments with configurable risk guardrails.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Quick Start (Local Development)](#quick-start-local-development)
- [Environment Configuration](#environment-configuration)
  - [OKX API](#okx-api-configuration)
  - [Redis and Database](#redis-and-database)
  - [Ollama / AI](#ollama--ai-configuration)
  - [Autonomous Swarm Execution](#autonomous-swarm-execution)
  - [Position Monitoring](#position-monitoring)
  - [Trailing Stop](#trailing-stop)
  - [Market Data Controls](#market-data-controls)
  - [Security and Telemetry](#security-and-telemetry)
- [Running with Docker Compose](#running-with-docker-compose)
- [Running Locally (Development)](#running-locally-development)
- [Database Migrations](#database-migrations)
- [Linting and Formatting](#linting-and-formatting)
- [Project Structure](#project-structure)
- [Key Concepts](#key-concepts)
  - [Decision Engine](#decision-engine)
  - [Autonomy Loop](#autonomy-loop)
  - [Swarm Intelligence](#swarm-intelligence)
  - [Market Data Pipeline](#market-data-pipeline)
  - [Telemetry](#telemetry)
- [API Routes](#api-routes)
- [Cron Worker](#cron-worker)
- [Color Schemes](#color-schemes)
- [Security Notes](#security-notes)

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────┐
│                   Next.js Application               │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐│
│  │ Dashboard │ │Telemetry │ │  API Routes          ││
│  │  (UI)     │ │Dashboard │ │  /api/ai/*           ││
│  └──────────┘ └──────────┘ └──────────┬───────────┘│
│                                      │             │
│  ┌───────────────────────────────────▼─────────────┐│
│  │           Autonomous Trading Loop                ││
│  │  Autonomy Service → Decision Engine → Execution  ││
│  └───┬──────────────┬───────────────┬──────────────┘│
│      │              │               │               │
│  ┌───▼────┐  ┌──────▼─────┐  ┌─────▼──────┐       │
│  │Market  │  │  Swarm /   │  │   OKX      │       │
│  │Data    │  │  Consensus  │  │   Client   │       │
│  │Service │  │  Engine     │  │  REST + WS │       │
│  └───┬────┘  └────────────┘  └─────┬──────┘       │
│      │                             │               │
│  ┌───▼────────┐            ┌──────▼─────────────┐ │
│  │  Redis     │            │ PostgreSQL +       │ │
│  │  (cache)   │            │ pgvector (persist) │ │
│  └────────────┘            └────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| Node.js | 20+ | Required for Next.js and tooling |
| pnpm | Latest | Package manager (`corepack enable` recommended) |
| Redis | 8.x+ | Used for caching, rate limiting, and swarm state |
| OKX Account | — | API key with trade permission required for live trading |
| Ollama (optional) | — | Local or cloud-hosted for optional LLM overlays |

---

## Quick Start (Docker)

1. Copy the example environment file and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your OKX API credentials and desired configuration (see [Environment Configuration](#environment-configuration) below).

3. Start all services:

   ```bash
   docker compose up --build -d
   ```

4. Open the dashboard at `http://localhost:8080` (nginx defaults to host port 8080).

See [Running with Docker Compose](#running-with-docker-compose) for details on each container.

---

## Quick Start (Local Development)

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the local development environment file and fill in your credentials:

   ```bash
   cp .env.local.example .env.local
   ```

   > **Note:** For local development, use `.env.local`. The `REDIS_URL` defaults to `redis://localhost:6379`.

3. Ensure Redis is running locally (or update `REDIS_URL` to point to your Redis instance).

4. Run database migrations:

   ```bash
   pnpm dlx drizzle-kit migrate
   ```

5. Start the development server:

   ```bash
   pnpm dev
   ```

6. Open `http://localhost:3000`.

---

## Environment Configuration

All configuration is managed through environment variables. The project uses `@t3-oss/env-nextjs` with Zod schemas for validated environment access (see `src/env.ts`). Every variable is optional with sensible defaults, but **OKX API credentials are required** for any trading functionality.

Two example files are provided:

| File | Purpose |
|---|---|
| `.env.example` | Docker Compose deployment (Redis at `redis://redis:6379`) |
| `.env.local.example` | Local development (Redis at `redis://localhost:6379`) |

### OKX API Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `OKX_API_KEY` | string | — | Your OKX API key. Required for trading. |
| `OKX_SECRET` | string | — | Your OKX API secret. Required for trading. |
| `OKX_PASSPHRASE` | string | — | Your OKX API passphrase. Required for trading. |
| `OKX_API_REGION` | enum: `global`, `us`, `eu`, `au` | `global` | OKX API region. Select the region matching your OKX account. |
| `OKX_BASE_URL` | URL | `https://www.okx.com` | OKX REST API base URL. |
| `OKX_WS_URL` | URL | `wss://wspap.okx.com:8443/ws/v5/public` | OKX WebSocket endpoint for public market data. |
| `OKX_ACCOUNT_MODE` | enum: `live`, `demo`, `paper` | `paper` | Trading account mode. **`paper`** sends `x-simulated-trading: 1` (safe for testing). **`demo`** uses the OKX demo trading environment. **`live`** uses real funds. |
| `OKX_DERIVATIVES_TD_MODE` | enum: `cross`, `isolated` | `cross` | Margin mode used for derivatives orders. Ignored for spot trading. |
| `OKX_POSITION_MODE` | enum: `net`, `long_short` | `net` | Position mode used for derivatives orders. Ignored for spot trading. |

> **Important:** Never set `OKX_ACCOUNT_MODE=live` until you have fully tested with `paper` or `demo` mode. Live mode trades with real funds.

### Redis and Database

| Variable | Type | Default | Description |
|---|---|---|---|
| `REDIS_URL` | URL | — | Redis connection URL. Used for caching, rate limiting, and swarm state. **Docker:** `redis://redis:6379`. **Local:** `redis://localhost:6379`. |
| `DATABASE_URL` | URL | — | PostgreSQL connection string. **Docker:** `postgresql://trading:<password>@postgres:5432/trading`. |
| `POSTGRES_USER` | string | `trading` | PostgreSQL username used by Docker Compose bootstrap. |
| `POSTGRES_PASSWORD` | string | — | PostgreSQL password used by the app and migration entrypoint. |
| `POSTGRES_DB` | string | `trading` | PostgreSQL database name. |
| `PGCONNECT_TIMEOUT` | integer | `10` | PostgreSQL connection timeout in seconds. |

### Ollama / AI Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `OLLAMA_BASE_URL` | URL | `http://localhost:11434` | Ollama API base URL. Use a local Ollama instance or a cloud endpoint. |
| `OLLAMA_API_KEY` | string | — | API key for cloud-hosted Ollama (required for web search/fetch features). Leave empty for local Ollama. |
| `TRADING_MODE` | enum: `conservative`, `balanced`, `aggressive`, `scalp` | `balanced` | Default execution posture used by the deterministic engine and diagnostic overlays. |

> The LLM layer is **optional** — the primary decision engine is deterministic. Ollama is only used as a secondary overlay when configured.

### Autonomous Swarm Execution

These variables control the autonomous trading loop behavior.

| Variable | Type | Default | Description |
|---|---|---|---|
| `AUTONOMOUS_TRADING_ENABLED` | boolean | `false` | Master switch for autonomous trading. Must be `true` for the system to execute trades without human confirmation. |
| `AUTO_EXECUTE_ENABLED` | boolean | `true` | When `true`, approved decisions are executed automatically. When `false`, decisions are logged but not placed. |
| `MAX_POSITION_USD` | number | `100` | Maximum position size in USD per trade. |
| `MAX_BALANCE_USAGE_PCT` | number | `0.9` | Maximum fraction of account balance to allocate across all positions (0–1). |
| `MIN_TRADE_NOTIONAL` | number | `5` | Minimum trade notional value in USD. Trades below this are rejected. |
| `MIN_CONFIDENCE_THRESHOLD` | number | `60` | Minimum confidence score (0–100) required to execute. Decisions below this threshold result in `HOLD`. |
| `LIVE_TRADING_BUDGET_USD` | number | `10` | Total USD budget for live autonomous trading. Used as a circuit-breaker limit. |
| `AUTONOMY_MAX_SYMBOL_ALLOCATION_PCT` | number | `0.4` | Maximum fraction of the budget allocated to a single symbol (0–1). |
| `MAX_SYMBOL_ALLOCATION_PCT` | number | `0.4` | Alias for `AUTONOMY_MAX_SYMBOL_ALLOCATION_PCT`. |
| `MAX_DAILY_TRADES` | integer | `20` | Maximum number of trades per day. Acts as a daily circuit breaker. |
| `MIN_DIRECTIONAL_EDGE_SCORE` | number | `0.12` | Minimum directional edge score to consider execution. |
| `MIN_MARKET_QUALITY_SCORE` | number | `0.55` | Minimum market quality score required for execution. |
| `MIN_NET_EDGE_BPS` | number | `6` | Minimum net edge in basis points after fees and slippage. |
| `MIN_REWARD_RISK` | number | `1.35` | Minimum reward-to-risk ratio required. |
| `EXPECTED_FEE_BPS` | number | `8` | Expected fee cost in basis points, factored into net edge calculation. |
| `AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_THRESHOLD` | integer | `10` | Number of consecutive degraded snapshots before suppressing execution. |
| `AUTONOMY_DEGRADED_SNAPSHOT_SUPPRESSION_WINDOW_MS` | integer | `1800000` | Time window in milliseconds for the degraded snapshot suppression check (default: 30 minutes). |

### Symbol Selection

| Variable | Type | Default | Description |
|---|---|---|---|
| `AUTONOMOUS_SYMBOL_SELECTION` | enum: `auto`, `fixed` | `auto` | Symbol selection mode. **`auto`** dynamically resolves instruments from OKX and account balances. **`fixed`** uses `AUTONOMOUS_SYMBOL` or `AUTONOMOUS_SYMBOLS`. |
| `AUTONOMOUS_SYMBOL` | string | `BTC-USDT` | Single trading instrument when selection mode is `fixed`. |
| `AUTONOMOUS_SYMBOLS` | string | `BTC-USDT,ETH-USDT,SOL-USDT,BNB-USDT,XRP-USDT,ADA-USDT,DOGE-USDT,LINK-USDT` | Comma-separated list of instruments for `fixed` mode. |
| `AUTONOMOUS_MARKET_TYPES` | string | `spot` | Comma-separated market types to allow during autonomous symbol discovery. Keep this at `spot` for the current spot-first product. |
| `AUTONOMOUS_QUOTE_CURRENCIES` | string | `USDT,EUR,USDC` | Allowed quote currencies for dynamic symbol resolution. |
| `AUTONOMOUS_SYMBOL_LIMIT` | integer | `8` | Maximum number of symbols to track in `auto` mode. |
| `AUTONOMOUS_QUOTE_CURRENCY` | string | `USDT` | Primary quote currency. |
| `AUTONOMOUS_TIMEFRAME` | enum: `1m`, `3m`, `5m`, `15m`, `30m`, `1H`, `2H`, `4H`, `6H`, `12H`, `1D`, `1W` | `1H` | Candle timeframe for decision analysis. |

### Scheduling

| Variable | Type | Default | Description |
|---|---|---|---|
| `AUTONOMOUS_INTERVAL_MS` | integer | `60000` | Interval in milliseconds between autonomy loop cycles (default: 1 minute). |
| `AUTONOMOUS_COOLDOWN_MS` | integer | `120000` | Minimum cooldown in milliseconds after a trade before the next execution (default: 2 minutes). |

### Position Monitoring

| Variable | Type | Default | Description |
|---|---|---|---|
| `POSITION_MONITOR_ENABLED` | boolean | `true` | Enable or disable the position monitoring service. |
| `POSITION_MONITOR_INTERVAL_MS` | integer | `15000` | How often to check positions (default: 15 seconds). |

### Trailing Stop

| Variable | Type | Default | Description |
|---|---|---|---|
| `TRAILING_STOP_ENABLED` | boolean | `true` | Enable or disable trailing stop logic. |
| `TRAILING_STOP_DISTANCE_PCT` | number | `1.5` | Trailing stop distance as a percentage from the high-water mark. |

### Market Data Controls

| Variable | Type | Default | Description |
|---|---|---|---|
| `ALLOW_SYNTHETIC_MARKET_FALLBACK` | boolean | `true` | Allow synthetic/fallback data when real-time data is unavailable. **Disable for production live trading.** |
| `REQUIRE_REALTIME_MARKET_DATA` | boolean | `false` | When `true`, block execution if market data is not real-time. Recommended for production. |
| `MARKET_TICKER_STALE_MS` | integer | `15000` | Ticker data is considered stale after this many milliseconds. |
| `MARKET_ORDERBOOK_STALE_MS` | integer | `15000` | Order book data is considered stale after this many milliseconds. |
| `MARKET_REST_REFRESH_MS` | integer | `10000` | REST API refresh interval for market data. |
| `MARKET_CANDLE_REFRESH_MS` | integer | `30000` | Candle data refresh interval. |
| `OKX_ACCOUNT_CACHE_TTL_MS` | integer | `5000` | TTL for OKX account data cache. |
| `OKX_ACCOUNT_STALE_FALLBACK_MS` | integer | `120000` | Time before stale OKX account data triggers a fallback refresh. |
| `SWARM_DIAGNOSTIC_VOTE_TIMEOUT_MS` | integer | `8000` | Timeout for swarm diagnostic votes. |

### Security and Observability

| Variable | Type | Default | Description |
|---|---|---|---|
| `CRON_SECRET` | string | — | Secret token for authenticating cron worker requests. **Generate a long random string for production.** |
| `APP_URL` | URL | `http://localhost:3000` | Server-side application URL. |
| `NEXT_PUBLIC_APP_URL` | URL | `http://localhost:3000` | Client-side application URL (exposed to the browser). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL | `http://otel-collector:4317` | OTLP endpoint used by the Next.js app for logs, metrics, and traces. |
| `OTEL_SERVICE_NAME` | string | `ai-trading-swarm` | OpenTelemetry service name reported to the collector. |
| `GF_SECURITY_ADMIN_PASSWORD` | string | — | Grafana admin password for the pre-provisioned dashboard instance. |

### MinIO Object Storage

| Variable | Type | Default | Description |
|---|---|---|---|
| `MINIO_ENDPOINT` | URL | `http://minio:9000` | S3-compatible MinIO endpoint used for archival objects. |
| `MINIO_ACCESS_KEY` | string | — | MinIO access key used by the application. |
| `MINIO_SECRET_KEY` | string | — | MinIO secret key used by the application. |
| `MINIO_BUCKET_TELEMETRY` | string | `telemetry` | Bucket that stores NDJSON telemetry archive batches. |
| `MINIO_BUCKET_BACKUPS` | string | `backups` | Bucket reserved for backups and exports. |
| `MINIO_BUCKET_MARKET_DATA` | string | `market-data` | Bucket reserved for future market data snapshots and exports. |

---

## Running with Docker Compose

The `docker-compose.yml` defines a single-node production stack:

| Service | Image | Port | Description |
|---|---|---|---|
| **postgres** | `pgvector/pgvector:pg16` | 5432 (internal) | PostgreSQL 16 with `pgvector` enabled for transactional data and swarm memory embeddings. |
| **redis** | `redis:8.6-alpine` | 6379 (internal) | Cache, coordination, and queue storage. |
| **minio** | `minio/minio:latest` | 9000 (internal), 9001 (host) | S3-compatible object storage for archival telemetry and backups. |
| **otel-collector** | `otel/opentelemetry-collector-contrib:latest` | 4317, 4318 (internal) | OTLP ingestion and fan-out to Prometheus, Loki, and Jaeger. |
| **prometheus** | `prom/prometheus:latest` | 9090 (internal) | Metrics storage with remote-write receiver enabled. |
| **loki** | `grafana/loki:latest` | 3100 (internal) | Centralized log storage. |
| **jaeger** | `jaegertracing/all-in-one:latest` | 16686 (host) | Trace storage and inspection UI. |
| **grafana** | `grafana/grafana-oss:latest` | 3001 (host) | Pre-provisioned dashboards for metrics, logs, and traces. |
| **app** | Custom Dockerfile | 3000 (internal) | Next.js production server with Drizzle migrations on startup. |
| **nginx** | `nginx:alpine` | 8080, 8443 (host defaults) -> 80, 443 (container) | Reverse proxy for the app plus observability UIs. |
| **cron** | Custom Alpine | — | Lightweight cron container that triggers the autonomy worker every minute. |

### Startup

```bash
docker compose up --build -d
```

For managed platforms such as Dokploy, point the public domain at the `nginx` service's container port `80` instead of publishing host port `80` from this stack.

### Viewing Logs

```bash
docker compose logs -f app
docker compose logs -f redis
docker compose logs -f cron
```

### Stopping

```bash
docker compose down
```

### Data Persistence

- **PostgreSQL:** Named volume `postgres-data` stores relational state and pgvector data.
- **Redis:** Named volume `redis-data` stores cache and queue data with AOF persistence enabled.
- **MinIO:** Named volume `minio-data` stores object archives and backups.
- **Observability:** Prometheus, Loki, Grafana, and Jaeger each use dedicated named volumes.

---

## Running Locally (Development)

### 1. Start Redis

Ensure a Redis server is running on the configured `REDIS_URL`:

```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:8-alpine redis-server --appendonly yes

# Or install Redis locally
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your credentials
```

### 4. Run Migrations

```bash
pnpm dlx drizzle-kit migrate
```

### 5. Start Development Server

```bash
pnpm dev
```

The app runs at `http://localhost:3000`.

### Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js development server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run Biome linter checks |
| `pnpm format` | Auto-format code with Biome |

---

## Database Migrations

The project uses [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL. Schema files live in `src/db/schema/`.

### Generate a Migration

After modifying the schema in `src/db/schema/`:

```bash
pnpm dlx drizzle-kit generate
```

### Apply Migrations

```bash
pnpm dlx drizzle-kit migrate
```

### Inspect the Database

```bash
pnpm dlx drizzle-kit studio
```

---

## Linting and Formatting

The project uses [Biome](https://biomejs.dev/) for linting and formatting (not ESLint/Prettier).

```bash
pnpm lint          # Check for issues
pnpm format        # Auto-fix formatting
```

Configuration is in `biome.json` at the project root.

---

## Project Structure

```text
src/
├── app/                          # Next.js App Router
│   ├── api/ai/                   # API routes
│   │   ├── market/              #   Market data endpoints
│   │   ├── memory/              #   AI memory / context endpoints
│   │   ├── swarm/               #   Swarm orchestration endpoints
│   │   ├── system/              #   System status & autonomy worker
│   │   └── trade/               #   Trade execution endpoints
│   ├── telemetry/               # Telemetry dashboard page
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Main dashboard page
│   └── globals.css              # Global styles
├── components/ui/                # Shared UI components (shadcn/ui)
├── db/
│   ├── schema/                  # Drizzle table definitions
│   ├── migrations/              # Generated migration files
│   └── index.ts                 # Database client
├── env.ts                        # Validated environment configuration
├── features/dashboard/          # Dashboard feature module
│   ├── components/              #   Dashboard UI components
│   ├── hooks/                   #   Dashboard-specific hooks
│   └── dashboard-context.tsx    #   Dashboard state provider
├── hooks/                        # Shared React hooks
├── lib/
│   ├── agents/                  # Base agent abstractions
│   ├── ai/                      # Ollama integration (optional LLM overlay)
│   ├── api/                      # Internal API helpers
│   ├── autonomy/                # Autonomous trading loop & service
│   ├── configs/                 # Configuration modules
│   ├── market-data/             # Market data service (REST + WS)
│   ├── memory/                  # Aging memory for context
│   ├── observability/           # Observability utilities
│   ├── okx/                     # OKX REST & WebSocket clients
│   ├── persistence/             # Trade history, execution intents, autonomy state
│   ├── prompts/                 # System prompts for LLM agents
│   ├── redis/                   # Redis client, rate limiter, swarm cache
│   ├── replay/                  # Replay / simulation utilities
│   ├── schemas/                 # Zod validation schemas
│   ├── store/                   # Client-side state stores
│   ├── swarm/                   # Decision engine, consensus, validators, trailing stop
│   └── telemetry/               # Telemetry core (metrics, logs, traces)
├── scripts/                     # CLI scripts (e.g., replay)
├── instrumentation.ts           # Next.js edge instrumentation
└── instrumentation.node.ts      # Node.js instrumentation (telemetry + autonomy bootstrap)

docs/
├── autonomous-trading-audit-and-rebuild.md
└── telemetry-architecture.md
```

---

## Key Concepts

### Decision Engine

The core of the system is a **deterministic decision engine** (in `src/lib/swarm/`) that replaces end-to-end LLM voting on the critical execution path. It computes a composite score from:

- **Directional edge** — short-horizon returns, candle structure, breakout detection
- **Execution quality** — spread, slippage proxies, order-book pressure
- **Risk penalty** — volatility, inventory concentration, budget limits
- **Net edge** — expected value after fees and slippage

Output is one of: `BUY`, `SELL`, or `HOLD`. Spot semantics enforce inventory awareness — `BUY` adds inventory, `SELL` only reduces existing inventory.

### Autonomy Loop

The autonomy service (`src/lib/autonomy/service.ts`) runs a configurable loop:

1. **Snapshot** — Gather real-time market data, account state, and positions.
2. **Evaluate candidates** — Score and rank eligible symbols.
3. **Decision** — Run the deterministic engine on the best candidate.
4. **Validate** — Apply threshold gates (confidence, market quality, net edge, budget, daily limits, cooldown).
5. **Execute** — Place the order via OKX API if all gates pass.
6. **Persist** — Record decision snapshots, execution intents, and outcomes.

The loop runs every `AUTONOMOUS_INTERVAL_MS` (default: 60 seconds) and respects a post-trade cooldown of `AUTONOMOUS_COOLDOWN_MS` (default: 120 seconds).

### Swarm Intelligence

The swarm modules (`src/lib/swarm/`) provide:

- **Consensus** — Aggregates multiple signal sources (deprecated for primary path, retained for diagnostics).
- **Validator** — Enforces threshold gates and execution eligibility.
- **Auto-execute** — Handles order placement with duplicate suppression.
- **Position monitor** — Tracks open positions and triggers trailing stops.
- **Trailing stop** — Implements configurable trailing stop loss.

### Market Data Pipeline

Market data (`src/lib/market-data/service.ts` + `src/lib/okx/`) combines:

- **WebSocket** streams for real-time tickers and order books.
- **REST** polling as a fallback with configurable staleness thresholds.
- **Synthetic fallback** — When real data is unavailable, synthetic data may be generated (controlled by `ALLOW_SYNTHETIC_MARKET_FALLBACK`).

> For production trading, set `REQUIRE_REALTIME_MARKET_DATA=true` and `ALLOW_SYNTHETIC_MARKET_FALLBACK=false`.

### Telemetry

The observability stack is now OpenTelemetry-native:

- **Metrics** — OTLP metrics are exported to the OpenTelemetry Collector, then forwarded to Prometheus.
- **Logs** — Application logs flow through OTLP to Loki and are also archived to MinIO as NDJSON batches.
- **Traces** — Request and autonomy spans flow through OTLP to Jaeger.
- **Dashboards** — Grafana is pre-provisioned with Prometheus, Loki, and Jaeger datasources.
- **Operator page** — `/telemetry` is now a navigation hub for Grafana and Jaeger rather than a bespoke metrics UI.

See `docs/telemetry-architecture.md` for full details.

---

## API Routes

| Route | Purpose |
|---|---|
| `/api/ai/market/*` | Market data retrieval and analysis |
| `/api/ai/memory/*` | AI memory and context management |
| `/api/ai/swarm/*` | Swarm diagnostics and orchestration |
| `/api/ai/system/*` | System status, autonomy worker endpoint |
| `/api/ai/trade/*` | Trade execution and order management |
| `/telemetry` | Operator landing page linking to Grafana and Jaeger |

---

## Cron Worker

The cron container triggers the autonomy worker every minute. It sends an authenticated POST request to the app service:

```text
POST http://app:3000/api/ai/system/autonomy/worker
Authorization: Bearer <CRON_SECRET>
```

The crontab is defined in `crontab`:

```crontab
* * * * * . /etc/environment && curl -s -X POST $WORKER_URL -H "Authorization: Bearer $CRON_SECRET" >> /var/log/worker.log 2>&1
```

> **Important:** Set `CRON_SECRET` to a long random string in production to prevent unauthorized worker invocation.

---

## Color Schemes

The dashboard supports six terminal color schemes selectable from the desktop UI:

| Scheme | Accent Color |
|---|---|
| Phosphor | Green |
| Arctic | Cyan |
| Amber | Gold |
| Crimson | Red |
| Matrix | Green |
| Synthwave | Primary/Purple |

---

## Security Notes

- **Never commit `.env` files.** The `.gitignore` excludes all `.env*` files except `.env.example` and `.env.local.example`.
- **OKX API keys** should have the minimum required permissions (Read + Trade). Bind keys to specific IP addresses.
- **`CRON_SECRET`** must be a strong random string in production to prevent unauthorized triggering of the autonomy worker.
- **PostgreSQL, MinIO, and Grafana passwords** should all be long random values and must stay out of version control.
- Set `OKX_ACCOUNT_MODE=paper` for testing. Only switch to `live` after thorough validation.
- For production trading, enforce `REQUIRE_REALTIME_MARKET_DATA=true` and `ALLOW_SYNTHETIC_MARKET_FALLBACK=false`.
- Keep MinIO console and Jaeger UI firewalled in public deployments, or proxy them behind authenticated nginx routes.
