# High-Level Trading Future Implementation Plan

## Purpose
This document captures the remaining high-level trading work that is not fully implemented in the current codebase, explains why each item matters, and proposes an implementation order that fits the repo as it exists on 2026-04-25.

The system already has:
- a deterministic decision engine
- autonomy with dynamic symbol selection
- guarded execution with duplicate suppression, circuit breakers, and execution intents
- persistence for decisions, trades, and outcome windows
- a basic replay utility

The next step is not another broad rewrite. It is targeted hardening around attribution, replay validation, allocator quality, and tests.

## Completed Recently: Explicit Synthetic Fallback Provenance

This repo now carries feed provenance from `src/lib/okx/market.ts` into `src/lib/market-data/service.ts` so ticker, order-book, and candle sources can be marked individually. Synthetic-backed snapshots are now surfaced as synthetic in `MarketFeedStatus`, which means live autonomy and live execution can reject them consistently instead of relying on incomplete aggregate status.

That closes the highest-risk gap from the audit. The next priority is no longer provenance plumbing. It is turning the stored outcomes into something we can actually learn from and validate against.

## Priority 1: Build Outcome-Based Attribution And Learning

### Why this matters
The repo already stores trade decisions, execution intents, outcome windows, realized slippage, and mark-to-market performance. What it still does not do well is answer the economic questions we actually care about:
- Which regimes are making money?
- Which engines are over-predicting edge?
- Which blocked trades would have been profitable?
- Which allocation choices are starving better opportunities?

Without attribution, the system records activity but does not really learn from outcomes.

### What to implement
1. Add a first-class attribution model for:
   - realized alpha
   - unrealized alpha
   - missed-trade alpha
   - slippage drag
   - allocation drag
2. Persist threshold snapshots used at decision time so later analysis can explain exact gating.
3. Extend memory and reliability weighting to prefer realized economic outcomes over blocked-history summaries.
4. Add symbol-level and regime-level scorecards for expected edge versus actual realized edge.

### Suggested code areas
- `src/lib/persistence/history.ts`
- `src/db/schema/outcome-windows.ts`
- `src/types/history.ts`
- `src/lib/swarm/reliability.ts`
- `src/lib/memory/aging-memory.ts`
- `src/app/api/ai/system/performance/route.ts`

### Acceptance criteria
- We can explain executed, blocked, and missed opportunity performance by regime and engine.
- Reliability weighting can use realized outcome quality rather than mostly blocked-history behavior.
- Strategy review can separate signal quality from execution quality and allocation quality.

## Priority 2: Turn Replay Into A Real Validation Gate

### Why this matters
There is already a useful start in `src/lib/replay/engine.ts` and `src/scripts/replay.ts`, but it is still a developer utility. That is not enough for unattended live trading. We need a reproducible validation workflow that catches regressions before they reach real funds.

### What to implement
1. Define canonical replay datasets with candles, order books, account state, and market-status metadata.
2. Add walk-forward evaluation rather than single-pass replay only.
3. Add fee and slippage sensitivity sweeps.
4. Add low-volatility chop scenarios and degraded-market scenarios.
5. Fail CI or release promotion when replay metrics breach guardrails.

### Suggested code areas
- `src/lib/replay/engine.ts`
- `src/lib/replay/metrics.ts`
- `src/lib/replay/types.ts`
- `src/scripts/replay.ts`
- CI workflow files when introduced

### Acceptance criteria
- Every engine change can be replayed against the same reference datasets.
- We can compare current branch metrics versus baseline metrics.
- Live rollout is blocked when replay metrics regress past predefined thresholds.

## Priority 3: Upgrade Portfolio Allocation From Guardrails To Allocation Logic

### Why this matters
The current portfolio logic already respects budget caps, concentration, and live inventory. That is solid risk plumbing. It is not yet a full capital allocator. A stronger allocator would improve high-level trading quality even if the signal engine stayed unchanged.

### What to implement
1. Add cross-symbol capital rotation based on realized performance and current expected edge.
2. Penalize symbols whose realized edge prediction error remains persistently poor.
3. Add correlation-aware or quote-bucket-aware exposure limits.
4. Reserve budget for open-position defense and exits rather than only new entries.
5. Track portfolio opportunity cost when one symbol consumes scarce budget.

### Suggested code areas
- `src/lib/autonomy/portfolio.ts`
- `src/lib/autonomy/service.ts`
- `src/types/portfolio.ts`
- `src/lib/persistence/history.ts`

### Acceptance criteria
- Symbol ranking reflects both current opportunity and portfolio opportunity cost.
- Allocation is not just a max-cap check; it actively decides where capital should rotate next.
- Operators can inspect why one candidate got budget and another did not.

## Priority 4: Add Automated Test Coverage Around The Trading Core

### Why this matters
The trading core is now deterministic enough to test well, but the repo has essentially no dedicated test suite. That is the main reason regressions can still slip through quietly.

### What to implement
1. Unit tests for:
   - decision feature calculations
   - deterministic score composition
   - threshold gating
   - inventory-aware `SELL` handling
   - execution sizing
2. Integration tests for:
   - autonomy candidate selection
   - execution-intent lifecycle
   - stale and degraded market rejection
   - spot inventory lifecycle
3. Safety tests for:
   - duplicate execution prevention
   - circuit breaker open and recovery behavior
   - stale lease recovery
   - budget exhaustion

### Suggested code areas
- `src/lib/swarm/*`
- `src/lib/autonomy/*`
- `src/lib/market-data/*`
- `src/lib/persistence/*`
- `src/lib/replay/*`

### Acceptance criteria
- Deterministic engine changes fail fast when math or guardrails drift.
- Core live-trading regressions are caught before manual QA.
- Replay and test coverage reinforce each other instead of existing as separate islands.

## Recommended Delivery Order
1. Outcome attribution expansion
2. Replay dataset plus walk-forward validation
3. Core trading test suite
4. Portfolio allocator upgrade

This updated order reflects the fact that live-risk provenance hardening is already done, so the next bottleneck is learning and validation quality.

## Non-Goals For The Next Iteration
- Reintroducing LLM voting into the execution-critical path
- Broad UI redesign work unrelated to trading safety or observability
- Expanding into shorting or synthetic inverse exposure before the spot path is fully validated
- Adding more strategy engines before attribution and replay gates are strong

## Definition Of Done For The Next Major Trading Milestone
The next major trading milestone should be considered complete only when:
- replay is reproducible and blocks bad releases
- outcome attribution explains actual trading performance by engine and regime
- allocator choices are inspectable and economically grounded
- deterministic trading logic has automated unit and integration coverage
