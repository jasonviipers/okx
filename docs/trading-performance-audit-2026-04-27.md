# Trading Performance Audit

Date: 2026-04-27

## Executive Summary

The main problem in this workspace is not "the bot trades but has no edge."
The stronger conclusion from the local evidence is:

1. The strategy is barely or never reaching executable trades.
2. A validator still applies old multi-voter swarm rules to the newer deterministic path.
3. The candidate universe contains poor small-account spot candidates, including wide-spread `*-USD` pairs.
4. The expected-value and harness filters are strict enough that small-capital spot trading rarely clears fees and slippage.
5. The local history does not show a live system that has been opening and closing real positions with measurable PnL.

## Workspace Reality Check

Before treating the notes below as a literal statement about the current checkout, there are a few important corrections:

1. The repo snapshot itself is currently configured for paper trading, not live trading.
2. Autonomous trading is disabled by default in the local `.env`, so a flat local balance is expected unless another runtime is starting it elsewhere.
3. The current checkout does not include a persisted local `.data/` directory yet, so any claims about local history files only apply after the app has actually been running and writing them.
4. The current instrument-universe defaults in code already prefer `*-USDT` spot majors, not the older `*-USD` mix referenced in earlier observations.

Because of that, the right way to analyze this workspace is:

- separate runtime-state conclusions from codebase conclusions,
- fix architecture mismatches in code,
- and expose a first-class audit view that shows whether the bot is actually running, filling trades, and producing measurable PnL.

Implemented in this workspace as part of this audit pass:

- deterministic execution no longer gets blocked by legacy vote-quorum validation,
- a trading performance audit API now reports fills, attempts, realized/unrealized PnL, inactivity, and blocker frequency,
- and the dashboard now exposes that audit directly in the swarm panel.

So the first issue to fix is not win rate optimization. The first issue is getting from "constant HOLD / blocked" to "clean, intentional, measurable executions on liquid pairs."

## What The Platform Appears To Be Building

From the current codebase, the platform is trying to be:

- an autonomous crypto trading system,
- using a deterministic decision engine with swarm-style diagnostics,
- running continuously,
- evaluating market quality, expected value, memory alignment, and portfolio fit,
- then auto-executing only when risk and execution-quality thresholds are satisfied.

In other words, the system is currently designed more like a capital-preservation gatekeeper than a frequent trader.

Relevant files:

- [src/lib/autonomy/service.ts](../src/lib/autonomy/service.ts)
- [src/lib/swarm/pipeline.ts](../src/lib/swarm/pipeline.ts)
- [src/lib/swarm/deterministic-engine.ts](../src/lib/swarm/deterministic-engine.ts)
- [src/lib/swarm/expected-value.ts](../src/lib/swarm/expected-value.ts)
- [src/lib/swarm/validator.ts](../src/lib/swarm/validator.ts)
- [src/lib/swarm/harness.ts](../src/lib/swarm/harness.ts)

## What The Local Evidence Says

### 1. Local history does not show real trade executions

The local persistence files indicate that the system is evaluating candidates, but not actually executing trades in this workspace snapshot.

Observed files:

- [`.data/history.json`](../.data/history.json)
- [`.data/execution-intents.json`](../.data/execution-intents.json)
- [`.data/outcome-windows.json`](../.data/outcome-windows.json)

Key findings from those files:

- `history.json` contains swarm runs.
- `execution-intents.json` is empty.
- `outcome-windows.json` is empty.
- There are no local realized trade outcomes to compute a true win rate from.

That means one of these is true:

- the deployed environment is different from the local workspace,
- the UI is showing evaluation activity rather than real execution activity,
- or live execution is expected, but the current logic is blocking almost everything.

### 2. The autonomy state says the engine is finding no executable candidate

The latest autonomy snapshot is very explicit:

- [`.data/autonomy-state.json`](../.data/autonomy-state.json)

The system reports:

- `lastDecision: "HOLD"`
- `lastExecutionStatus: "hold"`
- `lastRejectedReasons: autonomy_no_candidate_available`

It also says the top blockers are things like:

- `spot_shorting_not_available`
- `deterministic_confidence_below_min`
- `expected_net_edge_below_threshold`
- `insufficient_aligned_votes`
- `agreement_below_min`
- `harness_threshold_failed`

So the platform is not behaving like a profitable-but-flat trader. It is behaving like a heavily blocked selector.

## Core Problems

### Problem 1. Validator logic is mismatched with the deterministic engine

The current runtime trading path calls `buildSwarmDecision(ctx, [], ...)`, so it intentionally passes no votes into the decision pipeline:

- [src/lib/swarm/orchestrator.ts](../src/lib/swarm/orchestrator.ts)

But the validator still enforces old swarm-style structural rules:

- minimum aligned votes,
- consensus agreement thresholds,
- consensus confidence thresholds,
- invalidation checks on votes.

Those rules live here:

- [src/lib/swarm/validator.ts](../src/lib/swarm/validator.ts)
- [src/lib/swarm/policy.ts](../src/lib/swarm/policy.ts)

This produces artificial rejection reasons such as:

- `insufficient_aligned_votes`
- `agreement_below_min`
- `structural_validation_failed`

even though the live path is not using aligned votes in the first place.

### Why this matters

This is a design inconsistency, not just a parameter issue. It makes the system reject trades for conditions that are structurally impossible to satisfy in the active decision path.

### Priority

Highest.

---

### Problem 2. Spot-only behavior suppresses bearish opportunities on a flat account

The deterministic engine correctly recognizes bearish setups, but in spot mode a bearish signal on zero inventory becomes `HOLD`:

- [src/lib/swarm/deterministic-engine.ts](../src/lib/swarm/deterministic-engine.ts)
- [src/lib/swarm/autoExecute.ts](../src/lib/swarm/autoExecute.ts)
- [src/lib/okx/orders.ts](../src/lib/okx/orders.ts)

The common rejection reason is:

- `spot_shorting_not_available`

### Why this matters

If the market regime is mostly bearish or choppy and the account is flat, the system will sit out. That is not a bug by itself. It is expected spot behavior.

But it means:

- a spot-only engine cannot monetize downward moves,
- and if buy conditions are also strict, the platform can spend days doing nothing.

For a small account, that can easily look like "the agent is alive but not improving the balance."

### Priority

Highest, from a strategy expectation standpoint.

---

### Problem 3. Candidate universe is weak for a tiny account

The local candidate list includes:

- `SOL-USD`
- `MEME-USD`
- `BTC-USD`
- `ETH-USD`
- `DOGE-USD`
- `SOL-USDC`
- `BTC-USDC`
- `ETH-USDC`

Source:

- [`.data/autonomy-state.json`](../.data/autonomy-state.json)
- [src/lib/okx/instruments.ts](../src/lib/okx/instruments.ts)

Several of these are bad fits for a small retail spot strategy:

- `MEME-USD` has missing market data in the snapshot.
- some `*-USD` pairs show wide spreads,
- several candidates show poor market-quality or slippage metrics,
- the account budget is small enough that fee drag matters a lot.

### Why this matters

A $40 account cannot absorb mediocre spreads, poor depth, and 8 to 10 bps fee assumptions very well. The system may be correct to reject these setups.

### Priority

High.

---

### Problem 4. The expected-value gate is correctly pessimistic for these setups

The EV layer is strict and, based on the local numbers, often justified:

- [src/lib/swarm/expected-value.ts](../src/lib/swarm/expected-value.ts)
- [src/lib/swarm/thresholds.ts](../src/lib/swarm/thresholds.ts)

Examples from local state:

- `SOL-USD` had spread around `1.175%`
- estimated slippage around `64.6 bps`
- gross edge around `5.1 bps`
- net edge around `-67.5 bps`

And similar issues appear for `DOGE-USD`, `ETH-USDC`, and other candidates.

### Why this matters

This means the system is not merely "too conservative." In multiple cases it is correctly detecting that a tiny spot trade would likely lose money after spread, slippage, and fees.

### Priority

High.

---

### Problem 5. The harness and memory system are influencing trades without real outcome data

The harness and reliability layers use historical blocking / memory alignment:

- [src/lib/swarm/harness.ts](../src/lib/swarm/harness.ts)
- [src/lib/swarm/reliability.ts](../src/lib/swarm/reliability.ts)
- [src/lib/persistence/history.ts](../src/lib/persistence/history.ts)

But the local workspace has:

- no realized outcome windows,
- no meaningful trade sample for win-rate learning.

### Why this matters

The system is layering "learning" and "historical weighting" before it has enough real executions to learn from. That increases complexity without giving you reliable edge estimation.

### Priority

Medium-high.

## Why The Balance Is Not Growing

Given the local evidence, the most likely explanation is:

1. The engine is screening many setups.
2. Most setups fail on liquidity, EV, or structural validator reasons.
3. Bearish setups get converted to `HOLD` in spot mode when there is no inventory.
4. The remaining bullish setups still fail confidence / EV / harness thresholds.
5. As a result, the account either executes nothing, or executes so little that there is no measurable equity growth.

That is very different from:

- "the agent is trading a lot and losing its edge,"
- or "the strategy wins and losses are canceling out."

Right now, the stronger conclusion is: the system is over-blocked and poorly targeted for a tiny spot account.

## Recommended Fix Order

### Phase 1. Fix the architecture mismatch

1. Split deterministic execution validation from legacy swarm-vote validation.
2. If the live path uses deterministic signals, stop requiring aligned vote quorum there.
3. Keep diagnostic vote collection for observability only, unless those votes truly drive execution again.

Concrete target:

- Refactor [src/lib/swarm/validator.ts](../src/lib/swarm/validator.ts) so vote-based rules only run when votes are actually part of the execution path.

### Phase 2. Narrow the tradable universe

1. Restrict live candidates to the most liquid symbols actually suited to the funded account.
2. Prefer a very small universe first, for example:
   - `BTC-USDT`
   - `ETH-USDT`
   - possibly `SOL-USDT`
3. Remove meme or thin pairs from autonomous trading until the system has proven positive expectancy on majors.
4. Avoid quote markets that are not the account's real execution venue preference.

Concrete target:

- tighten [src/lib/okx/instruments.ts](../src/lib/okx/instruments.ts) and any autonomy candidate expansion logic.

### Phase 3. Align the system with spot reality

1. Decide whether this platform is:
   - spot-only and long-biased, or
   - intended to trade both directions with derivatives.
2. If spot-only, redesign the strategy around:
   - bullish pullbacks,
   - momentum continuation,
   - mean re-entry,
   - and disciplined exits.
3. If you want 24/7 profit across market regimes, spot-only will be structurally limiting.

### Phase 4. Simplify before optimizing

1. Temporarily reduce learning-layer influence until there are enough real outcomes.
2. Track a smaller number of decision reasons.
3. Make the platform prove it can execute cleanly on a narrow, liquid universe first.

### Phase 5. Add performance measurement that matches reality

Before changing more thresholds, start tracking:

- number of evaluated candidates,
- number of execution-eligible candidates,
- number of actual executions,
- realized PnL by symbol,
- realized PnL after fees,
- average hold time,
- win rate,
- average winner / average loser,
- skipped-trade reasons by frequency.

Without that, it is too easy to confuse "busy system" with "working system."

## Specific Improvements To Tackle

### Immediate

- Remove vote-quorum rejection from deterministic execution mode.
- Restrict autonomy to liquid majors only.
- Drop unsupported or poor-quality symbols from auto-selection.
- Verify the deployed environment is actually live if live trading is expected.
- Verify whether the dashboard is showing real fills or only decision evaluations.

### Short term

- Separate paper-trading metrics from live-trading metrics.
- Add a dedicated execution report page:
  - signals generated,
  - signals blocked,
  - orders sent,
  - orders filled,
  - realized PnL.
- Reduce the number of overlapping blockers so the top failure reason is easier to diagnose.

### Medium term

- Create distinct strategies for:
  - trending major pairs,
  - range-bound major pairs,
  - high-volatility alts.
- Recalibrate EV thresholds using realized fill data from the actual venue.
- Introduce regime-aware behavior instead of one generic threshold stack for all symbols.

## What I Would Do Next

If the goal is to make this system actually useful with a small account, the next practical move is:

1. fix the validator mismatch,
2. narrow the universe to liquid majors,
3. run the system in a clearly measured paper or tiny-live mode,
4. collect real execution outcomes,
5. only then tune for win rate and return.

Trying to optimize win rate before fixing the trade admission path would be premature.

## Bottom Line

The local codebase does not currently look like a system that has found a weak but active trading edge. It looks like a system that is mostly filtering itself out of the market.

That is actually good news in one sense: the main issue appears to be fixable architecture and market-selection design, not just "the model is dumb."

The right objective now is:

- first get high-quality, measurable executions,
- then evaluate expectancy,
- then optimize returns.
