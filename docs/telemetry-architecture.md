# Telemetry Architecture

This document outlines the integration of telemetry into the autonomous trading platform.

## Overview

Telemetry provides observability into the trading system's behavior, performance, and decision-making processes. All tools used are free, open source, and self-hosted - no external services, API keys, or paid tools required.

## Implementation Note

The codebase implementation now uses a dependency-free local telemetry core in `src/lib/telemetry/server.ts` rather than the draft `prom-client` / `pino` / `@opentelemetry/sdk-node` stack described below.

That implementation persists structured logs and spans to `.data/telemetry/*.ndjson`, exposes Prometheus-compatible metrics at `/api/telemetry/metrics`, exposes recent logs and traces at `/api/telemetry/logs` and `/api/telemetry/traces`, and provides an operator dashboard at `/telemetry`.

The current telemetry is instrumented around the actual execution bottlenecks in this repo:

- `src/lib/autonomy/service.ts`
- `src/lib/swarm/autoExecute.ts`
- `src/lib/swarm/orchestrator.ts`
- `src/lib/swarm/pipeline.ts`
- `src/lib/market-data/service.ts`
- `src/lib/okx/client.ts`
- `src/lib/okx/ws-client.ts`
- `src/app/api/ai/trade/execute/route.ts`

## Telemetry Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| Metrics | prom-client | Collect and expose metrics via HTTP |
| Tracing | @opentelemetry/sdk-node | Distributed tracing |
| Logging | pino + pino-http | Structured logging to file + HTTP request logging |
| Dashboard | Built-in Next.js page | View metrics and traces locally |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ Metrics│  │ Traces  │  │  Logs   │                     │
│  └────┬────┘  └────┬────┘  └────┬────┘                     │
│       │            │            │                           │
│  /metrics    console.log   logs/                           │
└─────────────────────────────────────────────────────────────┘
         │                │            │
         ▼                ▼            ▼
    ┌─────────────────────────────────────────┐
    │         Internal Dashboard             │
    │           /telemetry                     │
    └─────────────────────────────────────────┘
```

All data stays local - no external services needed.

## Implementation

### 1. Install Dependencies

```bash
pnpm add prom-client pino pino-http @opentelemetry/sdk-node \
  @opentelemetry/api @opentelemetry/auto-instrumentations-node \
  @opentelemetry/sdk-trace-base
```

### 2. Create Telemetry Module

Create `src/lib/telemetry/index.ts`:

```typescript
import pino from 'pino';
import pinoHttp from 'pino-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { trace, meter, SpanStatusCode, Span } from '@opentelemetry/api';

export const logger = pino({
  level: 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 'logs/telemetry.json' },
  },
});

const sdk = new NodeSDK({
  spanProcessor: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

export function initTelemetry() {
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown().catch(console.error));
}

export const tracer = trace.getTracer('okx-trading');
export const metrics = meter.getMeter('okx-trading');

export async function createSpan<T>(
  name: string,
  attributes: Record<string, string>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export const TRADING_COUNTER = metrics.createCounter('trading_operations_total', {
  description: 'Total trading operations',
});

export const ORDER_LATENCY = metrics.createHistogram('order_latency_ms', {
  description: 'Order execution latency in milliseconds',
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
});

export const DECISION_COUNTER = metrics.createCounter('swarm_decisions_total', {
  description: 'Total swarm decisions',
});

export const CONSENSUS_DURATION = metrics.createHistogram('consensus_duration_ms', {
  description: 'Consensus calculation duration',
});

export const ACTIVE_AGENTS = metrics.createGauge('active_agents', {
  description: 'Number of active agents',
});

export const WEBSOCKET_CONNECTIONS = metrics.createGauge('websocket_connections', {
  description: 'Active WebSocket connections',
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: ['/api/telemetry'],
  },
});
```

### 3. Create Metrics Endpoint

Create `src/app/api/telemetry/metrics/route.ts`:

```typescript
import { Registry, collectDefaultMetrics } from 'prom-client';
import { NextResponse } from 'next/server';

const register = new Registry();
collectDefaultMetrics({ register });

export async function GET() {
  const metrics = await register.contentType;
  return new NextResponse(await register.metrics(), {
    headers: { 'Content-Type': metrics },
  });
}
```

### 4. Create Logs Endpoint

Create `src/app/api/telemetry/logs/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', 'telemetry.json');

export async function GET() {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean).slice(-100);
    const logs = lines.map((l) => JSON.parse(l));
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json([]);
  }
}
```

### 5. Create Telemetry Dashboard

Create `src/app/telemetry/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

interface Metric { name: string; value: number }
interface LogEntry { timestamp: string; level: string; message: string; [key: string]: unknown }

export default function TelemetryDashboard() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    fetch('/api/telemetry/metrics')
      .then((r) => r.text())
      .then((text) => {
        const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
        setMetrics(lines.map((l) => {
          const [name, value] = l.split(' ');
          return { name, value: parseFloat(value) || 0 };
        }));
      });

    fetch('/api/telemetry/logs').then((r) => r.json()).then(setLogs);
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Telemetry Dashboard</h1>
      
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Metrics</h2>
        <table className="w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Name</th>
              <th className="border p-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.name}>
                <td className="border p-2">{m.name}</td>
                <td className="border p-2">{m.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Recent Logs</h2>
        <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm max-h-96 overflow-auto">
          {logs.map((log, i) => (
            <div key={i}>
              {log.timestamp} [{log.level}] {log.message}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

### 6. Update Instrumentation

Update `src/instrumentation.ts`:

```typescript
import { initTelemetry, logger, httpLogger } from './lib/telemetry';

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  initTelemetry();
  logger.info('Telemetry initialized');

  const { ensureAutonomyBootState } = await import("./lib/autonomy/service");
  await ensureAutonomyBootState();
}
```

### 7. Integrate HTTP Logger Middleware

Add to your API route handlers or a middleware file:

```typescript
import { httpLogger } from './lib/telemetry';

export default function handler(req, res) {
  httpLogger(req, res);
  // ... your route handler
}
```

## Tracked Metrics

### Trading Operations
| Metric | Type | Description |
|--------|------|-------------|
| `orders_submitted_total` | Counter | Total orders submitted |
| `orders_filled_total` | Counter | Orders successfully filled |
| `orders_rejected_total` | Counter | Orders rejected |
| `order_latency_ms` | Histogram | Order execution time |

### Swarm Intelligence
| Metric | Type | Description |
|--------|------|-------------|
| `swarm_decisions_total` | Counter | Total decisions made |
| `consensus_duration_ms` | Histogram | Time to reach consensus |
| `active_agents` | Gauge | Active agents |
| `proposal_rejections_total` | Counter | Rejected proposals |

### System
| Metric | Type | Description |
|--------|------|-------------|
| `nodejs_memory_usage_bytes` | Gauge | Memory consumption |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag |
| `websocket_connections` | Gauge | WebSocket connections |

## Custom Spans

### Order Execution
```typescript
import { createSpan, logger } from './lib/telemetry';

async function submitOrder(order: Order) {
  return createSpan('submit_order', { orderId: order.id, symbol: order.symbol }, async (span) => {
    const result = await executeOrder(order);
    span.setAttribute('result', result.status);
    logger.info('Order submitted', { orderId: order.id, status: result.status });
    return result;
  });
}
```

### Consensus
```typescript
import { createSpan, CONSENSUS_DURATION, logger } from './lib/telemetry';

async function calculateConsensus(agents: Agent[]) {
  return createSpan('consensus', { agentCount: String(agents.length) }, async (span) => {
    const start = Date.now();
    const result = await runConsensus(agents);
    CONSENSUS_DURATION.record(Date.now() - start);
    span.setAttribute('agreed', String(result.agreed));
    logger.info('Consensus reached', { agreed: result.agreed, duration: Date.now() - start });
    return result;
  });
}
```

## Logs Output

Logs are written to `logs/telemetry.json`:

```json
{"level":"info","message":"Order submitted","orderId":"abc123","status":"filled","timestamp":"2024-01-15T10:30:00.000Z"}
{"level":"info","message":"Consensus reached","agreed":true,"duration":45,"timestamp":"2024-01-15T10:30:01.000Z"}
```

## Viewing Telemetry

1. **Metrics** - Visit `/api/telemetry/metrics` for Prometheus-compatible output
2. **Dashboard** - Visit `/telemetry` for web UI with metrics and logs
3. **Logs** - Check `logs/telemetry.json` file

## Integration Points

| Module | Integration |
|--------|-------------|
| `src/lib/okx/orders.ts` | Add metrics to order operations |
| `src/lib/swarm/consensus.ts` | Add tracing to consensus |
| `src/lib/swarm/validator.ts` | Add tracing to validation |
| `src/lib/api/client.ts` | Add tracing to API calls |
| `src/lib/okx/ws-client.ts` | Add metrics for WebSocket |

## Next Steps

1. Add telemetry package dependencies
2. Create `src/lib/telemetry/index.ts` module
3. Add metrics endpoint `/api/telemetry/metrics`
4. Add logs endpoint `/api/telemetry/logs`
5. Create dashboard at `/telemetry`
6. Integrate tracing and metrics into trading code
