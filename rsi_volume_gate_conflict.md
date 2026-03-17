# Problem Statement: RSI-Volume Gate Sequential Incompatibility

**Date Identified:** 2026-03-17  
**Discovered Via:** OPN/USDT live trade analysis  
**Affects:** Setup A (RSI + Structure), Setup B (FVG Reclaim)  
**Status:** Confirmed structural flaw — requires playbook and scanner update

---

## 1. The Problem

### What the playbook currently requires simultaneously:
- RSI(14) on 1H in the 30–40 zone
- Volume on signal candle above the 20-period volume MA

### Why these two gates cannot be satisfied at the same time:

The natural sequence of every valid dip-and-recovery looks like this:

```
PHASE 1 — SELLERS ACTIVE
Price falling → RSI drops into 30-40 zone
Volume is HIGH on red candles (sellers driving the move)

PHASE 2 — TRANSITION
Price stabilises at support
Volume drops (sellers exhausted, buyers not yet active)
RSI still in zone

PHASE 3 — BUYERS RETURN
A green candle prints with rising volume
RSI immediately moves UP as price recovers
Volume is high on the green candle

RESULT:
At Phase 2 → RSI in zone, but volume too low (no signal candle yet)
At Phase 3 → Volume confirms on green candle, but RSI has already left the zone
```

These two gates are **sequentially exclusive by market structure.** The moment volume confirms a buyer return on a green candle, RSI has already been pushed above 40. This is not a calibration problem — it is a physics problem.

### Real example — OPN/USDT, 2026-03-17:

| Time | RSI(14) | 1H Volume | Volume vs MA10 | Candle | Gate Status |
|---|---|---|---|---|---|
| 7:57 | 39.2 | 51M (red) | Above | Red | RSI ✅ Volume ❌ (wrong direction) |
| 9:00 | 42.1 | 490K (green) | Far below | Green | RSI ❌ Volume ❌ |
| 9:56 | 46.1 | 61M (green) | Above | Green | RSI ❌ Volume ✅ |

At no point in the entire sequence were both gates simultaneously satisfiable using MA-based volume comparison. Yet the 9:56 candle was a genuine buyer return signal — it just arrived after RSI moved.

---

## 2. Root Cause

The volume gate uses the **wrong benchmark.**

Comparing signal candle volume against the **20-period MA** includes the prior bull run candles in the average. Those candles had extremely high volume. After a correction, dip candles naturally have low volume. When buyers return, the green signal candle will have higher volume than the dip — but still far below the bull run MA.

The MA-based benchmark creates a **false standard** that no genuine recovery signal can meet while RSI is still in the entry zone.

The correct benchmark is not the rolling MA — it is the **dip candles themselves.**

If the signal candle has more volume than the preceding dip candles, buyers have genuinely shown up relative to where the market has been. That is the meaningful comparison.

---

## 3. The Solution

### Replace the volume gate benchmark — no change to the gate itself

The gate stays: volume must confirm buyer presence on the signal candle.

What changes: how "confirm" is measured.

**Old measurement (remove):**
> Signal candle volume > 20-period volume MA

**New measurement (replace with):**
> Signal candle volume is visibly greater than the average of the preceding 3–5 dip candles (candles where close ≤ open)

This is already partially implemented in the scanner via `signalVsAip` (signal volume divided by dip average volume). The fix is to make this the **primary visual check** and retire the MA comparison for this specific gate.

---

## 4. How Claude Should Apply This During Visual Chart Confirmation

### Old visual check (retire this):
Look at the volume bar vs the MA line on the chart. If bar is below MA line → fail.

### New visual check (use this instead):
Look at the 3–5 red candles immediately preceding the signal candle. Compare their volume bars to the current green candle's volume bar. If the green candle bar is taller than the average of the red dip candle bars → volume gate passes.

### What to ignore:
The MA line on the volume panel is irrelevant for this gate after a bull run. Do not reference it for Setup A signal candle volume checks.

### RSI gate adjustment for this fix:
Because buyer volume arrival pushes RSI up, a minor RSI breach (40–43 range) at the moment of volume confirmation should be treated as acceptable when:
- The signal candle is clearly green with body above dip average volume
- RSI was confirmed below 40 within the prior 1–2 candles
- The bounce from support is less than 1% (price has not moved far yet)

This is not RSI zone abandonment. It is acknowledging a 1–2 point lag between volume confirmation and RSI reading caused by the confirmation candle itself.

---

## 5. Impact on Scanner JSON Interpretation

The `signalVsAip` field in scanner JSON already captures this correctly. Claude should:

- When `signalVsAip > 1.15` during LONDON/US session → treat volume gate as passing regardless of raw MA comparison
- When `signalVsAip > 1.05` during ASIAN session → treat volume gate as passing
- When `signalVsAip` is null or below threshold → apply bridge logic (check if dip candles visually had low volume)
- Stop referencing `volume.raw` vs MA for the signal candle gate specifically

The `signalVolumeMethod: dip_avg_confirmed` path already implements this correctly. The problem was Claude applying the MA-based visual check instead of deferring to `signalVsAip`.

---

## 6. What Has NOT Changed

- The volume gate still exists — buyer confirmation is still required
- DEAD volume (0.30× session-adjusted) is still a hard rejection
- Volume polarity (polarityBearish) warning still applies — high volume on red candles is still a red flag
- The MA line is still useful for overall session volume context — just not for signal candle gate specifically
- All other 6 checklist gates remain unchanged
- RSI must have been in zone within the prior 2 candles — not just "near" the zone hours ago

---

## 7. Missed Trade Log — OPN 2026-03-17

| Field | Value |
|---|---|
| Token | OPN/USDT |
| Date | 2026-03-17 |
| Session | LONDON/US |
| Gate that blocked | volumeVisualCheck_MAConflict |
| signalVsAip at signal candle | 1.57 (above 1.15 threshold) |
| RSI at volume confirmation | 46.1 (just outside zone) |
| RSI 2 candles prior | 39.2 (confirmed in zone) |
| Peak move after | Monitoring |
| Correct verdict under fixed rule | Conditional entry ~0.3176 |
| Notes | Classic RSI-Volume sequential incompatibility. First documented live case. |

---

## 8. Implementation Priority

This is a **documentation and interpretation fix only** — no scanner code changes required.

The scanner already calculates `signalVsAip` correctly. The fix is:
1. Update Claude's visual chart interpretation rules (this document)
2. Update project knowledge to retire MA-based visual volume check
3. Update playbook wording on volume gate definition
4. Log all future cases where `signalVsAip > threshold` but raw MA check would have failed — build the sample for validation

Minimum sample before formalising as permanent rule: **15 live trades** where `signalVsAip` was used as primary gate.
