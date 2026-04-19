# Observability Architecture

This document describes the current observability stack for the autonomous
trading platform after the v2 infrastructure migration.

## Overview

The application now emits logs, metrics, and traces through OpenTelemetry from
`src/lib/observability/telemetry.ts`.

The current implementation:

- exports traces, metrics, and logs to the OpenTelemetry Collector via OTLP
- forwards metrics to Prometheus, logs to Loki, and traces to Jaeger
- provisions Grafana with Prometheus, Loki, and Jaeger datasources
- archives application log batches to MinIO as NDJSON objects
- keeps observability best-effort so trading and autonomy can still boot if the
  collector or object storage is temporarily unavailable

## Stack

| Category | Implementation | Notes |
| --- | --- | --- |
| Metrics | OpenTelemetry metrics | Exported over OTLP to the collector, then remote-written to Prometheus |
| Logs | OpenTelemetry logs + MinIO archive | Sent to Loki and archived to `telemetry/events/<date>/<hour>/...ndjson` |
| Traces | OpenTelemetry traces | Sent to Jaeger through the collector |
| Collector | `otel/opentelemetry-collector-contrib` | Central OTLP ingestion and routing |
| Dashboards | Grafana | Pre-provisioned datasources and starter dashboards |
| Operator UI | `/telemetry` | Landing page that links operators to Grafana and Jaeger |

## Architecture

```text
+------------------------------ Application -----------------------------+
|                                                                       |
|  autonomy/service.ts      swarm/autoExecute.ts      swarm/orchestrator.ts
|  market-data/service.ts   okx/client.ts             api/trade/execute |
|                                                                       |
+-------------------------------+---------------------------------------+
                                |
                                v
                    +-----------------------------+
                    | observability/telemetry.ts  |
                    | - OTEL logs                 |
                    | - OTEL metrics              |
                    | - OTEL traces               |
                    | - MinIO NDJSON archival     |
                    +-------------+---------------+
                                  |
                                  v
                    +-----------------------------+
                    | OpenTelemetry Collector     |
                    | - OTLP gRPC / HTTP          |
                    | - batching / routing        |
                    +------+------+---------------+
                           |      |
               +-----------+      +-----------+
               |                              |
               v                              v
         Prometheus                        Loki
               |                              |
               +-----------+      +-----------+
                           |      |
                           v      v
                         Grafana  Jaeger
```

## Operational Notes

- Metrics, logs, and traces no longer use bespoke `/api/telemetry/*` routes.
- MinIO archival is best-effort and should not block trading paths.
- Grafana is exposed on host port `3001`, Jaeger on `16686`, and the MinIO
  console on `9001`.
- Public deployments should protect observability surfaces behind nginx auth or
  network controls.
