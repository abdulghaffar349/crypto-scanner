# signalVolumeOk Gate — Flaw Analysis & Implementation Guide

**Document Type:** Scanner Enhancement Proposal  
**Date:** 2026-03-12  
**Session Context:** Asian session — recurring gate failure investigation  
**Status:** Ready for implementation in App.jsx

---

## 1. Problem Statement

The `signalVolumeOk` gate is **systematically rejecting valid setups** that occur after 2-3 bullish days. This is not a signal failure — it is a measurement bias introduced by an inflated 20-period volume moving average.

The result: setups that are structurally sound and historically high-probability are being blocked at the final gate, producing a persistent pattern of 6/7 or 5/7 checklist scores with no path to CONFIRMED.

---

## 2. Root Cause Analysis

### 2.1 How the Gate Currently Works

```
signalVolumeOk = (currentSignalCandleVolume > volumeMA20)
```

The 20-period volume MA is calculated across all recent candles equally — bull run candles and dip candles weighted identically.

### 2.2 The Inflation Problem

When the preceding 2-3 days are bullish, high-volume bull candles dominate the MA window:

```
Example MA Window (20 candles):

Bull day candles:   150K, 180K, 200K, 160K, 170K, 155K
Transition candles: 90K, 85K, 80K, 75K
Dip candles:        45K, 40K, 42K, 38K, 44K
Normal candles:     60K, 65K, 58K, 62K, 55K

Resulting 20MA:     ~95K  ← artificially elevated
Current dip signal: ~45K  ← flagged FAIL

Reality:            The dip signal candle is perfectly normal.
                    The MA benchmark is broken.
```

### 2.3 Why Low Dip Volume is Actually Bullish

The playbook's volume principle is:

| Phase | Expected Volume | Interpretation |
|---|---|---|
| Bull run | HIGH | Buyers in control |
| Pullback / dip | LOW | Sellers NOT aggressive — healthy dip |
| Bounce / signal candle | HIGH | Buyers returning — entry trigger |

A low-volume dip is a **feature, not a bug.** High volume on a dip means aggressive selling — that is the dangerous scenario. The current gate penalizes the correct market condition.

### 2.4 The Compounding Asian Session Problem

During Asian session (00:00–08:00 UTC), the scanner applies a 0.5× volume multiplier for session normalization. However:

- Session-adjusted volume can grade as STRONG (1.4× adjusted)
- Yet the **raw signal candle** volume is still compared against the raw 20MA
- Two different measurement frameworks are being mixed

This means a token can simultaneously have:
- `volume.grade = "STRONG"` ✅
- `signalVolumeOk = false` ❌

These two fields are contradicting each other using the same underlying data.

---

## 3. The Correct Volume Sequence to Detect

A valid Setup A entry after a bullish period should look like this:

```
[Bull Day 1]    Volume: HIGH  → Candle: Green  ✅
[Bull Day 2]    Volume: HIGH  → Candle: Green  ✅
[Bull Day 3]    Volume: HIGH  → Candle: Green  ✅
[Dip Candle 1]  Volume: LOW   → Candle: Red    ✅ (healthy pullback)
[Dip Candle 2]  Volume: LOW   → Candle: Red    ✅ (healthy pullback)
[Dip Candle 3]  Volume: LOW   → Candle: Red    ✅ (healthy pullback)
[SIGNAL]        Volume: HIGH  → Candle: Hammer / Engulfing  ← ENTRY
```

The signal candle volume should be HIGH **relative to the dip candles**, not relative to the bull run candles. The current gate cannot make this distinction.

---

## 4. Proposed Fix — Three Implementation Options

### Option 1 (Recommended): Relative-to-Dip Comparison

Instead of comparing signal candle volume to the 20-period MA, compare it to the average volume of the **preceding N dip candles**.

**Logic:**
```javascript
// Identify the last N consecutive bearish/dip candles before signal
const DIP_LOOKBACK = 5;

function getDipCandleAvgVolume(candles, signalIndex) {
  const dipCandles = [];
  for (let i = signalIndex - 1; i >= 0 && dipCandles.length < DIP_LOOKBACK; i--) {
    if (candles[i].close <= candles[i].open) {
      // Red or doji candle = dip candle
      dipCandles.push(candles[i].volume);
    } else {
      break; // Stop at first green candle (end of dip)
    }
  }
  if (dipCandles.length < 2) return null; // Not enough dip context
  return dipCandles.reduce((a, b) => a + b, 0) / dipCandles.length;
}

// New gate logic
const dipAvgVolume = getDipCandleAvgVolume(candles, currentIndex);
const signalVolumeOk = dipAvgVolume
  ? currentVolume > dipAvgVolume * 1.1  // Signal must be 10% above dip avg
  : currentVolume > volumeMA20;          // Fallback to original if no dip context
```

**Threshold:** Signal candle volume > 110% of average dip candle volume

**Pros:** Directly measures buyer conviction relative to the pullback context  
**Cons:** Requires clean candle classification logic; edge cases at session boundaries

---

### Option 2: Volume Trend on Bounce (Simpler)

Check whether volume is **increasing** across the last 2-3 candles — a rising volume sequence signals growing buyer interest regardless of absolute level.

**Logic:**
```javascript
function volumeTrendRising(candles, signalIndex, lookback = 3) {
  const recentVolumes = candles
    .slice(signalIndex - lookback, signalIndex + 1)
    .map(c => c.volume);
  
  // Check if each volume is higher than the previous
  let risingCount = 0;
  for (let i = 1; i < recentVolumes.length; i++) {
    if (recentVolumes[i] > recentVolumes[i - 1]) risingCount++;
  }
  
  // Pass if at least 2 of 3 transitions are rising
  return risingCount >= Math.floor(lookback * 0.66);
}

const signalVolumeOk = volumeTrendRising(candles, currentIndex);
```

**Pros:** Simple, no lookback classification needed, session-agnostic  
**Cons:** Less precise — a token can have rising-but-still-low volume

---

### Option 3: Median-Based MA (Reduces Outlier Impact)

Replace the mean-based 20-period volume MA with a **median**, which is inherently resistant to outlier bull run spikes.

**Logic:**
```javascript
function volumeMedian(candles, period = 20) {
  const volumes = candles
    .slice(-period)
    .map(c => c.volume)
    .sort((a, b) => a - b);
  
  const mid = Math.floor(volumes.length / 2);
  return volumes.length % 2 !== 0
    ? volumes[mid]
    : (volumes[mid - 1] + volumes[mid]) / 2;
}

// Replace in gate check:
const signalVolumeOk = currentVolume > volumeMedian(candles, 20);
```

**Pros:** Easiest to implement — single function replacement  
**Cons:** Doesn't fully solve the problem; only reduces sensitivity to outliers

---

## 5. Recommended Compound Implementation

Use **Option 1 as primary** with **Option 2 as fallback**:

```javascript
function checkSignalVolumeOk(candles, currentIndex, volumeMA20) {
  const signalVolume = candles[currentIndex].volume;
  
  // Attempt Option 1: Relative-to-dip comparison
  const dipAvgVolume = getDipCandleAvgVolume(candles, currentIndex);
  
  if (dipAvgVolume && dipAvgVolume > 0) {
    // Primary: Is signal volume above dip average?
    const aboveDipAvg = signalVolume > dipAvgVolume * 1.1;
    // Secondary: Is volume trend rising?
    const trendRising = volumeTrendRising(candles, currentIndex, 3);
    
    return {
      pass: aboveDipAvg || trendRising,
      method: "relative_to_dip",
      ratio: (signalVolume / dipAvgVolume).toFixed(2),
      note: aboveDipAvg
        ? `Signal vol ${(signalVolume/dipAvgVolume*100).toFixed(0)}% of dip avg — buyers confirmed`
        : trendRising
          ? "Volume trend rising — buyer re-engagement"
          : "Signal vol below dip avg — no buyer confirmation"
    };
  }
  
  // Fallback Option 3: Median-based comparison
  return {
    pass: signalVolume > volumeMedian(candles, 20),
    method: "median_fallback",
    ratio: (signalVolume / volumeMedian(candles, 20)).toFixed(2),
    note: "Fallback: median comparison (insufficient dip context)"
  };
}
```

---

## 6. Scanner JSON Output Changes

Update the `setup.setupACriteria` and `setup.reasons` output to reflect the new method:

```json
"setupACriteria": {
  "signalVolumeOk": true,
  "signalVolumeMethod": "relative_to_dip",
  "signalVolumeRatio": "1.34",
  "signalVolumeNote": "Signal vol 134% of dip avg — buyers confirmed"
}
```

Add a new field to the `volume` object:
```json
"volume": {
  "raw": 0.65,
  "sessionAdjusted": 1.31,
  "grade": "STRONG",
  "dipAvgVolume": 42500,
  "signalVsAip": 1.34,
  "signalVolumeContext": "above_dip_avg"
}
```

---

## 7. Session-Specific Threshold Adjustments

Apply different thresholds by session to account for structural volume differences:

| Session | Threshold vs Dip Avg | Rationale |
|---|---|---|
| ASIAN (00-08 UTC) | > 1.05× | Low bar — any buyer re-engagement counts |
| LONDON (08-16 UTC) | > 1.15× | Standard — London volume is reliable |
| OVERLAP (13-16 UTC) | > 1.20× | Higher bar — peak liquidity, need real conviction |
| US (13-22 UTC) | > 1.15× | Standard |
| OFF-HOURS | N/A — no entries | Skip entirely |

```javascript
const SESSION_THRESHOLDS = {
  ASIAN: 1.05,
  LONDON: 1.15,
  OVERLAP: 1.20,
  US: 1.15,
  OFF_HOURS: null
};

const threshold = SESSION_THRESHOLDS[currentSession] ?? 1.15;
const signalVolumeOk = signalVolume > dipAvgVolume * threshold;
```

---

## 8. Validation Checklist Before Deploying

Before pushing this change to your live scanner, verify these cases manually:

| Test Case | Expected Result |
|---|---|
| Bull run → dip → signal candle above dip avg | `signalVolumeOk: true` |
| Bull run → dip → signal candle below dip avg | `signalVolumeOk: false` |
| No prior dip candles (first dip candle = signal) | Fallback to median comparison |
| Flat market, no bull run context | Fallback to median comparison |
| Asian session, signal vol 1.06× dip avg | `true` (above 1.05 threshold) |
| London session, signal vol 1.10× dip avg | `false` (below 1.15 threshold) |
| Volume trend rising even if below dip avg | `true` (trend fallback) |

---

## 9. Impact on Playbook Checklist Scoring

This change will NOT lower standards — it will make the measurement **contextually accurate**:

| Scenario | Current Gate | New Gate |
|---|---|---|
| Flat market, weak signal volume | ❌ FAIL | ❌ FAIL (unchanged) |
| Bull run dip, weak signal vs MA | ❌ FAIL (incorrect) | ✅ PASS (corrected) |
| Bull run dip, signal below dip avg | ❌ FAIL | ❌ FAIL (unchanged) |
| Genuine volume spike on signal | ✅ PASS | ✅ PASS (unchanged) |

Estimated impact: setups during post-bullish dips should move from **6/7 → 7/7** when buyer volume genuinely shows up relative to the pullback, which is the condition that actually matters for trade success.

---

## 10. Priority & Implementation Order

```
Phase 1 (Immediate):   Add getDipCandleAvgVolume() utility function
Phase 2 (Immediate):   Update checkSignalVolumeOk() with compound logic
Phase 3 (Same PR):     Add session threshold mapping
Phase 4 (Next PR):     Update JSON output fields for new volume context
Phase 5 (Ongoing):     Log signalVolumeMethod in trade journal for backtest
```

---

## 11. Backtest Logging Addition

Add this column to your trade journal to validate the fix over time:

| Field | Values | Purpose |
|---|---|---|
| `signalVolumeMethod` | `relative_to_dip` / `median_fallback` | Track which method fired |
| `signalVsAipRatio` | e.g. `1.34` | Quantify signal strength |
| `priorBullDays` | e.g. `2` | Context for post-analysis |
| `hitTP1` | `yes/no` | Outcome variable |

After 30+ trades, filter by `signalVolumeMethod = relative_to_dip` and check `hitTP1` rate vs. old failures. This is your validation data.

---

*Document prepared by Claude Sonnet 4.6 | March 2026*  
*Based on live scanner analysis session — Asian session volume gate investigation*