# Session Transition Protection Enhancement

## Scanner Module Specification for Claude Code Implementation

**Author:** Abdul (via Claude Opus 4.6)
**Date:** 2026-03-14
**Priority:** Critical — 9% portfolio loss from 4 consecutive session-transition failures
**Scope:** New module in App.jsx scanner + updated JSON export payload
**Pairs with:** `session_analysis_context.md`, `signal_volume_gate_project_knowledge.md`

---

## 1. Problem Statement

### What Is Happening

In the current macro environment (March 2026), BTC and altcoins exhibit a repeating intraday pattern:

- **Asian session (00:00–08:00 UTC):** Accumulation phase. Price grinds up slowly on thin volume. Small-bodied candles, low aggression, RSI slowly climbing from oversold.
- **London session (08:00–16:00 UTC):** Continuation or consolidation. Price may extend the Asian move slightly.
- **US session (13:00–22:00 UTC):** Distribution phase. Large players sell into the liquidity created by Asian+London buyers. Sharp reversals within 30–60 minutes of US open.

### How It Causes Losses

1. Scanner detects valid Setup A during Asian session (RSI in zone, price at support, volume adequate for session).
2. Trade is entered. Price grinds up slowly — trade moves into small profit.
3. TP1 at 3.5% sits near the top of the daily range.
4. US session opens. Distribution begins. Price reverses sharply.
5. The reversal is faster than the 2% stop can absorb, or the stop gets hit exactly before any recovery.
6. Result: 4 consecutive stop-loss hits, all following correct process, all caused by session transition timing.

### Why Current Scanner Does Not Catch This

The scanner currently evaluates:
- RSI, volume, support, candle patterns, BTC health — all point-in-time checks
- Session-aware volume normalization — adjusts for expected volume by session
- Session transition risk flags (`transitionRisk`, `dangerWindow`) — only warns about proximity to next session open

**What is missing:**
- No measurement of how much of the daily price range has already been consumed
- No detection of accumulation vs distribution phase characteristics
- No automatic TP/stop adjustment based on session timing
- No filter that says "this setup is technically valid but the daily move is already exhausted"

---

## 2. Solution Overview

Add four new capabilities to the scanner:

| # | Feature | Purpose |
|---|---|---|
| 1 | **ATR Exhaustion Filter** | Measure how much of BTC's expected daily range has been used. Block entries when >60% consumed. |
| 2 | **Accumulation/Distribution Phase Detector** | Classify current session behavior as accumulation, distribution, or neutral. |
| 3 | **Session-Aware TP Adjustment** | Reduce TP targets when range exhaustion is high, increasing probability of exit before reversal. |
| 4 | **Pre-US Hard Cutoff Timer** | Auto-flag any open setup approaching 12:30 UTC with a mandatory stop-to-breakeven warning. |

---

## 3. Feature 1: ATR Exhaustion Filter

### Concept

Use BTC's 14-period Average True Range on the daily timeframe (ATR-14 on 1D) as the expected daily range. Compare the distance BTC has already traveled from the current session's low to the current price. Express this as a percentage of the daily ATR.

### Data Required

- **BTC daily ATR-14:** The average true range over the last 14 daily candles. This represents the "normal" daily movement range for BTC.
- **Session low:** The lowest price BTC has printed since 00:00 UTC today (or since the start of the Asian session).
- **Current BTC price:** Live or latest candle close.

### Calculation

```
atrExhaustion = ((currentBtcPrice - sessionLow) / btcDailyATR) × 100
```

### Thresholds and Actions

| Exhaustion % | Label | Action |
|---|---|---|
| 0–40% | `FRESH` | Full confidence. Daily range has room. Normal entry rules apply. |
| 40–60% | `MODERATE` | Caution. Note in verdict. No automatic block but flag it. |
| 60–80% | `STRETCHED` | Hard downgrade — any setup confidence drops to LOW regardless of other signals. Add warning to verdict. |
| 80–100%+ | `EXHAUSTED` | Hard no-entry gate. Override all other signals. Verdict becomes "DAILY RANGE EXHAUSTED — NO ENTRY." |

### JSON Export Structure

Add a new top-level object to the scanner JSON payload:

```
"atrExhaustion": {
  "btcDailyATR": <number>,          // e.g., 4200.00 (in USD)
  "sessionLow": <number>,           // e.g., 69800.00
  "currentBtcPrice": <number>,      // e.g., 72500.00
  "rangeUsed": <number>,            // e.g., 2700.00
  "exhaustionPct": <number>,        // e.g., 64.3
  "label": "<string>",              // FRESH / MODERATE / STRETCHED / EXHAUSTED
  "verdict": "<string>"             // Human-readable note for Claude
}
```

### Integration with Existing Checklist

- Add `atrNotExhausted` as a new item in `playbookChecklist`
- Pass condition: `exhaustionPct < 60`
- Fail condition: `exhaustionPct >= 60` → checklist item fails, verdict includes reason
- When label is `EXHAUSTED` (>=80%): this becomes a **hard rejection gate** — same tier as "BTC dumping >3%"

### Edge Cases

- If BTC gaps up at session open (e.g., weekend gap), the session low may already be elevated. Use the lower of: today's session low OR yesterday's close as the baseline.
- If BTC is trending down (session low keeps making new lows), exhaustion should be measured from the session HIGH downward instead. In a down-trending day, the relevant question is "how much of the daily range has been consumed to the downside." Implement as: `max(upside exhaustion, downside exhaustion)`.
- If ATR-14 data is unavailable from the API, fall back to a hardcoded estimate (ask user to configure, default to $3,500 as a conservative estimate for current BTC volatility).

---

## 4. Feature 2: Accumulation/Distribution Phase Detector

### Concept

Classify the current market microstructure as accumulation, distribution, or neutral by analyzing candle characteristics over the last 2–4 hours of price action.

### Accumulation Signatures (detect these conditions)

All of the following should be evaluated. The more conditions that are true, the higher confidence the accumulation label:

- Price is rising or flat over the last 8–12 candles (1H timeframe)
- Candle bodies are small relative to ATR (body < 30% of candle range)
- Volume is below session-adjusted average (buyers accumulating quietly)
- No large red candles in the lookback window (no aggressive selling)
- RSI is between 35–55 and trending up slowly (not spiking)
- The move feels "grindy" — small incremental higher closes, no impulse

### Distribution Signatures (detect these conditions)

- Price near or at the session high / recent local high
- Long upper wicks appearing (sellers rejecting higher prices)
- Volume spikes on red candles or on candles with long upper wicks
- RSI approaching 60–70 range on 1H
- Large-bodied red candles appearing after a series of small green candles
- Price has already moved >60% of daily ATR from session low

### Scoring

Use a simple point system:

- Each accumulation signature present: +1 point
- Each distribution signature present: -1 point
- Aggregate score determines the label

| Score | Label | Meaning |
|---|---|---|
| +3 or higher | `ACCUMULATION` | Market is in quiet buying phase. Setups may be valid but TP expectations should be managed. |
| +1 to +2 | `LIKELY_ACCUMULATION` | Leaning accumulation but not all signals present. |
| -1 to +1 | `NEUTRAL` | No clear phase. Standard rules apply. |
| -2 to -1 | `LIKELY_DISTRIBUTION` | Leaning distribution. Avoid new entries. |
| -3 or lower | `DISTRIBUTION` | Active selling phase. Hard no-entry. |

### JSON Export Structure

```
"sessionPhase": {
  "phase": "<string>",              // ACCUMULATION / LIKELY_ACCUMULATION / NEUTRAL / LIKELY_DISTRIBUTION / DISTRIBUTION
  "score": <number>,                // e.g., +4 or -2
  "signals": {
    "accumulation": [<list of detected signals as strings>],
    "distribution": [<list of detected signals as strings>]
  },
  "confidence": "<string>",         // HIGH / MEDIUM / LOW
  "recommendation": "<string>"      // Human-readable action for Claude
}
```

### Integration with Existing Checklist

- This is NOT a hard checklist gate (not added to the 7-gate checklist)
- Instead, it modifies the **verdict confidence level**:
  - `DISTRIBUTION` or `LIKELY_DISTRIBUTION` → downgrade any CONFIRMED to FORMING, any FORMING to WAIT
  - `ACCUMULATION` → add note about entry timing (see Feature 4 for the waiting rule)
  - `NEUTRAL` → no modification

### Important

This detector is observational, not predictive. It tells you what phase the market is in RIGHT NOW, not what it will do next. The actionable insight is: if you're in distribution, don't enter. If you're in accumulation, enter carefully with adjusted targets and a hard pre-US cutoff.

---

## 5. Feature 3: Session-Aware TP Adjustment

### Concept

When the ATR exhaustion filter shows >50% range consumed, automatically calculate reduced TP levels alongside the standard ones. Present both to Claude so the verdict can recommend which set to use.

### Adjusted TP Table

| Condition | TP1 | TP2 | Stop | Effective R:R (TP1) |
|---|---|---|---|---|
| **Standard (exhaustion < 50%)** | 3.5% | 5.0% | 2.0% | 1.75:1 |
| **Reduced (exhaustion 50–70%)** | 2.5% | 4.0% | 2.0% | 1.25:1 |
| **Minimal (exhaustion 70–80%)** | 2.0% | 3.0% | 1.5% | 1.33:1 |
| **No entry (exhaustion >80%)** | — | — | — | — |

### JSON Export Structure

Add to the existing `tradeLevels` object:

```
"tradeLevels": {
  // ... existing fields ...
  "adjustedTP": {
    "active": <boolean>,             // true if exhaustion > 50%
    "reason": "<string>",            // e.g., "ATR 64% exhausted — reduced targets"
    "tp1Pct": <number>,              // e.g., 2.5
    "tp2Pct": <number>,              // e.g., 4.0
    "stopPct": <number>,             // e.g., 2.0
    "tp1Price": <number>,            // calculated from entry
    "tp2Price": <number>,
    "stopPrice": <number>,
    "effectiveRR": <number>          // e.g., 1.25
  }
}
```

### Rules

- When `adjustedTP.active` is true, Claude should present BOTH standard and adjusted levels, with a recommendation to use adjusted
- If the adjusted R:R drops below 1.0:1, the trade becomes invalid — output as NO TRADE with reason "insufficient R:R after session adjustment"
- The user can override to standard levels, but Claude should note the added risk
- This adjustment is TEMPORARY for the current macro environment — include a flag `"adjustedTP.regime": "session_conflict"` so it can be disabled later

---

## 6. Feature 4: Pre-US Hard Cutoff Timer

### Concept

Add a countdown/warning system that flags any active or forming setup approaching the US session danger window.

### Thresholds

| Time (UTC) | Warning Level | Action |
|---|---|---|
| Before 11:00 | `CLEAR` | No warning. Normal operations. |
| 11:00–12:00 | `APPROACHING` | Note in verdict: "US session in 1–2 hours. If entering now, TP1 must hit before 13:00 UTC or move stop to breakeven." |
| 12:00–12:30 | `IMMINENT` | Strong warning: "US open in 30–60 min. New entries require STRETCHED or better ATR exhaustion reading AND HIGH confidence setup only." |
| 12:30–14:00 | `DANGER_ZONE` | Hard no-entry gate during high-volatility macro periods. Verdict: "PRE-US DANGER ZONE — No new entries. If in a trade, move stop to breakeven NOW." |
| After 14:00 | `US_ACTIVE` | Evaluate normally using US session rules from existing framework. The danger is the transition, not the session itself. |

### JSON Export Structure

```
"usTransition": {
  "warningLevel": "<string>",       // CLEAR / APPROACHING / IMMINENT / DANGER_ZONE / US_ACTIVE
  "minutesToUSOpen": <number>,       // e.g., 45
  "recommendation": "<string>",     // Human-readable action
  "isHardBlock": <boolean>          // true only during DANGER_ZONE
}
```

### Integration

- `DANGER_ZONE` with `isHardBlock: true` is a hard rejection gate — same tier as BTC dumping
- `IMMINENT` adds a confidence downgrade (HIGH → MEDIUM, MEDIUM → LOW, LOW → NO TRADE)
- `APPROACHING` is informational only — added to verdict notes but does not block

### Macro Event Interaction

- On days with scheduled US macro events (FOMC, CPI, NFP), extend `DANGER_ZONE` to start at 12:00 UTC instead of 12:30
- The scanner should check the `noMajorEvents` gate — if that gate is already failing, the `DANGER_ZONE` extension is automatic
- If `noMajorEvents` passes (no scheduled events), use standard 12:30 UTC cutoff

---

## 7. Summary of New JSON Fields

All new fields added by this enhancement, collected in one place for implementation reference:

### Top-level objects to ADD:

1. `atrExhaustion` — ATR range exhaustion data (see Section 3)
2. `sessionPhase` — Accumulation/distribution classification (see Section 4)
3. `usTransition` — Pre-US session timer and warning (see Section 6)

### Existing objects to MODIFY:

1. `tradeLevels` — Add `adjustedTP` sub-object (see Section 5)
2. `playbookChecklist` — Add `atrNotExhausted` gate item
3. `setup.status` — Allow new override: if `atrExhaustion.label` is `EXHAUSTED` or `usTransition.isHardBlock` is true, force status to `REJECTED` regardless of other criteria

---

## 8. How Claude Should Interpret These New Fields

### Decision Tree (Updated)

```
1. Is atrExhaustion.label EXHAUSTED?
   → YES: "DAILY RANGE EXHAUSTED — NO ENTRY." Stop analysis.
   → NO: Continue.

2. Is usTransition.isHardBlock true?
   → YES: "PRE-US DANGER ZONE — NO ENTRY." Stop analysis.
   → NO: Continue.

3. Is sessionPhase.phase DISTRIBUTION or LIKELY_DISTRIBUTION?
   → YES: Downgrade confidence one level. If already LOW → NO TRADE.
   → NO: Continue.

4. Is atrExhaustion.label STRETCHED?
   → YES: Force confidence to LOW. Use adjustedTP levels.
   → NO: Continue.

5. Is usTransition.warningLevel IMMINENT?
   → YES: Downgrade confidence one level. Note in verdict.
   → NO: Continue.

6. Is adjustedTP.active true?
   → YES: Present adjusted TP levels as primary recommendation.
   → NO: Use standard TP levels.

7. Proceed with existing checklist evaluation (7 gates + candle confirmation).
```

### Verdict Format Updates

When session transition factors affect the verdict, Claude should include a new section:

```
### Session Context
- **ATR Exhaustion:** 64% (STRETCHED) — daily range largely consumed
- **Session Phase:** ACCUMULATION — quiet buying, expect distribution at US open
- **US Transition:** APPROACHING — 75 minutes to US open
- **TP Adjustment:** Active — using 2.5%/4.0% targets instead of 3.5%/5.0%
```

---

## 9. Data Sources

### What the scanner needs to fetch (or have access to)

| Data Point | Source | Frequency |
|---|---|---|
| BTC daily ATR-14 | Binance API (klines endpoint, 1D interval) | Refresh once per hour or on each scan |
| BTC session low | Binance API (klines endpoint, 1H interval, filter from 00:00 UTC) | Refresh on each scan |
| BTC current price | Binance API (ticker endpoint) | Real-time / on each scan |
| 1H candle data for phase detection | Binance API (klines endpoint, 1H interval, last 12 candles) | Refresh on each scan |
| Current UTC time | System clock | Real-time |
| Macro event schedule | Manual input or `noMajorEvents` existing gate | As available |

### API Endpoints (Binance)

- Klines: `GET /api/v3/klines` with params `symbol=BTCUSDT`, `interval=1d` (for ATR), `interval=1h` (for phase detection)
- Ticker: `GET /api/v3/ticker/price` with param `symbol=BTCUSDT`
- These are the same endpoints the scanner likely already uses — this enhancement should reuse existing API connections

---

## 10. Testing Criteria

Before deploying, verify these scenarios produce correct outputs:

| Scenario | Expected Output |
|---|---|
| BTC moved 2% of ATR from session low, Asian session, valid Setup A | `FRESH`, normal TP, no warnings |
| BTC moved 65% of ATR, London session, valid Setup A | `STRETCHED`, adjusted TP, confidence downgraded to LOW |
| BTC moved 85% of ATR, any session | `EXHAUSTED`, hard rejection, no trade |
| Time is 12:45 UTC, no macro events | `DANGER_ZONE`, hard block on new entries |
| Time is 12:15 UTC, CPI day | `DANGER_ZONE` (extended), hard block |
| Small green candles, low volume, RSI climbing slowly from 38 | `ACCUMULATION` phase detected |
| Long upper wicks, volume spike on red candle, RSI at 65 | `DISTRIBUTION` phase detected |
| Accumulation detected + exhaustion 55% + 90 min to US open | Adjusted TP + APPROACHING warning + accumulation note |
| adjustedTP R:R drops below 1.0 | Hard NO TRADE — insufficient R:R |

---

## 11. What This Does NOT Change

These existing rules remain exactly as they are:

- BTC >3% dump on 4H → hard block (unchanged)
- 7-gate checklist structure (this adds 1 gate, making it 8)
- Session-adjusted volume normalization (unchanged)
- Signal volume gate with dip-average logic (unchanged)
- RSI zones and candle confirmation requirements (unchanged)
- 2% risk rule and position sizing (unchanged)
- Asian session +0.3% stop buffer (unchanged)
- 48-hour maximum hold time (unchanged)
- All existing hard rejection gates (unchanged)

---

## 12. Implementation Priority

Implement in this order — each feature is independently useful:

1. **ATR Exhaustion Filter** — highest impact, would have prevented 3 of 4 recent losses
2. **Pre-US Hard Cutoff Timer** — simple to implement, immediate protection
3. **Session-Aware TP Adjustment** — depends on ATR data from Feature 1
4. **Accumulation/Distribution Detector** — most complex, implement last

---

*This document is a specification for Claude Code implementation. It contains no code — only requirements, data structures, logic rules, and expected behaviors. The implementer should read `App.jsx` to understand existing scanner architecture before adding these modules.*
