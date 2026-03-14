# ◈ Crypto Playbook Scanner

Pre-screens altcoins using your trading playbook rules so you only spend AI tokens on tokens that actually have setups.

## What It Does

- Pulls real-time data from **Binance public API** (no API key needed)
- Calculates RSI(14), 200 EMA, volume ratio, support/resistance, FVG, candlestick patterns
- Checks BTC health before approving any altcoin trade
- Scores each token and highlights which ones are worth screenshotting for Claude AI analysis
- Auto-refreshes every 5 minutes
- Mobile-first dark UI
- Customizable watchlist (add/remove tokens via settings)

## Deploy to Vercel (Free — 3 minutes)

### Option A: GitHub + Vercel (Recommended)

1. **Create a GitHub repo**
   - Go to [github.com/new](https://github.com/new)
   - Name: `crypto-scanner` → Create repository

2. **Push this code**
   ```bash
   cd crypto-scanner
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/crypto-scanner.git
   git push -u origin main
   ```

3. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com) → Sign up with GitHub
   - Click "Add New Project"
   - Import your `crypto-scanner` repo
   - Framework: **Vite** (auto-detected)
   - Click **Deploy**
   - Done! Your URL: `https://crypto-scanner-xxx.vercel.app`

### Option B: Vercel CLI (Fastest)

```bash
npm i -g vercel
cd crypto-scanner
npm install
vercel
```

Follow the prompts. Takes 60 seconds.

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

## Customizing Tokens

Click the ⚙ gear icon in the app header to:
- Add any Binance-listed token (e.g., DOGE, XRP, DOT)
- Remove tokens you don't want to track
- Changes persist in localStorage

## How the Scoring Works

| Signal | Points | Condition |
|--------|--------|-----------|
| RSI 1H in 30-40 | +30 | Primary buy zone |
| RSI 1H oversold (<30) | +20 | Deep oversold |
| RSI 1H neutral (40-50) | +15 | Acceptable |
| RSI 1H overbought (>70) | -20 | Too late |
| Near support level | +20 | Within 2% of swing low |
| Near 200 EMA | +10 | Within 2% of EMA |
| Volume above average | +15 | 1.2x+ recent vs 20-period |
| Bullish candle at support | +15 | Engulfing/hammer at key level |
| FVG reclaim zone | +20 | Price in fair value gap |
| BTC dumping | -40 | BTC 4H change < -3% |
| Setup A confirmed | +10 | All primary criteria met |

**Score ≥ 40 + BTC safe → Worth screenshotting for AI analysis**

## Session Transition Protection

Prevents losses from session-transition timing by adding four protection layers:

### ATR Exhaustion Filter
Measures how much of BTC's expected daily range (ATR-14 on 1D) has been consumed. Blocks entries when the daily move is exhausted.

| Exhaustion % | Label | Action |
|---|---|---|
| 0–40% | FRESH | Normal entry rules |
| 40–60% | MODERATE | Flagged in verdict |
| 60–80% | STRETCHED | Confidence forced to LOW, reduced TP targets |
| 80%+ | EXHAUSTED | Hard no-entry gate |

### Pre-US Hard Cutoff Timer
Time-based warning system for the US session transition danger window:

| Time (UTC) | Level | Action |
|---|---|---|
| Before 11:00 | CLEAR | No warning |
| 11:00–12:00 | APPROACHING | Informational note |
| 12:00–12:30 | IMMINENT | Confidence downgrade |
| 12:30–14:00 | DANGER_ZONE | Hard no-entry gate |
| After 14:00 | US_ACTIVE | Normal US session rules |

On macro event days (FOMC/CPI/NFP), DANGER_ZONE extends to start at 12:00 UTC.

### Session-Aware TP Adjustment
When ATR exhaustion exceeds 50%, TP targets are automatically reduced:

| Condition | TP1 | TP2 | Stop |
|---|---|---|---|
| Standard (<50%) | 3.5% | 5.0% | 2.0% |
| Reduced (50–70%) | 2.5% | 4.0% | 2.0% |
| Minimal (70–80%) | 2.0% | 3.0% | 1.5% |

### Accumulation/Distribution Phase Detector
Classifies BTC's current microstructure by analyzing the last 12 hourly candles for accumulation (small bodies, low volume, RSI 35-55) vs distribution (long upper wicks, volume spikes on red candles, RSI 60-70) signals.

Labels: ACCUMULATION → LIKELY_ACCUMULATION → NEUTRAL → LIKELY_DISTRIBUTION → DISTRIBUTION

Distribution phases downgrade setup confidence; this is observational, not a hard gate.

## Signal Volume Gate

The signal volume gate validates buyer conviction on the confirmation candle using **context-aware comparison**:

### Primary Method: Relative-to-Dip Comparison
Instead of comparing signal candle volume against the 20-period MA (which gets inflated during bull runs), the gate compares against the average volume of the **preceding dip candles**:

1. Collects 2-5 consecutive dip candles (close ≤ open, includes dojis)
2. Weights the most recent 3 candles at 60% if 4-5 are collected
3. Applies session-specific thresholds:

| Session | Threshold | Rationale |
|---------|-----------|-----------|
| Asian (00-08 UTC) | >1.05× | Low bar — any buyer re-engagement counts |
| London (08-16 UTC) | >1.15× | Standard — reliable volume |
| Overlap (13-16 UTC) | >1.20× | Highest bar — peak liquidity |
| US (13-22 UTC) | >1.15× | Standard |
| OFF-HOURS | Skip | No entries permitted |

### Secondary Method: Volume Trend Rising
If signal volume is below dip average, the gate passes with **LOW confidence** if volume is rising across the last 3 candles (≥66% of transitions rising).

### Fallback Method: Median Comparison
If insufficient dip context exists (flat market, no prior dip), falls back to median-based 20-period comparison (outlier-resistant).

### Export Fields
The JSON export includes detailed signal volume context:
```json
"volume": {
  "signalVolumeOk": true,
  "signalVolumeMethod": "dip_avg_confirmed",
  "signalVolumeConfidence": "HIGH",
  "dipAvgVolume": "42500",
  "signalVsAip": "1.34",
  "signalVolumeNote": "Signal vol 134% of dip avg — buyers confirmed"
}
```

## Workflow

1. Open scanner on your phone
2. Check BTC status (green/red banner)
3. See which tokens are in the "Screenshot for AI" section
4. Open TradingView → screenshot those tokens (1H + 4H with RSI & volume)
5. Upload to your Claude Project → get exact trade signal

## Tech Stack

- React 18 + Vite
- Binance public REST API (no authentication)
- Canvas for charts
- Zero external UI libraries
- Mobile-first responsive design
