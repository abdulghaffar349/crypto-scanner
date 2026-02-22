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
