# Autonomous Trading Audit And Rebuild

## Implementation Status Checklist
Audit date: 2026-04-17

Checked items are materially implemented in the current codebase. Unchecked items are missing or only partially implemented.

Audit scope used for this checklist:
- `src/lib/swarm/*`
- `src/lib/autonomy/service.ts`
- `src/lib/market-data/service.ts`
- `src/lib/persistence/*`
- `src/app/api/ai/swarm/*`
- `src/app/api/ai/system/*`
- `src/components/terminal/*`

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
- [ ] Disable synthetic fallback as a production trading input across the full live decision path.
- [x] Replace the multi-agent vote aggregation layer with a deterministic strategy engine that emits edge score, confidence, expected value, and rationale metadata.
- [x] Expose clearer threshold-based rejection metadata in validator, expected-value, harness, autonomy, and execution layers.
- [x] Convert veto-style blockers into scored constraints end to end instead of layered HOLD suppression.
- [x] Separate signal generation from execution policy.
- [x] Enforce execution-policy constraints for minimum confidence, market tradability, budget, max position sizing, min trade notional, and inventory-aware `SELL` sizing.
- [ ] Enforce cooldown only when justified by position state instead of blanket time-based suppression.
- [x] Rank autonomy candidates using a richer score that includes confidence, agreement, expected net edge, and market quality.
- [ ] Add explicit portfolio allocation logic using inventory state, concentration, and symbol budget allocation.

### Persistence and learning
- [x] Persist swarm decision snapshots in history.
- [x] Persist execution intents separately from final execution results.
- [x] Persist trade execution records with order details.
- [ ] Persist pre-trade feature snapshots.
- [ ] Persist post-trade outcome windows.
- [ ] Persist realized slippage metrics.
- [ ] Persist realized and unrealized strategy performance attribution.
- [ ] Replace blocked-history bias with outcome-based learning.

### Public interfaces and API surfaces
- [x] Extend `ConsensusResult` with `directionalSignal`, `directionalConfidence`, `directionalAgreement`, `decision`, `executionEligible`, and `rejectionReasons`.
- [x] Expose expected net edge and market quality on runtime-facing payloads through consensus subreports and autonomy candidate scores.
- [x] Expose `lastCandidateScores`, `lastSelectedCandidate`, and `lastRejectedReasons` in autonomy status.
- [x] Surface structured threshold failures in stream and history responses.
- [ ] Introduce a dedicated deterministic `DecisionResult` that supersedes the swarm-shaped `ConsensusResult`.
- [x] Add first-class `riskFlags` to the execution-ready decision payload.
- [ ] Expose full outcome metrics through persistence and APIs.

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
- [ ] Symbol selection is driven by expected opportunity plus portfolio state rather than confidence or agreement-weighted heuristics.
- [ ] Every decision can be replayed from stored features, thresholds, and execution metadata.
- [ ] Offline replay and rolling forward validation gate new live trading logic before rollout.

## Current System
The current system is a spot-only OKX trading workstation built around a five-model swarm plus a separate execution model. Live market context is assembled by the market-data service, which combines websocket subscriptions, REST backfill, stale-data polling, and optional synthetic fallback before exposing `MarketSnapshot` and `MarketContext` to the rest of the app.

The decision path today is:

1. Market context is loaded from `src/lib/market-data/service.ts`.
2. The orchestrator in `src/lib/swarm/orchestrator.ts` runs the active voting models:
   - `trend_follower`
   - `momentum_analyst`
   - `sentiment_reader`
   - `macro_filter`
   - `execution_tactician`
3. Each agent is created in `src/lib/agents/create-agent.ts`, where a heuristic vote is generated first and an LLM call may refine it.
4. The pipeline in `src/lib/swarm/pipeline.ts` computes consensus, classifies regime, applies meta-selection, expected-value filtering, reliability weighting, validator checks, and the decision harness.
5. If autonomy is running, `src/lib/autonomy/service.ts` evaluates candidate symbols, picks the highest-scoring eligible setup, and passes the final result to `src/lib/swarm/autoExecute.ts`.
6. Execution checks account balances, open positions, budget, min confidence, market tradability, and instrument rules before routing to `/api/ai/trade/execute`.
7. Swarm runs, memory, history, and execution intents are persisted locally in `.data/` through file-backed storage.

Behaviorally, this means the system is already autonomous in scheduling and order routing, but the actual trading decision is still driven by heuristic agent votes and a layered veto stack rather than by a deterministic quantitative strategy engine.

## Critical Issues
### 1. Signal generation is heuristic-first, not model-first
The core directional logic in `src/lib/agents/create-agent.ts` is produced by hand-built heuristic functions such as `runTrendFollower`, `runMomentumAnalyst`, `runSentimentReader`, `runMacroFilter`, and `runExecutionTactician`. The LLM mostly decorates or lightly adjusts these votes. This makes the system hard to calibrate, hard to backtest, and impossible to treat as a measurable predictive model.

### 2. The system has too many sequential blockers
A trade can be demoted to `HOLD` by:
- a veto-layer HOLD in `validator.ts`
- regime mismatch in `meta-selector.ts`
- expected-value rejection in `expected-value.ts`
- weak historical fit in `reliability.ts`
- memory and market-quality suppression in `harness.ts`
- minimum confidence and execution guards in `autoExecute.ts`

This structure is safer than raw auto-trading, but in practice it creates serial suppression. The user-visible behavior is repeated `HOLD` outcomes and very low execution frequency even when some agents are directional.

### 3. Reliability and memory can reinforce inactivity
The memory layer stores blocked decisions and summarizes blocked ratio. The harness and reliability layers both use blocked history as an input. Even after recent fixes, the architecture still learns heavily from prior suppression events rather than from realized trade outcomes. That biases the system toward inactivity instead of learning whether a setup actually led to profit or loss.

### 4. Research is mixed into a real-time path without strict latency boundaries
Some agents may request web research before finalizing their vote. That may improve narrative context, but it is not causal, can be rate-limited, and is not appropriate as a primary dependency for low-latency execution-critical decisions.

### 5. Production execution can still degrade on non-realtime data
The market-data layer supports REST recovery and synthetic fallback. While there are tradability checks, the architecture still allows autonomy and swarm analysis to run in degraded modes unless production settings are tightened. For live funds, the system should require realtime-quality data instead of merely allowing analysis to continue.

### 6. `SELL` is inventory reduction, not shorting
Execution is explicitly spot-only. `SELL` depends on available base inventory, and there is no margin or perp short logic. This is the correct scope for v1, but the algorithm and documentation must treat it as inventory-aware de-risking, not as symmetric long/short trading.

### 7. Symbol selection is not portfolio optimization
Autonomy currently ranks candidates by whether they are tradeable, not blocked, and non-`HOLD`, then scores them with a simple confidence/agreement blend. That is not a portfolio allocator and does not maximize expected return after cost, inventory state, and budget constraints.

### 8. There is no quantitative learning loop
The system does not yet have:
- a formal feature store
- labeled outcomes
- offline replay
- rolling forward validation
- slippage attribution
- post-trade performance decomposition

Without these pieces, it is impossible to prove that strategy changes improve PnL instead of merely changing how often the system trades.

## Target Trading Architecture
The replacement design should use a deterministic quantitative core and move LLMs out of the hard execution path.

### Core principle
The primary trading decision should come from a rules-plus-score engine, not from end-to-end LLM voting. LLMs remain optional support systems for commentary, anomaly explanation, and contextual enrichment.

### Market data
Live trading should require realtime-quality market data. In production:
- disable synthetic fallback for execution
- require websocket freshness for ticker and order book
- allow REST only as a bounded recovery mechanism, not as a normal live-trading source
- make `executionEligible` false whenever market quality drops below threshold

### Deterministic strategy engine
Replace multi-agent directional voting with a single decision engine that computes a feature vector and emits a structured `DecisionResult`.

Minimum feature set:
- short-horizon returns over multiple lookbacks
- realized volatility and volatility regime
- spread and slippage proxies
- top-of-book and aggregated order book imbalance
- candle body, wick, and compression features
- volume expansion and contraction
- distance from rolling mean or VWAP proxy
- breakout and range-rotation signals
- inventory, account, and budget state

### Mathematical scoring model
The engine should compute at least four scored components:
- `directionalEdgeScore`
- `executionQualityScore`
- `riskPenaltyScore`
- `expectedNetEdgeBps`

Recommended decision flow:

1. Compute normalized feature scores.
2. Produce raw directional edge for `BUY` and `SELL`.
3. Adjust raw edge by execution quality and risk penalties.
4. Estimate net edge after fees and slippage.
5. Convert the final score into:
   - `signal`
   - `confidence`
   - `marketQualityScore`
   - `riskFlags`
   - `executionEligible`

Default decision rule:
- Trade only when expected net edge clears minimum threshold.
- Trade only when confidence clears minimum threshold.
- Trade only when market quality clears minimum threshold.
- Trade only when symbol and portfolio risk budgets allow it.
- Otherwise return `HOLD` with structured rejection reasons.

### Spot-only execution semantics
For this version:
- `BUY` increases spot inventory.
- `SELL` only reduces existing spot inventory.
- no shorting
- no synthetic inverse exposure

Sizing should be inventory-aware and budget-aware:
- max notional per trade
- max balance usage
- min trade notional
- symbol-specific lot size and min size normalization

### Risk engine redesign
Current veto layers should become explicit, scored constraints instead of opaque consensus blockers. The risk engine should expose threshold failures directly:
- stale market data
- spread too wide
- insufficient depth
- expected edge too small
- volatility regime too hostile
- inventory unavailable for `SELL`
- budget exhausted

### Portfolio selector
Autonomy should rank symbols by best expected opportunity, not by non-blocked consensus score. Ranking inputs should include:
- expected net edge
- market quality
- confidence
- current inventory state
- portfolio concentration
- remaining daily and symbol budget

### Persistence and learning
Replace blocked-history bias with outcome-based evaluation. The persistence model should capture:
- pre-trade feature snapshot
- decision snapshot
- thresholds and rejection reasons
- submitted and filled order details
- realized slippage
- forward returns at fixed post-trade windows
- realized and unrealized PnL

### LLM role after redesign
LLMs should be optional and secondary:
- regime commentary
- news and sentiment enrichment
- anomaly explanation
- discretionary tie-breaking outside the execution-critical path

The system should explicitly remove LLM votes from the primary real-time execution path.

## Phased Roadmap
### Phase 1: Immediate stabilization
Goal: make the current system safe and observable enough to prepare for deterministic trading.

- Require realtime market data for live execution and disable synthetic fallback in production execution paths.
- Surface structured rejection reasons instead of relying on free-text block messages.
- Reduce residual HOLD deadlock by keeping directional scoring, risk gating, and execution gating separate.
- Expose autonomy candidate ranking inputs and last rejection thresholds in runtime status or history APIs.
- Tighten stream, history, and execution observability so operators can see why a trade was not placed.

### Phase 2: Deterministic decision engine
Goal: replace heuristic swarm voting with a measurable trading strategy core.

- Introduce a feature-calculation module that consumes `MarketContext` and account state.
- Build a deterministic `DecisionResult` with:
  - `signal`
  - `confidence`
  - `expectedNetEdgeBps`
  - `marketQualityScore`
  - `riskFlags`
  - `executionEligible`
- Replace autonomy symbol scoring with expected-opportunity ranking.
- Keep the old swarm only as a diagnostic or advisory layer until the new engine proves itself.

### Phase 3: Outcome-based performance layer
Goal: measure whether the system is actually improving PnL.

- Store decision-time features and post-trade outcomes.
- Add historical replay for candles and order-book snapshots.
- Add forward return labeling for multiple horizons.
- Attribute missed trades, blocked trades, executed trades, slippage, and realized PnL.
- Calibrate thresholds using replay and rolling forward validation rather than manual intuition.

### Phase 4: Production hardening
Goal: make the engine robust enough for unattended live operation.

- Add strong duplicate-execution prevention and idempotent execution intent handling.
- Add circuit breaker recovery policy and operator visibility.
- Add stale-lease recovery and autonomy worker health reporting.
- Add daily, symbol-level, and portfolio-level budget governance.
- Add release gates so new scoring logic only reaches live execution after replay and simulation checks pass.

## Acceptance Criteria
The new architecture should be considered ready when all of the following are true:

- The system can autonomously place `BUY` and `SELL` spot orders without human confirmation when realtime-quality conditions are valid.
- A no-trade outcome is always traceable to explicit mathematical thresholds, not to opaque consensus deadlock.
- Symbol selection is driven by expected opportunity and portfolio state, not by confidence/agreement alone.
- Live trading is impossible when market data is stale or degraded below production thresholds.
- `SELL` behavior is inventory-aware and never assumes shorting capability.
- Every decision can be replayed from stored features, thresholds, and execution metadata.
- Offline replay and rolling forward validation exist for the deterministic decision engine before live rollout.
- Operators can inspect:
  - the last candidate rankings
  - the last rejection reason by threshold
  - the expected edge and market quality behind each decision

## Public Interfaces And Type Changes
The current `ConsensusResult` should evolve into a deterministic `DecisionResult` or a similarly named execution-ready type with at least:

```ts
type DecisionResult = {
  symbol: string;
  timeframe: string;
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  expectedNetEdgeBps: number;
  marketQualityScore: number;
  riskFlags: string[];
  executionEligible: boolean;
  rejectionReasons?: string[];
  featureSummary?: Record<string, number>;
};
```

Autonomy status should expand to expose:
- current candidate ranking inputs
- last candidate scores
- last rejected thresholds

Persistence should expand beyond current history and execution intents to include:
- signal snapshots
- fills
- forward outcome windows
- realized PnL
- slippage metrics

Stream and history APIs should emit structured threshold failures instead of only prose block reasons.

## Test Plan
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
- comparison of deterministic engine vs current swarm on identical playback data

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

### Document review checklist
- faithful to current repo behavior
- maps current modules to replacement responsibilities
- uses mathematically defined thresholds and scores
- clearly separates immediate stabilization from later quant work
- leaves no unresolved design choices for the core spot-only autonomous path

## Defaults And Assumptions
- Scope remains OKX spot only.
- Objective is balanced PnL, not maximum trade count.
- The long-term core is deterministic and quantitative.
- LLMs remain optional support systems, not primary execution voters.
- This document is an internal engineering audit and build spec, not a user-facing product brief.
