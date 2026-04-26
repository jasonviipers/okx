# Autonomous Trading Audit And Rebuild

## Implementation Status Checklist
Audit date: 2026-04-25

Checked items are materially implemented in the current codebase. Unchecked items are missing, only partially implemented, or implemented in a way that still leaves a meaningful gap for live trading.

Audit scope used for this checklist:
- `src/lib/swarm/*`
- `src/lib/autonomy/*`
- `src/lib/market-data/*`
- `src/lib/okx/*`
- `src/lib/persistence/*`
- `src/lib/replay/*`
- `src/app/api/ai/swarm/*`
- `src/app/api/ai/system/*`
- `src/app/api/ai/trade/*`
- `src/types/*`

### Phase 1: Immediate stabilization
- [x] Require realtime market data for live execution and block live execution on degraded snapshots.
- [x] Surface structured rejection reasons instead of relying only on free-text block messages.
- [x] Keep raw directional scoring separate from final decision and execution eligibility.
- [x] Expose autonomy candidate ranking inputs and last rejection reasons in runtime status.
- [x] Tighten stream, history, and execution observability so operators can inspect why a trade was not placed.

### Target trading algorithm
- [x] Replace end-to-end swarm voting with a rules-plus-score deterministic decision engine.
- [x] Recompute decisions on a fast rolling cadence with symbol-specific throttling.
- [x] Implement a unified feature-calculation module covering short-horizon returns, realized volatility, spread and slippage proxies, order-book pressure, candle structure, volume expansion, VWAP or rolling-mean distance, breakout or compression features, and inventory or account constraints.
- [x] Implement a first-class composite score with directional edge, execution quality, risk penalty, and expected net edge after fees and slippage.
- [x] Restrict execution outputs to `BUY`, `SELL`, or `HOLD`.
- [x] Keep spot semantics inventory-aware so `BUY` adds inventory and `SELL` only reduces existing inventory.
- [x] Remove LLM voting from the primary execution-critical path and keep LLMs only as optional secondary overlays.

### Market data, strategy, risk, execution, and portfolio
- [x] Require realtime-quality data in the live execution path.
- [x] Disable synthetic fallback as a production trading input across the full live decision path.
- [x] Replace the multi-agent vote aggregation layer with a deterministic strategy engine that emits edge score, confidence, expected value, and rationale metadata.
- [x] Expose clearer threshold-based rejection metadata in validator, expected-value, harness, autonomy, and execution layers.
- [x] Convert veto-style blockers into scored constraints end to end instead of layered HOLD suppression.
- [x] Separate signal generation from execution policy.
- [x] Enforce execution-policy constraints for minimum confidence, market tradability, budget, max position sizing, min trade notional, and inventory-aware `SELL` sizing.
- [x] Enforce cooldown only when justified by position state instead of blanket time-based suppression.
- [x] Resolve the autonomous symbol universe dynamically from live exchange instruments and current account balances, including multi-quote spot support.
- [x] Rank autonomy candidates using a richer score that includes confidence, agreement, expected net edge, market quality, and portfolio fit.
- [x] Add explicit portfolio allocation logic using inventory state, concentration, and symbol budget allocation.

### Persistence and learning
- [x] Persist swarm decision snapshots in history.
- [x] Persist execution intents separately from final execution results.
- [x] Persist trade execution records with order details.
- [x] Persist pre-trade feature snapshots.
- [x] Persist post-trade outcome windows.
- [x] Persist realized slippage metrics.
- [ ] Persist realized and unrealized strategy performance attribution.
- [ ] Replace blocked-history bias with outcome-based learning.

### Public interfaces and API surfaces
- [x] Extend `ConsensusResult` with `directionalSignal`, `directionalConfidence`, `directionalAgreement`, `decision`, `executionEligible`, and `rejectionReasons`.
- [x] Expose expected net edge and market quality on runtime-facing payloads through consensus subreports and autonomy candidate scores.
- [x] Expose `lastCandidateScores`, `lastSelectedCandidate`, and `lastRejectedReasons` in autonomy status.
- [x] Surface structured threshold failures in stream and history responses.
- [x] Introduce a dedicated deterministic `DecisionResult` that supersedes the swarm-shaped `ConsensusResult`.
- [x] Add first-class `riskFlags` to the execution-ready decision payload.
- [x] Expose full outcome metrics through persistence and APIs.

### Evaluation and tests
- [ ] Add unit tests for feature calculations, score composition, threshold gating, sizing rules, and inventory-aware `SELL` behavior.
- [ ] Add simulation or replay coverage for historical candle and order-book playback, fee and slippage sensitivity, and low-volatility false-positive suppression.
- [ ] Add integration tests for the autonomy loop from market snapshot to execution intent and spot inventory lifecycle.
- [ ] Add safety tests for duplicate execution prevention, circuit breaker behavior, stale lease recovery, budget exhaustion, and minimum trade size handling.
- [ ] Add acceptance-scenario coverage proving autonomous execution under valid realtime conditions and explicit threshold-based no-trade outcomes.

### Phase roadmap status
- [x] Phase 1 is materially implemented.
- [x] Phase 2 is implemented.
- [ ] Phase 3 is implemented.
- [ ] Phase 4 is implemented.

### Acceptance criteria snapshot
- [x] The system can route spot `BUY`, `SELL`, and `HOLD` decisions automatically without human confirmation when execution gates pass.
- [x] Live execution is blocked when market data is stale or non-realtime.
- [x] `SELL` behavior is inventory-aware and does not assume shorting capability.
- [x] Operators can inspect candidate rankings, rejection reasons, expected edge, and market quality in runtime UI and API surfaces.
- [x] A no-trade outcome is always traceable to explicit mathematical thresholds only, without residual heuristic deadlock.
- [x] Symbol selection is driven by expected opportunity plus portfolio state rather than confidence-only heuristics.
- [ ] Every decision can be replayed from stored features, thresholds, and execution metadata.
- [ ] Offline replay and rolling forward validation gate new live trading logic before rollout.

## Audit Summary
The codebase has moved materially closer to the target architecture than this document previously reflected. The deterministic engine is already the execution-critical path, `DecisionResult` exists as a first-class execution type, autonomy uses richer expected-opportunity plus portfolio-aware ranking, and persistence now lives in PostgreSQL rather than a file-backed `.data/` store.

The remaining gaps are narrower and more concrete:
- replay exists as a utility but not as a release gate
- outcome storage exists, but learning and attribution are still only partial
- automated coverage around the trading core remains very thin

## Current System
The current system is a spot-first OKX trading workstation with a deterministic trading core, optional diagnostic swarm overlays, an autonomous selector, and a guarded execution path. Live market context is assembled by the market-data service, which combines websocket subscriptions, REST recovery, stale-data polling, and lower-level OKX fallback behavior before exposing `MarketSnapshot` and `MarketContext` to the rest of the app.

The live decision path today is:

1. Market context is loaded from `src/lib/market-data/service.ts`.
2. `src/lib/swarm/pipeline.ts` fetches account state and builds a deterministic decision through `src/lib/swarm/deterministic-engine.ts`.
3. The deterministic engine computes features, directional edge, execution quality, risk penalty, expected net edge, risk flags, and structured rejection reasons.
4. Optional LLM diagnostics can still be collected through `collectDiagnosticVotes` for stream visibility, but those votes are no longer in the execution-critical decision path.
5. If autonomy is running, `src/lib/autonomy/service.ts` resolves the tradable symbol universe dynamically from live OKX instruments plus current account balances, including multi-quote spot markets such as `*-EUR`, `*-USDT`, and `*-USDC`.
6. Autonomy ranks candidates using expected opportunity, market quality, confidence, agreement, symbol throttling, and portfolio state such as current inventory, concentration, and remaining symbol budget.
7. `src/lib/swarm/autoExecute.ts` applies execution policy constraints for market tradability, realtime requirements, confidence, budget, minimum trade notional, daily trade limits, duplicate suppression, circuit breaker state, and spot inventory-aware sizing before routing to `/api/ai/trade/execute`.
8. Swarm runs, execution intents, autonomy state, trade executions, and outcome windows are persisted through Drizzle/PostgreSQL, with Redis used for caches, duplicate suppression, and swarm result caching.

Behaviorally, this means the system is already autonomous in scheduling and order routing, the execution-critical trading decision is deterministic, and the biggest remaining gaps are now around outcome-based learning, replay-based release validation, and test depth rather than LLM vote deadlock.

## Critical Issues
### 1. Replay exists, but it is not yet a deployment gate
The repo now has a deterministic replay engine in `src/lib/replay/engine.ts`, metrics in `src/lib/replay/metrics.ts`, and a CLI wrapper in `src/scripts/replay.ts`. That is real progress. The missing step is turning replay into a required validation system with canonical datasets, walk-forward evaluation, parameter sensitivity checks, and release gating.

### 2. Memory and reliability are only partially outcome-based
`src/lib/swarm/reliability.ts` can already use realized outcome windows when enough resolved samples exist. That is materially better than pure blocked-history memory. But the aging-memory layer still stores and recalls prior signals, blocked states, and confidence summaries rather than learning directly from realized return, slippage, or attribution feedback.

### 3. Post-trade attribution is still incomplete
Trade executions now store decision snapshots, execution context, realized slippage, rolling outcome windows, and current mark-to-market performance. The remaining gap is a fuller attribution layer that cleanly separates executed alpha, missed alpha, allocation drag, capital rotation quality, and realized versus unrealized performance across symbols and regimes.

### 4. Portfolio allocation is good, but not yet a full allocator
The current portfolio logic accounts for deployed capital, per-symbol budget caps, concentration, and live inventory. What is still missing is a stronger allocator that adapts symbol budgets based on realized performance, portfolio correlation, and opportunity cost across the active universe.

### 5. Automated coverage is still thin in the most important paths
There are no meaningful unit or integration tests around the deterministic engine, execution sizing, replay utility, or autonomy loop. That keeps regression risk high in the exact modules that now matter most.

## Notable Corrections From The Previous Audit
- `DecisionResult` is already implemented in [src/types/swarm.ts](</c:/Jason Platform/okx/src/types/swarm.ts:108>) and is used by the pipeline, orchestrator, replay engine, and execution path.
- Persistence is no longer file-backed `.data/` storage; the active persistence path is Drizzle plus PostgreSQL in [src/lib/persistence/history.ts](</c:/Jason Platform/okx/src/lib/persistence/history.ts:1>) and related schema files.
- Synthetic fallback provenance is now carried into market status through per-feed source tracking in [src/lib/market-data/service.ts](</c:/Jason Platform/okx/src/lib/market-data/service.ts:1>) and source-aware OKX market helpers in [src/lib/okx/market.ts](</c:/Jason Platform/okx/src/lib/okx/market.ts:1>).
- Replay infrastructure now exists in [src/lib/replay/engine.ts](</c:/Jason Platform/okx/src/lib/replay/engine.ts:1>) and [src/scripts/replay.ts](</c:/Jason Platform/okx/src/scripts/replay.ts:1>), but it is still a utility rather than a formal safety gate.
- Strategy performance summary and outcome refresh APIs already exist through [src/app/api/ai/system/performance/route.ts](</c:/Jason Platform/okx/src/app/api/ai/system/performance/route.ts:1>) and [src/app/api/ai/trade/history/route.ts](</c:/Jason Platform/okx/src/app/api/ai/trade/history/route.ts:1>).

## Target Trading Architecture
The replacement design should continue to use a deterministic quantitative core and keep LLMs out of the hard execution path.

### Core principle
The primary trading decision should come from a rules-plus-score engine, not from end-to-end LLM voting. LLMs remain optional support systems for commentary, anomaly explanation, and contextual enrichment.

### Market data
Live trading should require realtime-quality market data. In production:
- disable synthetic fallback for execution
- carry fallback provenance explicitly from the OKX access layer into `MarketFeedStatus`
- require websocket freshness for ticker and order book
- allow REST only as a bounded recovery mechanism, not as a normal live-trading source
- make `executionEligible` false whenever market quality drops below threshold

### Deterministic strategy engine
The deterministic engine is now in place, but its contracts should continue to converge on `DecisionResult` end to end, with replay and attribution built around the same execution-ready payload.

### Persistence and learning
The persistence model should continue expanding beyond decision snapshots and outcome windows to include:
- durable threshold snapshots used at decision time
- richer realized and unrealized attribution
- allocator feedback inputs
- replay-ready datasets captured from live trading sessions

### LLM role
LLMs should remain optional and secondary:
- regime commentary
- anomaly explanation
- discretionary research overlays
- operator-facing narrative summaries

## Phased Roadmap
### Phase 1: Immediate stabilization
Goal: make the current system safe and observable enough to prepare for deterministic trading.

Status: materially complete.

### Phase 2: Deterministic decision engine
Goal: replace heuristic swarm voting with a measurable trading strategy core.

Status: implemented.

### Phase 3: Outcome-based performance layer
Goal: measure whether the system is actually improving PnL.

Status: partially implemented through outcome windows, trade performance refresh, and strategy summaries, but still missing full attribution and release-quality replay validation.

### Phase 4: Production hardening
Goal: make the engine robust enough for unattended live operation.

Status: partially implemented through duplicate suppression, execution intents, worker lease handling, daily trade limits, live budget caps, and circuit breakers, but still missing formal test coverage and replay-based rollout gates.

## Acceptance Criteria
The architecture should be considered ready only when all of the following are true:

- The system can autonomously place `BUY` and `SELL` spot orders without human confirmation when realtime-quality conditions are valid.
- A no-trade outcome is always traceable to explicit mathematical thresholds, not to opaque consensus deadlock.
- Symbol selection is driven by expected opportunity and portfolio state, not by shallow confidence heuristics.
- Live trading is impossible when market data is stale or degraded below production thresholds.
- `SELL` behavior is inventory-aware and never assumes shorting capability.
- Every decision can be replayed from stored features, thresholds, and execution metadata.
- Offline replay and rolling forward validation exist for the deterministic decision engine before live rollout.
- Operators can inspect:
  - the last candidate rankings
  - the last rejection reason by threshold
  - the expected edge and market quality behind each decision

## Test Plan
The test plan from the previous version remains directionally correct and is still largely unimplemented:

### Unit tests
- feature calculations
- directional score composition
- expected net edge calculation
- market quality thresholds
- risk penalty application
- sizing logic
- inventory-aware `SELL` rules

### Simulation and replay tests
- historical candle and order-book playback
- fee and slippage sensitivity
- suppression of false positives during low-volatility chop
- comparison of deterministic engine vs current live logic on identical playback data

### Integration tests
- autonomy loop from market snapshot to execution intent
- no-trade when realtime data is stale
- `BUY` then `SELL` inventory lifecycle in spot mode
- symbol ranking by expected opportunity

### Safety tests
- duplicate execution prevention
- circuit breaker behavior
- stale lease recovery
- budget exhaustion
- minimum trade size handling
- no execution when account inventory is insufficient for `SELL`

## Defaults And Assumptions
- Scope remains OKX spot-first, even though some derivatives-aware utilities exist.
- Objective is balanced risk-adjusted PnL, not maximum trade count.
- The long-term core is deterministic and quantitative.
- LLMs remain optional support systems, not primary execution voters.
- This document is an internal engineering audit and build spec, not a user-facing product brief.
