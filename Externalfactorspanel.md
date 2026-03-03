# ExternalFactorsPanel — Claude Code Implementation Guide

## Project Context

This document is written for Claude Code. Before making any changes, read this fully.

### What This Feature Does

The `ExternalFactorsPanel` is a pre-trade intelligence module for the crypto spot trading scanner. It automates the external factors checklist from the trading playbook — specifically the "No Major Events" and market sentiment checks that previously required manual research across multiple websites before every trade.

It fetches live data from three free public APIs (no keys required) and combines it with hardcoded 2026 macro event calendars to produce a single go/no-go verdict before the trader looks at any chart.

### Why It Exists

The trader's playbook (Section 2, Pre-Trade Checklist) requires checking:
- BTC market regime
- Active narrative
- Volume confirmation
- No major events within 12H
- Emotional state

The scanner already handles BTC regime, narrative, and volume via technical analysis. This panel handles the "no major events" check automatically and adds Fear & Greed + BTC Dominance as supplementary context. The goal is to reduce pre-trade research from 10-15 minutes to a 30-second glance.

---

## Files Involved

```
src/
├── App.jsx                        ← Main scanner (DO NOT break this)
├── ExternalFactorsPanel.jsx       ← NEW file to add (provided)
└── ...other existing files
```

The `ExternalFactorsPanel.jsx` file is a self-contained React component. It has zero dependencies on the existing scanner's state, props, or data fetching. It runs completely independently.

---

## Step 1 — Add the File

Copy `ExternalFactorsPanel.jsx` into your `src/` directory (same folder as `App.jsx`).

```bash
cp ExternalFactorsPanel.jsx src/ExternalFactorsPanel.jsx
```

No npm installs required. The component uses only:
- `react` (already in your project)
- Native browser `fetch` API (no axios, no libraries)

---

## Step 2 — Import Into App.jsx

Open `App.jsx` and add the import at the top with your other imports:

```jsx
import ExternalFactorsPanel from './ExternalFactorsPanel';
```

---

## Step 3 — Place the Component

Find the main return/render in `App.jsx`. Place `<ExternalFactorsPanel />` **above** the token scanner grid, so the trader sees the external verdict before reviewing token setups.

### Example placement:

```jsx
return (
  <div className="app-container">

    {/* ─── EXTERNAL FACTORS — always shown at top ─── */}
    <ExternalFactorsPanel />

    {/* ─── existing scanner content below ─── */}
    <div className="scanner-header">
      ...your existing BTC health check, controls, etc.
    </div>

    <div className="token-grid">
      ...your existing token cards
    </div>

  </div>
);
```

If the existing scanner already has a dashboard layout with columns or a sidebar, the panel fits best as a **full-width row above the token grid** or as a **left/right sidebar panel** alongside the tokens. Use whichever matches the current layout structure.

---

## Step 4 — Update the Watchlist

At the top of `ExternalFactorsPanel.jsx`, find the `WATCHLIST` constant and update it to match the trader's current active watchlist:

```javascript
const WATCHLIST = [
  { symbol: "RENDER", cgId: "render-token",         ccSymbol: "RNDR" },
  { symbol: "INJ",    cgId: "injective-protocol",   ccSymbol: "INJ"  },
  { symbol: "ATOM",   cgId: "cosmos",               ccSymbol: "ATOM" },
  { symbol: "AVAX",   cgId: "avalanche-2",          ccSymbol: "AVAX" },
  { symbol: "SUI",    cgId: "sui",                  ccSymbol: "SUI"  },
  { symbol: "LINK",   cgId: "chainlink",            ccSymbol: "LINK" },
  { symbol: "SOL",    cgId: "solana",               ccSymbol: "SOL"  },
];
```

**How to find the correct `cgId`:** Go to `coingecko.com`, search the token, and look at the URL. For example: `coingecko.com/en/coins/render-token` → `cgId` is `render-token`.

**How to find the correct `ccSymbol`:** This is the ticker symbol used by CryptoCompare. It's almost always the standard exchange ticker (BTC, ETH, INJ, RNDR, etc.). Exception: RENDER uses `RNDR` on most exchanges.

---

## Step 5 — Verify It Works

After adding the component, run the dev server and confirm:

1. The panel renders above the token scanner without layout breakage
2. The Fear & Greed gauge loads within a few seconds
3. The macro calendar shows upcoming FOMC/CPI/NFP dates
4. The BTC Dominance % loads and shows the bar
5. The news feed loads and the tabs (Risk Headlines / Watchlist News) both work
6. The Pre-Trade Checklist at the bottom shows pass/fail status
7. The Refresh button triggers a reload of all data
8. Auto-refresh runs silently every 15 minutes (no user action needed)

---

## API Details (for debugging)

All three APIs are free, public, and require no authentication headers.

| Data | API | Endpoint |
|---|---|---|
| Fear & Greed Index | alternative.me | `https://api.alternative.me/fng/?limit=3` |
| Crypto news | CryptoCompare | `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=30` |
| BTC Dominance | CoinGecko | `https://api.coingecko.com/api/v3/global` |

If any API call fails, the component fails silently — it catches the error and shows loading state. It will not crash the scanner.

**CoinGecko rate limit:** The free tier allows ~30 calls/minute. Since this panel only calls once on mount and then every 15 minutes, this is never an issue.

---

## Macro Calendar Maintenance

The FOMC, CPI, and NFP dates are hardcoded arrays at the top of the file. They cover all of 2026. 

At the start of each new year, update these three arrays:

```javascript
const FOMC_DATES_2026 = [ ... ]   // → rename to FOMC_DATES_2027 and update
const CPI_DATES_2026  = [ ... ]   // → rename to CPI_DATES_2027 and update
const NFP_DATES_2026  = [ ... ]   // → rename to NFP_DATES_2027 and update
```

FOMC dates: `federalreserve.gov/monetarypolicy/fomccalendars.htm`  
CPI dates: `bls.gov/schedule/news_release/cpi.htm`  
NFP dates: `bls.gov/schedule/news_release/empsit.htm`

---

## Verdict Logic (Do Not Change Without Reason)

The verdict banner at the top follows playbook Section 2 rules exactly:

| Condition | Verdict | Playbook Rule |
|---|---|---|
| Macro event TODAY | `NO TRADE` 🚫 | "No FOMC/CPI within 12H of entry" |
| Macro event tomorrow | `CAUTION` ⚡ | Reduce to 50% position |
| 3+ high-risk news items | `HIGH RISK` ⚠ | Verify before entering |
| F&G ≤ 20 | `EXTREME FEAR` | Raise confirmation bar |
| F&G ≥ 85 | `EXTREME GREED` | Tighten stops |
| Everything clear | `CLEAR` ✅ | Proceed to chart analysis |

The order of checks matters — macro events override everything else. Do not reorder them.

---

## What Is NOT Automated (Intentional)

Two checklist items remain manual and are flagged with a `○` indicator rather than auto pass/fail:

1. **Token unlock check** — No free API provides reliable vesting schedule data. The panel provides one-click links to `token.unlocks.app` for each watchlist token. This takes ~30 seconds per token to check manually.

2. **Emotional state (1-10)** — This is a self-assessment per playbook Section 6.2. It cannot be automated. The checklist item is a reminder only.

If a future free unlock API becomes available, add it as a fourth API call in the `fetchAll` function and update the `UnlockCheckerCard` component to show live data.

---

## Styling Notes

The component uses inline styles only — no CSS files, no Tailwind classes, no CSS modules. This means it will not conflict with any existing stylesheet in the project.

The design uses:
- Background: `#0a0e17` (dark navy, matches terminal aesthetic)
- Font: `IBM Plex Mono` with `Courier New` fallback (monospace throughout)
- Accent colors: `#22c55e` (green = clear), `#eab308` (yellow = caution), `#ef4444` (red = blocked)

If the existing scanner uses a different color scheme, update the `styles` object at the bottom of `ExternalFactorsPanel.jsx`. All colors are defined there in one place.

---

## Testing Checklist for Claude Code

After implementation, verify each of these manually:

- [ ] Component renders without console errors
- [ ] No existing scanner functionality is broken
- [ ] Fear & Greed gauge displays correctly (semicircle with number)
- [ ] Macro calendar shows correct upcoming dates
- [ ] "Expand" toggle on Macro Calendar works
- [ ] BTC Dominance bar fills proportionally
- [ ] News feed loads and tabs switch correctly
- [ ] Risk headlines (red keywords) are flagged correctly
- [ ] Watchlist news tab shows only relevant tokens
- [ ] Token unlock buttons open correct token.unlocks.app pages
- [ ] Pre-Trade Checklist shows correct pass/fail for each item
- [ ] Refresh button reloads all data
- [ ] Overall verdict banner color matches the worst condition found
- [ ] Layout does not break on mobile/narrow screens (min-width: 320px)

---

## Common Issues

**"Network error" on news fetch**  
CryptoCompare's free news endpoint sometimes returns CORS errors in local dev. If this happens in production (deployed build), it's not an issue. For local dev, either use a CORS proxy or skip the news fetch temporarily by commenting out that block in `fetchAll`.

**Fear & Greed shows "—"**  
The alternative.me API occasionally has downtime. The component handles this gracefully — it will show "—" and the verdict will skip that check rather than crash.

**BTC Dominance not loading**  
CoinGecko free tier has rate limits. If you're refreshing rapidly during development, wait 60 seconds and try again.

**Dates showing wrong events**  
The arrays use `YYYY-MM-DD` format in UTC. If the trader's local timezone is UTC+5 (Pakistan), events may appear a day early. This is acceptable — being one day early on a warning is safer than being late.