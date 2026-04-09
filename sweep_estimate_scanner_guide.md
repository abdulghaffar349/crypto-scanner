# Sweep Estimate Integration — Scanner Enhancement Guide

**Version:** 1.0  
**Date:** 2026-04-09  
**Scope:** App.jsx scanner output — adding ATR-based liquidity sweep depth estimates to JSON payload and UI

---

## 1. Problem Statement

Currently, limit order placement below the day's low relies on manual estimation of sweep depth. This introduces inconsistency — the same trader may place at different depths on different days depending on feel rather than a repeatable formula. The sweep estimate is also not logged in the trade journal, making backtesting impossible.

**Specific gaps:**
- No systematic formula for sweep depth per token
- No multi-tier output (conservative vs. deep sweep)
- Market cap context not surfaced at analysis time
- Missed fills and blown-through stops cannot be traced back to a specific depth error

---

## 2. Proposed Solution

Add a `sweepEstimate` object to the scanner JSON output. It calculates three sweep depth tiers from the 1H ATR and visible support low, then surfaces all three so the trader selects the appropriate tier based on the token's market cap.

**The trader does not need to know cap tier in advance — all three estimates are shown and the appropriate one is selected at decision time.**

---

## 3. The Formula

```
visibleLow        = lowest low of the current session or prior day (whichever is closer)
1H ATR            = average of last 14 candle true ranges on 1H chart

Shallow sweep     = visibleLow − (ATR1H × 0.30)   ← large-cap (SOL, LINK, AVAX)
Conservative sweep = visibleLow − (ATR1H × 0.50)  ← mid-cap (INJ, RENDER, SUI)
Deep sweep        = visibleLow − (ATR1H × 0.75)   ← small-cap (FET, ATOM, newer tokens)

Stop loss         = deepSweep − (ATR1H × 0.25)    ← below the deepest expected sweep
```

---

## 4. JSON Output — New `sweepEstimate` Object

Add this block to the existing token payload alongside `tradeLevels`:

```json
"sweepEstimate": {
  "visibleLow": 3.100,
  "atr1H": 0.090,
  "shallow": {
    "limitPrice": 3.073,
    "multiplier": "0.30×",
    "capTier": "Large-cap (SOL, LINK, AVAX)",
    "sweepDepthPct": 0.87
  },
  "conservative": {
    "limitPrice": 3.055,
    "multiplier": "0.50×",
    "capTier": "Mid-cap (INJ, RENDER, SUI, UNI)",
    "sweepDepthPct": 1.45
  },
  "deep": {
    "limitPrice": 3.033,
    "multiplier": "0.75×",
    "capTier": "Small-cap (FET, ATOM, newer tokens)",
    "sweepDepthPct": 2.16
  },
  "suggestedStop": 2.988,
  "note": "Select tier based on token market cap. Stop is placed below deep sweep regardless of tier chosen."
}
```

---

## 5. Scanner UI — Display Format

In the token card or signal panel, render the sweep block as a simple table below the entry zone:

```
┌─────────────────────────────────────────────────────┐
│  SWEEP ESTIMATE  (Visible Low: $3.100 | ATR: $0.090) │
├────────────┬────────────┬──────────────────────────┤
│  Tier      │  Limit     │  For                     │
├────────────┼────────────┼──────────────────────────┤
│  Shallow   │  $3.073    │  Large-cap (SOL, LINK)   │
│  Mid ✓     │  $3.055    │  Mid-cap (INJ, RENDER)   │
│  Deep      │  $3.033    │  Small-cap (FET, ATOM)   │
├────────────┼────────────┼──────────────────────────┤
│  Stop Loss │  $2.988    │  Below all sweep tiers   │
└─────────────────────────────────────────────────────┘
```

The trader scans the table, identifies the token's approximate cap tier, and places the limit at that row's price. No calculation required at trade time.

---

## 6. Implementation Steps (App.jsx)

### Step 1 — Compute ATR in the data layer

```javascript
function computeATR(candles, period = 14) {
  // candles = array of { high, low, close } sorted oldest first
  const trueRanges = candles.slice(1).map((c, i) => {
    const prevClose = candles[i].close;
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
  });
  const recent = trueRanges.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}
```

### Step 2 — Identify visible low

```javascript
function getVisibleLow(candles, lookbackCandles = 24) {
  // Uses the lowest low of the last N 1H candles (default: last 24H)
  const recent = candles.slice(-lookbackCandles);
  return Math.min(...recent.map(c => c.low));
}
```

### Step 3 — Build the sweepEstimate object

```javascript
function buildSweepEstimate(candles1H) {
  const atr = computeATR(candles1H);
  const visibleLow = getVisibleLow(candles1H);

  const shallow     = visibleLow - (atr * 0.30);
  const conservative = visibleLow - (atr * 0.50);
  const deep        = visibleLow - (atr * 0.75);
  const stop        = deep - (atr * 0.25);

  const pct = (base, target) =>
    (((base - target) / base) * 100).toFixed(2);

  return {
    visibleLow: +visibleLow.toFixed(5),
    atr1H: +atr.toFixed(5),
    shallow: {
      limitPrice: +shallow.toFixed(5),
      multiplier: "0.30×",
      capTier: "Large-cap (SOL, LINK, AVAX)",
      sweepDepthPct: +pct(visibleLow, shallow)
    },
    conservative: {
      limitPrice: +conservative.toFixed(5),
      multiplier: "0.50×",
      capTier: "Mid-cap (INJ, RENDER, SUI, UNI)",
      sweepDepthPct: +pct(visibleLow, conservative)
    },
    deep: {
      limitPrice: +deep.toFixed(5),
      multiplier: "0.75×",
      capTier: "Small-cap (FET, ATOM, newer tokens)",
      sweepDepthPct: +pct(visibleLow, deep)
    },
    suggestedStop: +stop.toFixed(5),
    note: "Select tier based on token market cap. Stop placed below deep sweep regardless of tier."
  };
}
```

### Step 4 — Add to JSON payload

In the token analysis function where you build the output object:

```javascript
tokenPayload.sweepEstimate = buildSweepEstimate(token.candles1H);
```

### Step 5 — Add to Claude prompt context

In the system prompt or JSON description block sent to Claude, add:

```
sweepEstimate: Three ATR-based limit order price tiers for liquidity sweep entry.
Trader selects tier based on market cap. suggestedStop applies to all tiers.
```

---

## 7. Journal Fields to Add

When a sweep-entry trade is logged, record:

| Field | Example | Purpose |
|---|---|---|
| `sweepTierUsed` | `conservative` | Which tier was selected |
| `sweepLimitPlaced` | 3.055 | Actual limit order price |
| `sweepFilled` | true / false | Did the order fill |
| `sweepFillPrice` | 3.057 | Actual fill (may differ slightly) |
| `sweepDepthActual` | 1.39% | How far price swept in reality |
| `tierAccuracy` | correct / too_shallow / too_deep | Did chosen tier match actual sweep |

After 20 filled trades, `tierAccuracy` distribution will tell you whether the ATR multipliers need calibration per token.

---

## 8. Validation Criteria

Before treating sweep estimates as production-grade:

- Minimum **15 filled sweep orders** logged with `tierAccuracy`
- `too_shallow` rate (stop hit after fill) should be **< 20%**
- `too_deep` rate (no fill, price reversed above limit) should be **< 30%**
- If either threshold fails, adjust the tier multipliers by 0.1× and re-evaluate

---

## 9. What This Does NOT Change

- The 8-gate checklist still runs first — sweep estimate is only relevant after a valid setup is confirmed
- BTC hard block, ATR exhaustion, and session transition rules all apply before limit placement
- The sweep entry does not replace candle confirmation — it determines WHERE the limit sits, not WHETHER to trade
- OCO (SL + TP) still required on Binance at order placement
- Breakeven stop management after TP1 remains a manual step (price alert required)

---

*Pairs with: `crypto_trading_playbook.docx`, `session_transition_project_knowledge.md`, `signal_volume_gate_project_knowledge.md`*  
*Next review: After 15 filled sweep-entry trades with tierAccuracy logged.*
