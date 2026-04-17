# Telemetry Architecture

This document describes the current telemetry implementation for the autonomous
trading platform.

## Overview

Telemetry is implemented with a local, dependency-free core in
`src/lib/telemetry/server.ts`.

The current implementation:

- records structured events and spans in memory and on disk
- exposes Prometheus-compatible metrics
- surfaces recent logs, traces, and execution history through protected API
  routes
- provides an operator dashboard at `/telemetry`
- keeps telemetry best-effort so trading and autonomy can still boot if local
  persistence is unavailable

## Current Implementation

| Category | Implementation | Notes |
| --- | --- | --- |
| Metrics | In-process counters, gauges, and histograms | Exported through `getPrometheusMetrics()` |
| Logs | Structured event records | Buffered in memory and persisted to `.data/telemetry/events.ndjson` |
| Traces | Lightweight spans with async context propagation | Buffered in memory and persisted to `.data/telemetry/spans.ndjson` |
| Persistence | Rotated NDJSON files | Current file plus retained rotations |
| APIs | `/api/telemetry/metrics`, `/logs`, `/traces`, `/summary` | Protected by bearer auth |
| UI | `/telemetry` | Operator dashboard for recent state and blockers |

## Architecture

```text
+----------------------------- Application -----------------------------+
|                                                                      |
|  autonomy/service.ts      swarm/autoExecute.ts      swarm/orchestrator.ts
|  market-data/service.ts   okx/client.ts             api/trade/execute |
|                                                                      |
+-------------------------------+--------------------------------------+
                                |
                                v
                    +---------------------------+
                    | telemetry/server.ts       |
                    | - spans                   |
                    | - events                  |
                    | - metrics                 |
                    | - async trace context     |
                    | - file rotation / tail    |
                    +------------+--------------+
                                 |
               +-----------------+------------------+
               |                                    |
               v                                    v
    .data/telemetry/*.ndjson            /api/telemetry/*
               |                                    |
               +-----------------+------------------+
                                 |
                                 v
                          /telemetry dashboard
```

## Integration Points

| Module | Coverage |
| --- | --- |
| `src/instrumentation.node.ts` | Telemetry bootstrap and fail-open startup |
| `src/lib/autonomy/service.ts` | Scheduler, candidate evaluation, worker lease, blocker state |
| `src/lib/swarm/autoExecute.ts` | Execution attempts, duplicate suppression, hold/error reasons |
| `src/lib/swarm/orchestrator.ts` | Swarm runtime and executable decision tracking |
| `src/lib/market-data/service.ts` | Snapshot health, realtime/degraded state, refresh errors |
| `src/lib/okx/client.ts` | OKX request latency, success/error counters, request spans |
| `src/lib/okx/ws-client.ts` | WebSocket connection and parse/error counters |
| `src/app/api/ai/trade/execute/route.ts` | Trade execution request validation, latency, outcomes |

## Tracked Metrics

### Runtime

| Metric | Type | Description |
| --- | --- | --- |
| `telemetry_initialized` | Gauge | Telemetry bootstrap state |
| `telemetry_span_duration_ms` | Histogram | Duration of local telemetry spans |
| `nodejs_heap_used_bytes` | Gauge | Current heap usage |
| `nodejs_heap_total_bytes` | Gauge | Current heap allocation |
| `nodejs_rss_bytes` | Gauge | Resident set size |
| `nodejs_external_memory_bytes` | Gauge | External memory usage |
| `nodejs_eventloop_lag_seconds` | Gauge | Mean event loop lag |
| `nodejs_eventloop_lag_max_seconds` | Gauge | Max event loop lag |
| `nodejs_uptime_seconds` | Gauge | Process uptime |
| `next_request_errors_total` | Counter | Next.js request errors captured by instrumentation |

### Autonomy and Execution

| Metric | Type | Description |
| --- | --- | --- |
| `autonomy_scheduler_active` | Gauge | Whether the autonomy scheduler loop is active |
| `autonomy_scheduler_errors_total` | Counter | Scheduler dispatch failures |
| `autonomy_running` | Gauge | Whether autonomy is marked as running |
| `autonomy_inflight` | Gauge | Whether a worker lease is currently active |
| `autonomy_candidate_evaluations_total` | Counter | Candidate evaluations by timeframe/decision/blocked |
| `autonomy_worker_skips_total` | Counter | Worker dispatches skipped due to guards or lease state |
| `autonomy_worker_runs_total` | Counter | Completed worker runs |
| `autonomy_worker_errors_total` | Counter | Worker failures |
| `autonomy_worker_duration_ms` | Histogram | Worker runtime |
| `swarm_runs_total` | Counter | Swarm orchestration runs |
| `swarm_run_duration_ms` | Histogram | Swarm orchestration latency |
| `auto_execution_attempts_total` | Counter | Execution attempts from autonomy |
| `auto_execution_results_total` | Counter | Final execution outcomes |
| `auto_execution_errors_total` | Counter | Execution-layer failures that trip the circuit breaker |
| `auto_execution_duration_ms` | Histogram | Execution attempt latency |
| `trade_execute_requests_total` | Counter | `/api/ai/trade/execute` request outcomes |
| `trade_execute_duration_ms` | Histogram | `/api/ai/trade/execute` latency |

### Market Data and Exchange

| Metric | Type | Description |
| --- | --- | --- |
| `market_data_tradeable` | Gauge | Whether a symbol/timeframe is currently tradeable |
| `market_data_realtime` | Gauge | Whether websocket market data is currently realtime |
| `market_data_stale` | Gauge | Whether market data is stale |
| `market_refresh_errors_total` | Counter | Market refresh failures |
| `market_snapshots_total` | Counter | Snapshot requests by status/source |
| `market_snapshot_duration_ms` | Histogram | Snapshot collection latency |
| `okx_request_duration_ms` | Histogram | OKX HTTP request latency |
| `okx_requests_total` | Counter | OKX HTTP request outcomes |
| `okx_ws_connections_total` | Counter | WebSocket connect events |
| `okx_ws_disconnects_total` | Counter | WebSocket disconnect events |
| `okx_ws_errors_total` | Counter | WebSocket runtime errors |
| `okx_ws_parse_errors_total` | Counter | WebSocket payload parse failures |

## Operator Access

Telemetry APIs are protected with bearer auth.

- preferred token: `TELEMETRY_TOKEN`
- fallback token: `CRON_SECRET`
- protected routes: `/api/telemetry/metrics`, `/api/telemetry/logs`,
  `/api/telemetry/traces`, `/api/telemetry/summary`

The `/telemetry` page uses the same bearer token to load the protected API
routes.

## Persistence Notes

- events and spans are written to `.data/telemetry/`
- telemetry files are rotated instead of growing without bound
- telemetry readers tail the newest records from rotated files rather than
  loading entire files into memory
- if directory creation or file writes fail, telemetry continues in memory and
  the trading runtime stays available
