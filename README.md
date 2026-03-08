# ◈ Crypto Playbook Scanner

Pre-screens altcoins using your trading playbook rules so you only spend AI tokens on tokens that actually have setups.

## What It Does

- Pulls real-time data from **Binance public API** (no API key needed)
- Calculates technical indicators: RSI(14/4H), MACD, EMA(20/50/200), Bollinger Bands, ATR, ROC
- Detects candlestick patterns with **proportionality validation** (body vs ATR)
- Identifies **liquidity sweeps** (stop hunts) at support/resistance and Asian range levels
- Tracks **Asian session range** for breakout/breakdown detection
- Analyzes **volume polarity** (accumulation vs distribution)
- Monitors **volatility regime** (normal/elevated/extreme)
- Checks **BTC health** with enhanced regime filter (4H change, 12H rolling drop, EMA breakdown)
- **Session-aware analysis**: Adjusts volume thresholds and stop buffers for Asian/London/US sessions
- **Macro calendar integration**: FOMC, CPI, NFP dates with trading blackout warnings
- **Fear & Greed Index** + **BTC Dominance** tracking
- **Risk news scanning** with keyword-based alert flagging
- Scores each token and highlights which ones are worth screenshotting for Claude AI analysis
- **Playbook Checklist**: 7-point validation system with FORMING/CONFIRMED status
- Auto-refreshes every 5 minutes
- Mobile-first dark UI
- Customizable watchlist (add/remove tokens via settings)
- Optional Firebase sync for real-time data sharing

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

### Narrative Tags

Tokens are categorized by sector for narrative tracking:
- **AI**: TAO, RENDER, NEAR, FET, ARKM, WLD
- **DeFi**: UNI, AAVE, INJ, MKR, PENDLE, CRV
- **L1**: ETH, SOL, AVAX, SUI, NEAR, APT, ATOM, TIA
- **L2**: ARB, OP, IMX
- **RWA**: LINK, ONDO, MKR
- **Oracle**: LINK
- **Infra**: ETH, RENDER, ARB, OP, ATOM, TIA, ARKM
- **Gaming**: IMX
- **Meme**: DOGE

## How the Scoring Works

### Primary Signals

| Signal | Points | Condition |
|--------|--------|-----------|
| RSI 1H in 30-40 | +25 | Primary buy zone |
| RSI 1H neutral (40-50) | +10 | Acceptable |
| RSI 1H deeply oversold (<30) | +5 | Knife-catching risk, requires confirmation |
| RSI 1H warm (>60) | -10 | Getting late |
| RSI aligned oversold (1H+4H both <40) | +15 | Multi-TF confirmation |
| RSI aligned overbought (1H+4H both >65) | -15 | Avoid |
| Near validated support (2+ touches, 10+ candles old) | +15 | Strong structure |
| Near fresh support (unvalidated) | +5 | Needs AI visual confirmation |
| Near 200 EMA (±2%) | +10 | Mean reversion level |
| Volume climax at support | +10 | Accumulation signal |
| Volume climax at resistance | -5 | Distribution risk |

### Session-Adjusted Volume

Volume is normalized against expected levels for the current session:

| Session | Volume Multiplier | Stop Buffer | Notes |
|---------|------------------|-------------|-------|
| Asian (00-08 UTC) | 0.5x | +0.3% | Relaxed thresholds, TP1 hits at London open |
| London (08-16 UTC) | 1.2x | Standard | Trend-setting session |
| London/US Overlap (13-16 UTC) | 1.8x | Standard | Highest liquidity, strictest rules |
| US (13-22 UTC) | 1.5x | Standard | Strong trends, watch for macro news |
| Off-Hours | 0.4x | +0.5% | Reduce position 50% or skip |

Volume grades: **CLIMAX** (≥2.0x), **STRONG** (≥1.2x), **ADEQUATE** (≥0.8x), **WEAK** (≥0.5x), **DEAD** (<0.5x)

### Advanced Indicators

| Indicator | Signal | Points |
|-----------|--------|--------|
| MACD bullish crossover | Confirmed reversal | +15 |
| MACD bullish acceleration | Momentum building | +8 |
| MACD bearish crossover | Reversal down | -10 |
| Dip in uptrend (EMA20 > EMA50) | Trend continuation | +10 |
| Dip in downtrend | Knife-catching risk | -10 |
| Bollinger lower band + RSI <40 (uptrend) | Mean reversion | +15 |
| Bollinger squeeze | Breakout imminent | +5 |
| Momentum improving (ROC) | Building strength | +10 |
| Liquidity sweep reclaimed | Stop hunt reversal | +15 |
| Liquidity sweep failed | Continuation risk | -5 to +5 |

### Pattern Validation

Candlestick patterns are validated for:
- **Confirmation strength**: Requires follow-through candle
- **Proportionality**: Body must be ≥1.5x ATR for HIGH strength
- **Thrust reclaim**: If last 3 candles dropped >5%, reversal must reclaim ≥30%

Patterns: Bullish Engulfing, Hammer, Morning Star, Shooting Star, Bearish Engulfing

### Hard Rejection Gates

Tokens are automatically rejected if:
- BTC dumping (4H change < -3% OR 12H rolling drop >4%)
- RSI overbought (>70)
- Dead volume (session-adjusted <0.5x without climax)

### Setup Classification

| Setup | Criteria | Status |
|-------|----------|--------|
| **Setup A** | RSI 30-40 + At Support + Candle Confirmed + Volume OK + BTC Stable | FORMING / CONFIRMED |
| **Setup B** | FVG reclaim zone + RSI <50 + BTC Stable | FORMING / CONFIRMED |
| **Setup C** | RSI <60 + 24H change <2% + BTC Stable + Score ≥40 | Momentum Candidate |

### Playbook Checklist (7 Points)

1. ✅ BTC not dumping
2. ✅ Daily bias longs (BTC stable/green, not below all EMAs)
3. ✅ Active narrative tagged
4. ✅ Volume above average (session-adjusted ≥0.8x)
5. ✅ No major events (macro blackout window clear)
6. ✅ RSI in zone (30-40)
7. ✅ Candle confirmation (HIGH strength, proportional)

**Verdict**: ALL PASS = valid entry | 5-6 pass = FORMING | <5 pass = WAIT

### External Factors Verdict

| Condition | Verdict | Action |
|-----------|---------|--------|
| FOMC/CPI/NFP today | 🚫 NO TRADE | 12H blackout window |
| FOMC/CPI/NFP tomorrow | ⚡ CAUTION | Reduce to 50% position |
| 3+ risk news headlines | ⚠ HIGH RISK | Verify before entering |
| Fear & Greed ≤20 | 😱 EXTREME FEAR | Raise confirmation bar |
| Fear & Greed ≥85 | 🤑 EXTREME GREED | Tighten stops |
| Clear | ✅ CLEAR | Proceed to chart analysis |

**Score ≥40 + BTC safe + Checklist passes → Worth screenshotting for AI analysis**

## Workflow

1. Open scanner on your phone
2. Check **External Factors** panel (BTC status, F&G, macro calendar, risk news)
3. See which tokens are in the **"Screenshot for AI"** section (Setup CONFIRMED or FORMING)
4. Open TradingView → screenshot those tokens (1H + 4H with RSI, volume, EMAs)
5. Upload to your Claude Project with the **AI Export** payload → get exact trade signal

## AI Export Feature

Click the 📤 export button on any token to generate a structured JSON payload containing:
- Session context (current session, next open, transition risks)
- BTC regime analysis (4H change, 12H dump, EMA status)
- All technical indicators (RSI, MACD zone, BB %B, ATR, ROC)
- Volume analysis (raw, session-adjusted, polarity, climax detection)
- Structure details (pattern, support/resistance, FVG, liquidity sweeps)
- Asian range data (high/low, breakdown status)
- Setup classification with missing criteria
- Playbook checklist results
- Trade levels (entry, stop, TP1/TP2, R:R ratios)

Paste this payload into Claude along with your chart screenshots for precise trade analysis.

## Tech Stack

- React 18 + Vite
- Binance public REST API (no authentication)
- CoinGecko API (global market data)
- Alternative.me API (Fear & Greed Index)
- CryptoCompare API (news feed)
- Canvas for charts
- Zero external UI libraries
- Mobile-first responsive design
- Optional Firebase real-time sync

## Key Features Summary

| Category | Features |
|----------|----------|
| **Technical Analysis** | RSI (1H/4H), MACD with zones, EMA alignment, Bollinger Bands, ATR, ROC |
| **Pattern Recognition** | Candlestick patterns with proportionality validation, FVG detection |
| **Structure Analysis** | Support/resistance clustering, liquidity sweeps, Asian range |
| **Volume Analysis** | Session-adjusted volume, volume polarity, climax detection |
| **Market Context** | BTC regime filter, multi-TF RSI alignment, volatility regime |
| **External Factors** | Fear & Greed, BTC Dominance, Macro calendar, Risk news scanning |
| **Session Awareness** | Asian/London/US session detection, transition risk warnings |
| **Trade Validation** | 7-point playbook checklist, Setup A/B/C classification |
| **Risk Management** | Hard rejection gates, signal candle volume requirement |
