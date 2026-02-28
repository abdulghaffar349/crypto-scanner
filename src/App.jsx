import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { db, ref, set, onValue, FIREBASE_ENABLED } from "./firebase.js";

// ─── Token Config ───────────────────────────────────────────────
const DEFAULT_TOKENS = [
  { symbol: "BTCUSDT", name: "Bitcoin", role: "benchmark", narrative: [] },
  { symbol: "ETHUSDT", name: "Ethereum", role: "alt", narrative: ["Infra", "L1"] },
  { symbol: "SOLUSDT", name: "Solana", role: "alt", narrative: ["L1"] },
  { symbol: "LINKUSDT", name: "Chainlink", role: "alt", narrative: ["Oracle", "RWA"] },
  { symbol: "AVAXUSDT", name: "Avalanche", role: "alt", narrative: ["L1"] },
  { symbol: "UNIUSDT", name: "Uniswap", role: "alt", narrative: ["DeFi"] },
  { symbol: "AAVEUSDT", name: "Aave", role: "alt", narrative: ["DeFi"] },
  { symbol: "ONDOUSDT", name: "Ondo", role: "alt", narrative: ["RWA"] },
  { symbol: "TAOUSDT", name: "Bittensor", role: "alt", narrative: ["AI"] },
  { symbol: "RENDERUSDT", name: "Render", role: "alt", narrative: ["AI", "Infra"] },
  { symbol: "INJUSDT", name: "Injective", role: "alt", narrative: ["DeFi"] },
  { symbol: "SUIUSDT", name: "Sui", role: "alt", narrative: ["L1"] },
  { symbol: "NEARUSDT", name: "NEAR", role: "alt", narrative: ["AI", "L1"] },
  { symbol: "FETUSDT", name: "Fetch.ai", role: "alt", narrative: ["AI"] },
  { symbol: "APTUSDT", name: "Aptos", role: "alt", narrative: ["L1"] },
  { symbol: "MKRUSDT", name: "Maker", role: "alt", narrative: ["DeFi", "RWA"] },
  { symbol: "PENDLEUSDT", name: "Pendle", role: "alt", narrative: ["DeFi"] },
  { symbol: "CRVUSDT", name: "Curve", role: "alt", narrative: ["DeFi"] },
  { symbol: "ARBUSDT", name: "Arbitrum", role: "alt", narrative: ["L2", "Infra"] },
  { symbol: "OPUSDT", name: "Optimism", role: "alt", narrative: ["L2", "Infra"] },
  { symbol: "ATOMUSDT", name: "Cosmos", role: "alt", narrative: ["L1", "Infra"] },
  { symbol: "TIAUSDT", name: "Celestia", role: "alt", narrative: ["L1", "Infra"] },
  { symbol: "ARKMUSDT", name: "Arkham", role: "alt", narrative: ["AI", "Infra"] },
  { symbol: "WLDUSDT", name: "Worldcoin", role: "alt", narrative: ["AI"] },
  { symbol: "IMXUSDT", name: "Immutable", role: "alt", narrative: ["Gaming", "L2"] },
  { symbol: "DOGEUSDT", name: "Dogecoin", role: "alt", narrative: ["Meme"] },
];

const NARRATIVE_COLORS = {
  AI: "#a78bfa", RWA: "#f472b6", DeFi: "#34d399",
  L1: "#60a5fa", Oracle: "#fbbf24", Infra: "#fb923c",
  L2: "#38bdf8", Gaming: "#c084fc", Meme: "#facc15",
};

// ─── Technical Analysis Functions ────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcEMA(data, period) {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = data[0];
  const result = [ema];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine.slice(26), 9);
  const macdSlice = macdLine.slice(26);
  const cur = macdSlice.length - 1;
  const prev = macdSlice.length - 2;
  if (cur < 0 || prev < 0 || signalLine.length < 2) return null;
  const histogram = macdSlice[cur] - signalLine[signalLine.length - 1];
  const prevHistogram = macdSlice[prev] - signalLine[signalLine.length - 2];
  return {
    macd: macdSlice[cur], signal: signalLine[signalLine.length - 1], histogram,
    bullishCross: prevHistogram <= 0 && histogram > 0,
    bearishCross: prevHistogram >= 0 && histogram < 0,
    rising: histogram > prevHistogram,
  };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = parseFloat(candles[i][2]), l = parseFloat(candles[i][3]), pc = parseFloat(candles[i - 1][4]);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

function calcBollingerBands(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(slice.reduce((a, v) => a + (v - sma) ** 2, 0) / period);
  const upper = sma + stdDev * mult, lower = sma - stdDev * mult;
  const bandwidth = ((upper - lower) / sma) * 100;
  const percentB = upper !== lower ? (closes[closes.length - 1] - lower) / (upper - lower) : 0.5;
  let avgBandwidth = bandwidth;
  if (closes.length >= 70) {
    const bws = [];
    for (let i = period; i <= closes.length; i++) {
      const s = closes.slice(i - period, i);
      const m = s.reduce((a, b) => a + b, 0) / period;
      const sd = Math.sqrt(s.reduce((a, val) => a + (val - m) ** 2, 0) / period);
      bws.push(((m + sd * mult - (m - sd * mult)) / m) * 100);
    }
    avgBandwidth = bws.reduce((a, b) => a + b, 0) / bws.length;
  }
  return { upper, lower, sma, bandwidth, percentB, squeeze: bandwidth < avgBandwidth * 0.75 };
}

function detectCandlePattern(candles) {
  if (candles.length < 3) return { pattern: "N/A", bullish: false };
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const ante = candles[candles.length - 3];
  const [o, h, l, c] = [parseFloat(last[1]), parseFloat(last[2]), parseFloat(last[3]), parseFloat(last[4])];
  const [po, , , pc] = [parseFloat(prev[1]), parseFloat(prev[2]), parseFloat(prev[3]), parseFloat(prev[4])];
  const [ao, , , ac] = [parseFloat(ante[1]), parseFloat(ante[2]), parseFloat(ante[3]), parseFloat(ante[4])];
  const body = Math.abs(c - o);
  const upperWick = h - Math.max(o, c);
  const lowerWick = Math.min(o, c) - l;
  const anteBody = Math.abs(ac - ao);
  const prevBody = Math.abs(pc - po);

  if (c > o && body > Math.abs(pc - po) && c > po && o < pc) return { pattern: "Bullish Engulfing", bullish: true, confirmationStrength: "HIGH" };
  if (c > o && lowerWick > body * 2 && upperWick < body * 0.3) return { pattern: "Hammer", bullish: true, confirmationStrength: "HIGH" };
  // Morning Star: bearish large candle → small doji → bullish candle closing above ante midpoint
  if (ac < ao && anteBody > 0 && prevBody < anteBody * 0.35 && c > o && c > (ao + ac) / 2)
    return { pattern: "Morning Star", bullish: true, confirmationStrength: "HIGH" };
  if (c < o && upperWick > body * 2 && lowerWick < body * 0.3) return { pattern: "Shooting Star", bullish: false, confirmationStrength: "HIGH" };
  if (c < o && body > Math.abs(pc - po) && c < po && o > pc) return { pattern: "Bearish Engulfing", bullish: false, confirmationStrength: "HIGH" };
  if (c > o) return { pattern: "Green Candle", bullish: true, confirmationStrength: "LOW" };
  return { pattern: "Red Candle", bullish: false, confirmationStrength: "NONE" };
}

function findSupportResistance(candles, count = 3) {
  const highs = candles.map(c => parseFloat(c[2]));
  const lows = candles.map(c => parseFloat(c[3]));
  const closes = candles.map(c => parseFloat(c[4]));
  const currentPrice = closes[closes.length - 1];
  let supports = [], resistances = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (lows[i] <= lows[i - 1] && lows[i] <= lows[i - 2] && lows[i] <= lows[i + 1] && lows[i] <= lows[i + 2]) {
      if (lows[i] < currentPrice) supports.push(lows[i]);
    }
    if (highs[i] >= highs[i - 1] && highs[i] >= highs[i - 2] && highs[i] >= highs[i + 1] && highs[i] >= highs[i + 2]) {
      if (highs[i] > currentPrice) resistances.push(highs[i]);
    }
  }
  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);
  return {
    supports: supports.slice(0, count),
    resistances: resistances.slice(0, count),
    nearSupport: supports.length > 0 && ((currentPrice - supports[0]) / currentPrice) < 0.02,
  };
}

function detectFVG(candles) {
  for (let i = candles.length - 5; i >= Math.max(0, candles.length - 20); i--) {
    const h1 = parseFloat(candles[i][2]);
    const l3 = parseFloat(candles[i + 2][3]);
    if (l3 > h1) {
      const lastCandle = candles[candles.length - 1];
      const currentPrice = parseFloat(lastCandle[4]);
      const gapMid = (l3 + h1) / 2;
      const inFVG = currentPrice >= h1 && currentPrice <= l3;
      const nearFVG = Math.abs(currentPrice - gapMid) / currentPrice < 0.015;
      if (inFVG || nearFVG) {
        // Check for rejection candle: wick dips below midpoint but body closes above it
        const lo = parseFloat(lastCandle[1]), lc = parseFloat(lastCandle[4]);
        const lLow = parseFloat(lastCandle[3]);
        const lBody = Math.abs(lc - lo) || 0.0001;
        const lLowerWick = Math.min(lo, lc) - lLow;
        const hasRejection = lLow < gapMid && lc > gapMid && lLowerWick > lBody * 0.5;
        return { found: true, high: l3, low: h1, mid: gapMid, inZone: inFVG, hasRejection };
      }
    }
  }
  return { found: false };
}

// ─── Session + Liquidity Analysis ────────────────────────────────
// Sessions in UTC: Asian 00:00-08:00 · London 08:00-16:00 · US 13:00-22:00

const SESSION_PROFILES = {
  ASIAN: {
    volumeMultiplier: 0.5,   // Expect 50% of daily avg volume
    stopBuffer: 0.003,       // +0.3% wider stops for Asian wicks
    color: "#a78bfa",
    rules: {
      volumeRule: "Session-adjusted (raw thresholds relaxed)",
      stopAdjustment: "+0.3% buffer for wider wicks",
      tpExpectation: "TP1 likely hits at London open (8-10 UTC)",
      positionRule: "Full size OK if session-adjusted volume > 1.0",
      edge: "RSI dip entry — let London volume drive recovery",
    },
  },
  LONDON: {
    volumeMultiplier: 1.2,
    stopBuffer: 0,
    color: "#60a5fa",
    rules: {
      volumeRule: "Standard volume thresholds apply",
      stopAdjustment: "Standard 2% stop",
      tpExpectation: "TP1 should hit within 4-8 hours",
      positionRule: "Full size with standard rules",
      edge: "London sets the trend. First 30min can be a fakeout — wait for confirmation.",
    },
  },
  "LONDON/US": {
    volumeMultiplier: 1.8,
    stopBuffer: 0,
    color: "#f97316",
    rules: {
      volumeRule: "Highest standards — require raw volume > 1.0",
      stopAdjustment: "Standard 2% stop",
      tpExpectation: "TP1 within 2-4 hours (peak liquidity)",
      positionRule: "Full size, strictest checklist",
      edge: "Maximum liquidity = most reliable signals. But also whipsaws.",
    },
  },
  US: {
    volumeMultiplier: 1.5,
    stopBuffer: 0,
    color: "#22c55e",
    rules: {
      volumeRule: "Standard to high — raw volume > 0.8 minimum",
      stopAdjustment: "Standard 2% stop",
      tpExpectation: "TP1 within 2-6 hours",
      positionRule: "Full size, strictest checklist",
      edge: "Strongest trends, most reliable. But macro news drops here (FOMC, CPI).",
    },
  },
  "OFF-HOURS": {
    volumeMultiplier: 0.4,
    stopBuffer: 0.005,
    color: "#6b7280",
    rules: {
      volumeRule: "Very cautious — session-adjusted only",
      stopAdjustment: "+0.5% buffer (thin liquidity)",
      tpExpectation: "Don't expect TP during this session",
      positionRule: "REDUCE position by 50% or skip entirely",
      edge: "Almost never a good time to enter. Use for watchlist building.",
    },
  },
};

function getSessionInfo() {
  const now = new Date();
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const inAsian   = utcMins < 480;                          // 00:00–08:00
  const inLondon  = utcMins >= 480 && utcMins < 960;        // 08:00–16:00
  const inUS      = utcMins >= 780 && utcMins < 1320;       // 13:00–22:00
  const inOverlap = inLondon && inUS;

  let session, sessionColor;
  if (inOverlap)     { session = "LONDON/US"; sessionColor = "#f97316"; }
  else if (inLondon) { session = "LONDON";    sessionColor = "#60a5fa"; }
  else if (inUS)     { session = "US";        sessionColor = "#22c55e"; }
  else if (inAsian)  { session = "ASIAN";     sessionColor = "#a78bfa"; }
  else               { session = "OFF-HOURS"; sessionColor = "#6b7280"; }

  const profile = SESSION_PROFILES[session] || SESSION_PROFILES["OFF-HOURS"];

  // Time to next major session open
  let nextSession, minsToNext;
  if (utcMins < 480)      { nextSession = "London"; minsToNext = 480  - utcMins; }
  else if (utcMins < 780) { nextSession = "US";     minsToNext = 780  - utcMins; }
  else                    { nextSession = "Asian";  minsToNext = 1440 - utcMins; }

  const inDangerWindow        = minsToNext <= 30;
  const sessionTransitionRisk = inAsian && minsToNext <= 120; // within 2h of London open

  return {
    session, sessionColor, nextSession, minsToNext,
    inAsian, inLondon, inUS, inOverlap,
    inDangerWindow, sessionTransitionRisk,
    hoursToNext:   Math.floor(minsToNext / 60),
    minsRemaining: minsToNext % 60,
    // New session-aware fields
    volumeMultiplier: profile.volumeMultiplier,
    stopBuffer: profile.stopBuffer,
    rules: profile.rules,
  };
}

// Session-adjusted volume: normalizes raw volume against what's expected for the current session
function getSessionAdjustedVolume(rawRatio, session) {
  const profile = SESSION_PROFILES[session] || SESSION_PROFILES["OFF-HOURS"];
  const adjusted = profile.volumeMultiplier > 0 ? rawRatio / profile.volumeMultiplier : rawRatio;
  let grade, score, note;
  if (adjusted >= 2.0)      { grade = "CLIMAX";   score = 25; note = "Volume climax — accumulation signal"; }
  else if (adjusted >= 1.2) { grade = "STRONG";   score = 20; note = `Above average for ${session}`; }
  else if (adjusted >= 0.8) { grade = "ADEQUATE"; score = 10; note = `Normal for ${session}`; }
  else if (adjusted >= 0.5) { grade = "WEAK";     score = 0;  note = `Below normal even for ${session}`; }
  else                      { grade = "DEAD";     score = -15; note = "Dangerously low — skip"; }
  return { raw: rawRatio, adjusted, grade, score, note, session };
}

// Extract the high/low range formed during the most recent Asian session candles
function detectAsianRange(candles1h) {
  if (!candles1h || candles1h.length < 4) return null;
  const byDay = {};
  candles1h.slice(-50).forEach(c => {
    const d = new Date(c[0]);
    if (d.getUTCHours() < 8) {
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(c);
    }
  });
  const days = Object.keys(byDay).sort().reverse();
  if (!days.length) return null;
  const ac = byDay[days[0]];
  if (ac.length < 2) return null;
  const high = Math.max(...ac.map(c => parseFloat(c[2])));
  const low  = Math.min(...ac.map(c => parseFloat(c[3])));
  const rangePct = low > 0 ? ((high - low) / low) * 100 : 0;
  return { high, low, rangePct, isTight: rangePct < 1.5, candleCount: ac.length };
}

// Detect stop hunt / liquidity sweep patterns in the last 5 candles
// A sweep = wick penetrates a key level but the candle BODY closes back past it → stops grabbed, reversal likely
function detectLiquiditySweep(candles, supports, resistances, asianRange) {
  if (!candles || candles.length < 5) return { detected: false, type: "none" };
  const results = [];
  candles.slice(-5).forEach(candle => {
    const o = parseFloat(candle[1]), h = parseFloat(candle[2]);
    const l = parseFloat(candle[3]), c = parseFloat(candle[4]);
    const body       = Math.abs(c - o) || 0.0001;
    const lowerWick  = Math.min(o, c) - l;
    const upperWick  = h - Math.max(o, c);

    // Bullish: wick pierces support but body closes back above it
    if (supports.length > 0) {
      const s = supports[0];
      if (l < s && c > s && lowerWick > body * 1.5)
        results.push({ type: "bullish_sweep", label: "Stop Hunt Below Support", level: s, bullish: true });
    }
    // Bearish: wick pierces resistance but body closes back below it
    if (resistances.length > 0) {
      const r = resistances[0];
      if (h > r && c < r && upperWick > body * 1.5)
        results.push({ type: "bearish_sweep", label: "Stop Hunt Above Resistance", level: r, bullish: false });
    }
    // Asian range sweeps — classic session-open manipulation
    if (asianRange) {
      if (l < asianRange.low  && c > asianRange.low  && lowerWick > body)
        results.push({ type: "asian_low_sweep",  label: "Asian Low Swept — Bullish Reversal",  level: asianRange.low,  bullish: true });
      if (h > asianRange.high && c < asianRange.high && upperWick > body)
        results.push({ type: "asian_high_sweep", label: "Asian High Swept — Bearish Reversal", level: asianRange.high, bullish: false });
    }
  });
  if (!results.length) return { detected: false, type: "none" };
  const bullish = results.filter(r => r.bullish);
  const bearish = results.filter(r => !r.bullish);
  return bullish.length
    ? { ...bullish[bullish.length - 1], detected: true }
    : { ...bearish[bearish.length - 1], detected: true };
}

// ─── Scoring Engine ──────────────────────────────────────────────
function scoreToken(data, btcData) {
  const { candles1h, candles4h } = data;
  if (!candles1h || !candles4h || candles1h.length < 50) return null;

  const closes1h = candles1h.map(c => parseFloat(c[4]));
  const volumes1h = candles1h.map(c => parseFloat(c[5]));
  const closes4h = candles4h.map(c => parseFloat(c[4]));
  const currentPrice = closes1h[closes1h.length - 1];

  const rsi1h = calcRSI(closes1h);
  const rsi4h = calcRSI(closes4h);
  const ema200 = calcEMA(closes1h, Math.min(200, closes1h.length - 1));
  const currentEMA200 = ema200[ema200.length - 1];
  const priceVsEMA = ((currentPrice - currentEMA200) / currentEMA200) * 100;

  const recentVol = volumes1h.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avgVol20 = volumes1h.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volRatio = avgVol20 > 0 ? recentVol / avgVol20 : 0;
  // Playbook: volume on the signal candle itself must exceed 20MA
  const signalCandleVolOk = avgVol20 > 0 && volumes1h[volumes1h.length - 1] > avgVol20;

  const { pattern, bullish, confirmationStrength } = detectCandlePattern(candles1h);
  const { supports, resistances, nearSupport } = findSupportResistance(candles1h);
  const fvg = detectFVG(candles1h);

  // Session + liquidity sweep
  const sessionInfo    = getSessionInfo();
  const asianRange     = detectAsianRange(candles1h);
  const liquiditySweep = detectLiquiditySweep(candles1h, supports, resistances, asianRange);

  // Session-adjusted volume
  const sessionVolume = getSessionAdjustedVolume(volRatio, sessionInfo.session);

  // New indicators
  const macd = calcMACD(closes1h);
  const atr = calcATR(candles1h);
  const bb = calcBollingerBands(closes1h);
  const ema20arr = calcEMA(closes1h, 20);
  const ema50arr = calcEMA(closes1h, 50);
  const currentEMA20 = ema20arr[ema20arr.length - 1];
  const currentEMA50 = ema50arr[ema50arr.length - 1];
  const inUptrend = closes1h.length >= 50 && currentEMA20 > currentEMA50;
  const trendStrength = currentEMA50 > 0 ? ((currentEMA20 - currentEMA50) / currentEMA50) * 100 : 0;

  // ROC (10-period rate of change)
  const rocPeriod = 10;
  const roc = closes1h.length > rocPeriod
    ? ((currentPrice - closes1h[closes1h.length - 1 - rocPeriod]) / closes1h[closes1h.length - 1 - rocPeriod]) * 100 : 0;
  const prevRoc = closes1h.length > rocPeriod + 5
    ? ((closes1h[closes1h.length - 6] - closes1h[closes1h.length - 6 - rocPeriod]) / closes1h[closes1h.length - 6 - rocPeriod]) * 100 : 0;
  const momentumImproving = roc > prevRoc && roc < 5;

  // Volume spike detection
  const latestVol = volumes1h[volumes1h.length - 1];
  const volSpike = avgVol20 > 0 ? latestVol / avgVol20 : 0;
  const isVolumeClimax = volSpike > 2.0;
  const nearResistance = resistances.length > 0 && ((resistances[0] - currentPrice) / currentPrice) < 0.02;
  const volContext = isVolumeClimax ? (nearSupport ? "accumulation" : nearResistance ? "distribution" : "spike") : "normal";

  const btcCloses = btcData?.candles4h?.map(c => parseFloat(c[4])) || [];
  const btcLast = btcCloses[btcCloses.length - 1] || 0;
  const btcPrev4h = btcCloses[btcCloses.length - 2] || btcLast;
  const btcChange4h = btcPrev4h > 0 ? ((btcLast - btcPrev4h) / btcPrev4h) * 100 : 0;
  const btcSafe = btcChange4h > -3;

  const idx24hAgo = Math.max(0, closes1h.length - 25);
  const change24h = closes1h[idx24hAgo] > 0 ? ((currentPrice - closes1h[idx24hAgo]) / closes1h[idx24hAgo]) * 100 : 0;

  // ── HARD REJECTION GATES ──
  // These prevent tokens from even being scored if they fundamentally fail
  let hardReject = null;
  if (!btcSafe)                        hardReject = "BTC dumping >3% on 4H";
  else if (rsi1h !== null && rsi1h > 70) hardReject = "RSI overbought (>70)";
  else if (sessionVolume.grade === "DEAD" && !isVolumeClimax)
                                         hardReject = `Dead volume (${sessionVolume.adjusted.toFixed(2)}x session-adjusted)`;

  let score = 0;
  let reasons = [];
  let setupType = "None";

  if (hardReject) {
    reasons.push(`⛔ REJECTED: ${hardReject}`);
    score = -50;
  } else {
    // ── RSI 1H scoring (weighted per playbook) ──
    if (rsi1h !== null) {
      if (rsi1h >= 30 && rsi1h <= 40)      { score += 25; reasons.push(`RSI 1H in primary zone (${rsi1h.toFixed(1)})`); }
      else if (rsi1h > 40 && rsi1h <= 50)   { score += 10; reasons.push(`RSI 1H neutral (${rsi1h.toFixed(1)})`); }
      else if (rsi1h < 30)                   { score += 15; reasons.push(`RSI 1H deeply oversold (${rsi1h.toFixed(1)})`); }
      else if (rsi1h > 60)                   { score -= 10; reasons.push(`RSI 1H warm (${rsi1h.toFixed(1)})`); }
    }

    // ── Multi-TF RSI alignment ──
    if (rsi1h !== null && rsi4h !== null) {
      if (rsi1h < 40 && rsi4h < 40)           { score += 15; reasons.push(`RSI aligned oversold (4H: ${rsi4h.toFixed(0)})`); }
      else if (rsi1h > 65 && rsi4h > 65)       { score -= 15; reasons.push(`RSI aligned overbought (4H: ${rsi4h.toFixed(0)})`); }
      else if ((rsi1h < 40 && rsi4h > 60) || (rsi1h > 60 && rsi4h < 40)) { score -= 5; reasons.push(`RSI timeframe divergence (4H: ${rsi4h.toFixed(0)})`); }
    }

    // ── Structure + EMA ──
    if (nearSupport)                           { score += 15; reasons.push("Price near key support level"); }
    if (priceVsEMA > -2 && priceVsEMA < 2)    { score += 10; reasons.push(`Near 200 EMA (${priceVsEMA > 0 ? "+" : ""}${priceVsEMA.toFixed(1)}%)`); }

    // ── Volume scoring (SESSION-ADJUSTED) ──
    score += sessionVolume.score;
    reasons.push(sessionVolume.grade === "DEAD"
      ? `⚠ ${sessionVolume.note}`
      : `Volume: ${sessionVolume.grade} (${volRatio.toFixed(2)}x raw → ${sessionVolume.adjusted.toFixed(2)}x ${sessionInfo.session}-adjusted)`
    );
    if (isVolumeClimax && nearSupport)       { score += 10; reasons.push("Volume climax at support — accumulation"); }
    else if (isVolumeClimax && nearResistance) { score -= 5; reasons.push("Volume climax at resistance — distribution risk"); }

    // ── Candle patterns (with confirmation strength) ──
    if (confirmationStrength === "HIGH" && nearSupport) { score += 15; reasons.push(`✓ ${pattern} at support (confirmed)`); }
    else if (confirmationStrength === "HIGH")          { score += 10; reasons.push(`${pattern} (confirmed)`); }
    else if (bullish && nearSupport)                    { score += 5;  reasons.push(`${pattern} at support (weak — no confirmation)`); }
    else if (bullish)                                   { score += 2;  reasons.push(`${pattern} (weak — needs confirmation candle)`); }

    if (fvg.found && fvg.inZone && rsi1h < 50) {
      score += 20;
      reasons.push(fvg.hasRejection ? "Price in FVG reclaim zone + rejection candle confirmed" : "Price in FVG reclaim zone (awaiting rejection candle)");
    }

    // ── MACD ──
    if (macd) {
      if (macd.bullishCross)                        { score += 15; reasons.push("MACD bullish crossover"); }
      else if (macd.rising && macd.histogram < 0)   { score += 5;  reasons.push("MACD momentum improving"); }
      if (macd.bearishCross)                         { score -= 10; reasons.push("MACD bearish crossover"); }
    }

    // ── Trend direction ──
    if (closes1h.length >= 50) {
      if (inUptrend && rsi1h < 45) { score += 10; reasons.push(`Dip in uptrend (EMA20 > EMA50 by ${trendStrength.toFixed(1)}%)`); }
      else if (!inUptrend && rsi1h < 40) { score -= 10; reasons.push("Dip in downtrend — catching knife risk"); }
    }

    // ── Bollinger Bands ──
    if (bb) {
      if (bb.percentB < 0.15 && rsi1h < 40)   { score += 15; reasons.push("Price at lower Bollinger Band + RSI oversold"); }
      else if (bb.percentB < 0.2)              { score += 5;  reasons.push("Near lower Bollinger Band"); }
      if (bb.squeeze)                           { score += 5;  reasons.push("Bollinger squeeze — breakout imminent"); }
      if (bb.percentB > 0.95 && rsi1h > 65)    { score -= 10; reasons.push("At upper BB + RSI high — overextended"); }
    }

    // ── Momentum (ROC) ──
    if (momentumImproving && rsi1h < 55) { score += 10; reasons.push(`Momentum improving (ROC: ${roc.toFixed(1)}%)`); }
    else if (roc < -8)                    { score -= 5;  reasons.push(`Momentum deteriorating (ROC: ${roc.toFixed(1)}%)`); }

    // ── Liquidity sweep ──
    if (liquiditySweep.detected && liquiditySweep.bullish) {
      score += 15; reasons.push(`Liquidity sweep: ${liquiditySweep.label}`);
    }
    if (liquiditySweep.detected && !liquiditySweep.bullish) {
      score -= 15; reasons.push(`Liquidity sweep: ${liquiditySweep.label}`);
    }

    // ── Session risk ──
    if (sessionInfo.sessionTransitionRisk) {
      score -= 10;
      reasons.push(`Session risk: ${sessionInfo.nextSession} open in ${sessionInfo.minsToNext}min — stop hunt likely`);
    }
    if (asianRange?.isTight && sessionInfo.inAsian) {
      reasons.push(`Asian range tight (${asianRange.rangePct.toFixed(2)}%) — big move expected at session open`);
    }
  }

  // ── PLAYBOOK TRADE LEVELS ──
  // Always calculate using playbook fixed rules, not just ATR
  const playbookTP1 = currentPrice * 1.035;
  const playbookTP2 = currentPrice * 1.05;
  const playbookStop = currentPrice * 0.98;
  const playbookRiskPct = 2.0;
  const playbookRR = 3.5 / 2.0; // TP1/Stop = 1.75, but blended (3.5+5)/2 / 2 = 2.13
  const playbookBlendedRR = ((3.5 + 5.0) / 2) / 2.0;

  // ATR-based trade levels (secondary reference)
  const nearestSupport = supports[0] || currentPrice * 0.98;
  const atrStop = atr ? currentPrice - (atr * 1.5) : currentPrice * 0.985;
  const supportStop = nearestSupport * 0.995;
  const stopLoss = Math.max(atrStop, supportStop);
  const tp1 = atr ? currentPrice + atr * 2 : currentPrice * 1.035;
  const tp2 = atr ? currentPrice + atr * 3.5 : currentPrice * 1.05;
  const riskPct = ((currentPrice - stopLoss) / currentPrice) * 100;
  const rewardPct = ((tp1 - currentPrice) / currentPrice) * 100;
  const rrRatio = riskPct > 0 ? rewardPct / riskPct : 0;

  // Session-adjusted stop — wider to survive Asian low sweep before the real move
  let sessionAdjustedStop = stopLoss;
  if (sessionInfo.stopBuffer > 0) {
    const bufferAmount = currentPrice * sessionInfo.stopBuffer;
    const bufferedStop = stopLoss - bufferAmount;
    if (asianRange && (sessionInfo.inAsian || sessionInfo.sessionTransitionRisk)) {
      const asianBuffer = asianRange.low * 0.995;
      sessionAdjustedStop = Math.min(bufferedStop, asianBuffer);
    } else {
      sessionAdjustedStop = bufferedStop;
    }
  } else if (asianRange && (sessionInfo.inAsian || sessionInfo.sessionTransitionRisk)) {
    const asianBuffer = asianRange.low * 0.995;
    if (asianBuffer < stopLoss) sessionAdjustedStop = asianBuffer;
  }

  // ── SETUP CLASSIFICATION (enhanced with forming/confirmed status) ──
  // Check individual criteria for Setup A
  const setupACriteria = {
    rsiInZone: rsi1h !== null && rsi1h >= 30 && rsi1h <= 40,
    atSupport: nearSupport,
    candleConfirmed: confirmationStrength === "HIGH" && bullish,
    volumeOk: sessionVolume.adjusted >= 0.8,  // session-adjusted
    signalVolumeOk: signalCandleVolOk,
    btcStable: btcSafe,
  };
  const setupAMet = Object.values(setupACriteria).filter(Boolean).length;
  const setupATotal = Object.keys(setupACriteria).length;
  const setupAMissing = Object.entries(setupACriteria).filter(([, v]) => !v).map(([k]) => k);

  let setupStatus = "NONE"; // NONE | FORMING | CONFIRMED
  if (hardReject) {
    setupType = "None";
    setupStatus = "REJECTED";
  } else if (setupAMet === setupATotal) {
    setupType = "A: RSI + Structure ✓";
    setupStatus = "CONFIRMED";
    score += 15;
    reasons.push("✅ Setup A CONFIRMED — all criteria met");
  } else if (setupAMet >= 4 && setupACriteria.rsiInZone && setupACriteria.btcStable) {
    setupType = "A: RSI + Structure";
    setupStatus = "FORMING";
    score += 5;
    reasons.push(`Setup A FORMING (${setupAMet}/${setupATotal}) — missing: ${setupAMissing.join(", ")}`);
  } else if (fvg.found && fvg.inZone && rsi1h < 50 && btcSafe) {
    setupType = fvg.hasRejection ? "B: FVG Reclaim ✓" : "B: FVG Reclaim";
    setupStatus = fvg.hasRejection ? "CONFIRMED" : "FORMING";
  } else if (rsi1h < 60 && change24h < 2 && btcSafe && score >= 40) {
    setupType = "C: Momentum Candidate";
    setupStatus = "FORMING";
  }

  // ── R:R Check (hard penalty if playbook R:R < 2.0) ──
  if (setupType !== "None" && playbookBlendedRR < 2.0) {
    score -= 20;
    reasons.push(`⚠ Playbook R:R below 2:1 (${playbookBlendedRR.toFixed(2)}:1)`);
  }

  // ── PLAYBOOK CHECKLIST (pre-filled for AI export) ──
  const btcCloses1h = btcData?.candles1h?.map(c => parseFloat(c[4])) || [];
  const btcRsi1h = calcRSI(btcCloses1h);
  const dailyBiasLongs = btcSafe && btcChange4h > -1 && (btcRsi1h === null || btcRsi1h > 40);
  const hasActiveNarrative = (data.narrative || []).length > 0;

  const playbookChecklist = {
    btcNotDumping:       { pass: btcSafe, value: `BTC ${btcChange4h >= 0 ? "+" : ""}${btcChange4h.toFixed(2)}% on 4H` },
    dailyBiasLongs:      { pass: dailyBiasLongs, value: dailyBiasLongs ? "BTC stable/green" : "BTC bearish structure" },
    activeNarrative:     { pass: hasActiveNarrative, value: hasActiveNarrative ? (data.narrative || []).join(", ") : "None tagged" },
    volumeAboveAvg:      { pass: sessionVolume.adjusted >= 0.8, value: `${sessionVolume.grade} (${volRatio.toFixed(2)}x raw → ${sessionVolume.adjusted.toFixed(2)}x adjusted)` },
    noMajorEvents:       { pass: !sessionInfo.inDangerWindow, value: sessionInfo.inDangerWindow ? `${sessionInfo.nextSession} open in ${sessionInfo.minsToNext}min` : "No events detected" },
    rsiInZone:           { pass: rsi1h !== null && rsi1h >= 30 && rsi1h <= 40, value: rsi1h !== null ? `RSI ${rsi1h.toFixed(1)}` : "N/A" },
    candleConfirmation:  { pass: confirmationStrength === "HIGH" && bullish, value: confirmationStrength === "HIGH" ? `${pattern} (confirmed)` : `${pattern} (${confirmationStrength.toLowerCase()})` },
  };
  const checklistPassCount = Object.values(playbookChecklist).filter(c => c.pass).length;
  const checklistTotal = Object.keys(playbookChecklist).length;
  const checklistFailures = Object.entries(playbookChecklist).filter(([, c]) => !c.pass).map(([k, c]) => `${k}: ${c.value}`);

  let checklistVerdict;
  if (checklistPassCount === checklistTotal) checklistVerdict = "ALL CHECKS PASS — valid entry";
  else if (checklistPassCount >= 5) checklistVerdict = `FORMING — ${checklistTotal - checklistPassCount} check(s) failing`;
  else checklistVerdict = "WAIT — too many checks failing";

  return {
    rsi1h, rsi4h, currentPrice, ema200: currentEMA200, priceVsEMA,
    volRatio, pattern, bullish, confirmationStrength, supports, resistances, nearSupport,
    fvg, btcChange4h, btcSafe, change24h, score, reasons, setupType, setupStatus,
    stopLoss, tp1, tp2, riskPct, rrRatio,
    playbookTP1, playbookTP2, playbookStop, playbookBlendedRR, signalCandleVolOk,
    entry: setupStatus === "CONFIRMED" || (setupStatus === "FORMING" && setupType !== "None"),
    hardReject,
    // Setup A details
    setupACriteria, setupAMet, setupATotal, setupAMissing,
    // Session-adjusted volume
    sessionVolume,
    // Playbook checklist
    playbookChecklist, checklistPassCount, checklistTotal, checklistFailures, checklistVerdict,
    macd, inUptrend, trendStrength, atr, bb, roc, momentumImproving,
    volSpike, volContext, isVolumeClimax,
    sessionInfo, asianRange, liquiditySweep, sessionAdjustedStop,
  };
}

// ─── AI Export ───────────────────────────────────────────────────
function buildExportPayload(symbol, name, narrative, analysis, btcAnalysis) {
  const a = analysis;
  return {
    _instruction: a.setupStatus === "CONFIRMED"
      ? "This token has a CONFIRMED setup. Verify with chart screenshots (1H + 4H) and provide exact entry/exit levels."
      : a.setupStatus === "FORMING"
        ? "This token has a FORMING setup. Ask me for 1H and 4H chart screenshots to check if the missing criteria are close to being met."
        : "Analyze this token setup. Focus on whether this is a valid entry or if I should wait.",
    token: { symbol: symbol.replace("USDT", ""), pair: symbol, name, narratives: narrative || [] },
    scanTime: new Date().toISOString(),
    session: {
      current: a.sessionInfo?.session,
      nextOpen: a.sessionInfo?.nextSession,
      minsToNext: a.sessionInfo?.minsToNext,
      dangerWindow: a.sessionInfo?.inDangerWindow,
      transitionRisk: a.sessionInfo?.sessionTransitionRisk,
      rules: a.sessionInfo?.rules || null,
    },
    btc: {
      safe: a.btcSafe,
      change4h: +a.btcChange4h.toFixed(2),
      price: btcAnalysis?.currentPrice || null,
      rsi1h: btcAnalysis?.rsi1h ? +btcAnalysis.rsi1h.toFixed(1) : null,
    },
    price: {
      current: a.currentPrice,
      change24h: +a.change24h.toFixed(2),
      vsEMA200: +a.priceVsEMA.toFixed(2),
    },
    indicators: {
      rsi1h: a.rsi1h ? +a.rsi1h.toFixed(1) : null,
      rsi4h: a.rsi4h ? +a.rsi4h.toFixed(1) : null,
      macd: a.macd ? {
        histogram: +a.macd.histogram.toFixed(6),
        bullishCross: a.macd.bullishCross,
        bearishCross: a.macd.bearishCross,
        rising: a.macd.rising,
      } : null,
      bollingerBands: a.bb ? {
        percentB: +a.bb.percentB.toFixed(3),
        squeeze: a.bb.squeeze,
        bandwidth: +a.bb.bandwidth.toFixed(2),
      } : null,
      atr: a.atr ? +a.atr.toFixed(6) : null,
      roc: +a.roc.toFixed(2),
      momentumImproving: a.momentumImproving,
    },
    trend: {
      direction: a.inUptrend ? "UP" : "DOWN",
      ema20vsEma50: +a.trendStrength.toFixed(2),
    },
    volume: {
      raw: +a.volRatio.toFixed(2),
      sessionAdjusted: +a.sessionVolume.adjusted.toFixed(2),
      grade: a.sessionVolume.grade,
      note: a.sessionVolume.note,
      spike: +a.volSpike.toFixed(2),
      climax: a.isVolumeClimax,
      context: a.volContext,
    },
    structure: {
      pattern: a.pattern,
      confirmationStrength: a.confirmationStrength,
      bullishCandle: a.bullish,
      nearSupport: a.nearSupport,
      supports: a.supports.map(s => +s.toFixed(6)),
      resistances: a.resistances.map(r => +r.toFixed(6)),
      fvg: a.fvg.found ? { inZone: a.fvg.inZone, high: a.fvg.high, low: a.fvg.low } : null,
    },
    asianRange: a.asianRange ? {
      high: a.asianRange.high,
      low: a.asianRange.low,
      rangePct: +a.asianRange.rangePct.toFixed(2),
      tight: a.asianRange.isTight,
    } : null,
    liquiditySweep: a.liquiditySweep?.detected ? {
      type: a.liquiditySweep.type,
      label: a.liquiditySweep.label,
      level: a.liquiditySweep.level,
      bullish: a.liquiditySweep.bullish,
    } : null,
    setup: {
      type: a.setupType,
      status: a.setupStatus,
      score: a.score,
      entry: a.entry,
      reasons: a.reasons,
      // Setup A breakdown
      setupACriteria: a.setupACriteria || null,
      setupAMet: a.setupAMet || 0,
      setupATotal: a.setupATotal || 0,
      setupAMissing: a.setupAMissing || [],
    },
    playbookChecklist: {
      ...a.playbookChecklist,
      passCount: `${a.checklistPassCount}/${a.checklistTotal}`,
      failures: a.checklistFailures,
      verdict: a.checklistVerdict,
    },
    tradeLevels: {
      entry: a.currentPrice,
      stopLoss: a.stopLoss,
      sessionAdjustedStop: a.sessionAdjustedStop !== a.stopLoss ? a.sessionAdjustedStop : null,
      playbookStop: a.playbookStop,
      tp1: a.tp1,
      tp2: a.tp2,
      playbookTP1: a.playbookTP1,
      playbookTP2: a.playbookTP2,
      riskPct: +a.riskPct.toFixed(2),
      rrRatio: +a.rrRatio.toFixed(2),
      playbookRR: +a.playbookBlendedRR.toFixed(2),
    },
  };
}

// ─── Components ──────────────────────────────────────────────────
function MiniChart({ candles, width = 300, height = 80 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!candles || candles.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const closes = candles.map(c => parseFloat(c[4]));
    const min = Math.min(...closes) * 0.999;
    const max = Math.max(...closes) * 1.001;
    const range = max - min || 1;
    const p = 2;

    const isGreen = closes[closes.length - 1] >= closes[0];

    // gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, isGreen ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)");
    grad.addColorStop(1, "rgba(10,10,18,0)");
    ctx.beginPath();
    closes.forEach((v, i) => {
      const x = p + (i / (closes.length - 1)) * (width - p * 2);
      const y = p + (1 - (v - min) / range) * (height - p * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(p + width - p * 2, height);
    ctx.lineTo(p, height);
    ctx.fillStyle = grad;
    ctx.fill();

    // EMA 20
    const ema = calcEMA(closes, 20);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(251,191,36,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ema.forEach((v, i) => {
      const x = p + (i / (ema.length - 1)) * (width - p * 2);
      const y = p + (1 - (v - min) / range) * (height - p * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // price line
    ctx.beginPath();
    ctx.strokeStyle = isGreen ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 1.8;
    closes.forEach((v, i) => {
      const x = p + (i / (closes.length - 1)) * (width - p * 2);
      const y = p + (1 - (v - min) / range) * (height - p * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // dot at end
    const lastX = width - p;
    const lastY = p + (1 - (closes[closes.length - 1] - min) / range) * (height - p * 2);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = isGreen ? "#22c55e" : "#ef4444";
    ctx.fill();
  }, [candles, width, height]);

  return <canvas ref={canvasRef} style={{ width: "100%", maxWidth: width, height, display: "block" }} />;
}

function RSIBar({ value }) {
  if (value == null) return <span style={{ color: "#6b7280", fontSize: 11 }}>—</span>;
  const color = value <= 30 ? "#22c55e" : value <= 40 ? "#4ade80" : value <= 50 ? "#fbbf24" : value <= 70 ? "#f97316" : "#ef4444";
  const label = value <= 30 ? "OVERSOLD" : value <= 40 ? "BUY ZONE" : value <= 50 ? "NEUTRAL" : value <= 70 ? "WARM" : "OVERBOUGHT";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <div style={{ width: 60, height: 5, background: "#1a1a2e", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ color, fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)" }}>{value.toFixed(1)}</span>
      <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1.2 }}>{label}</span>
    </div>
  );
}

function SignalStrength({ score }) {
  const bars = score <= 0 ? 0 : score < 20 ? 1 : score < 40 ? 2 : score < 60 ? 3 : score < 80 ? 4 : 5;
  const color = bars <= 1 ? "#ef4444" : bars <= 2 ? "#f97316" : bars <= 3 ? "#fbbf24" : bars <= 4 ? "#4ade80" : "#22c55e";
  const label = ["AVOID", "WEAK", "FAIR", "GOOD", "STRONG", "PRIME"][bars];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end" }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ width: 4, height: 6 + i * 3, borderRadius: 1, background: i < bars ? color : "#1a1a2e", transition: "background 0.3s" }} />
        ))}
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

function fp(p) {
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  return p.toFixed(5);
}

function NarrativeTags({ narratives }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {narratives.map(n => (
        <span key={n} style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1,
          padding: "2px 6px", borderRadius: 3,
          background: `${NARRATIVE_COLORS[n] || "#818cf8"}22`,
          color: NARRATIVE_COLORS[n] || "#818cf8",
        }}>{n}</span>
      ))}
    </div>
  );
}

// ─── Trade Manager Component ─────────────────────────────────────
function TradeManager({ symbol, currentPrice, riskPct, rsi1h, trades, setTrades }) {
  const trade = trades[symbol];
  const [priceInput, setPriceInput] = useState(currentPrice);
  const [capitalInput, setCapitalInput] = useState("");
  const [portfolioInput, setPortfolioInput] = useState("");

  const handleStartTrade = () => {
    const p = parseFloat(priceInput);
    const c = parseFloat(capitalInput);
    if (!p || !c) return;
    setTrades(prev => ({
      ...prev,
      [symbol]: {
        isActive: true,
        entries: [{ price: p, capital: c, date: new Date().toISOString() }],
        totalCapital: c,
        avgEntryPrice: p
      }
    }));
    setCapitalInput("");
  };

  const handleDCA = () => {
    const p = parseFloat(priceInput);
    const c = parseFloat(capitalInput);
    if (!p || !c || !trade) return;

    const newEntries = [...trade.entries, { price: p, capital: c, date: new Date().toISOString() }];
    const newTotalCapital = trade.totalCapital + c;
    const totalTokens = newEntries.reduce((acc, entry) => acc + (entry.capital / entry.price), 0);
    const newAvgPrice = newTotalCapital / totalTokens;

    setTrades(prev => ({
      ...prev,
      [symbol]: {
        ...prev[symbol],
        entries: newEntries,
        totalCapital: newTotalCapital,
        avgEntryPrice: newAvgPrice
      }
    }));
    setCapitalInput("");
  };

  const handleClose = () => {
    setTrades(prev => {
      const copy = { ...prev };
      delete copy[symbol];
      return copy;
    });
  };

  // PNL Math
  let pnlUsd = 0, pnlPct = 0, currentValue = 0, tokensOwned = 0;
  if (trade?.isActive) {
    tokensOwned = trade.totalCapital / trade.avgEntryPrice;
    currentValue = tokensOwned * currentPrice;
    pnlUsd = currentValue - trade.totalCapital;
    pnlPct = (pnlUsd / trade.totalCapital) * 100;
  }

  // Hold time
  const hoursElapsed = trade?.isActive && trade.entries?.[0]?.date
    ? (Date.now() - new Date(trade.entries[0].date)) / 3600000 : 0;
  const holdColor = hoursElapsed >= 48 ? "#ef4444" : hoursElapsed >= 36 ? "#fb923c" : "#6b7280";

  // Playbook position sizing — 2% rule, capped at portfolio (spot = no leverage)
  const portfolio = parseFloat(portfolioInput);
  const stopPct = riskPct > 0 ? riskPct : 2;
  const rawSize = portfolio > 0 ? (portfolio * 0.02) / (stopPct / 100) : null;
  const suggestedSize = rawSize !== null ? Math.min(rawSize, portfolio) : null;
  const isCapped = rawSize !== null && rawSize > portfolio;
  const maxLossUsd = suggestedSize !== null ? suggestedSize * (stopPct / 100) : null;
  const maxLossPct = maxLossUsd !== null && portfolio > 0 ? (maxLossUsd / portfolio) * 100 : null;

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, background: "#1a1a2e", border: "1px solid #312e8180", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 800, letterSpacing: 1.5 }}>💼 TRADE MANAGEMENT</span>
        {trade?.isActive && (
          <button onClick={handleClose} style={{ background: "#ef444420", color: "#f87171", border: "1px solid #ef444440", padding: "4px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>CLOSE TRADE</button>
        )}
      </div>

      {/* RSI overbought early exit alert */}
      {trade?.isActive && rsi1h > 75 && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #ef444450", borderRadius: 7, padding: "7px 10px", marginBottom: 10, fontSize: 11, color: "#f87171", fontWeight: 700 }}>
          ⚠ RSI {rsi1h?.toFixed(0)} — Overbought. Playbook: consider early exit.
        </div>
      )}

      {!trade?.isActive ? (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>ENTRY PRICE</div>
              <input type="number" value={priceInput} onChange={e => setPriceInput(e.target.value)} style={{ width: "100%", background: "#12121e", border: "1px solid #2a2a3e", borderRadius: 6, padding: "8px", color: "#e2e8f0", fontSize: 13, fontFamily: "var(--mono)", outline: "none" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>CAPITAL (USD)</div>
              <input type="number" placeholder="0.00" value={capitalInput} onChange={e => setCapitalInput(e.target.value)} style={{ width: "100%", background: "#12121e", border: "1px solid #2a2a3e", borderRadius: 6, padding: "8px", color: "#e2e8f0", fontSize: 13, fontFamily: "var(--mono)", outline: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button onClick={handleStartTrade} style={{ background: "#818cf8", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer", height: 35 }}>START</button>
            </div>
          </div>
          {/* Position sizing calculator */}
          <div style={{ background: "#0d0d18", border: "1px solid #1e1e2e", borderRadius: 7, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>PLAYBOOK POSITION SIZER (2% RULE)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: suggestedSize ? 8 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 3 }}>PORTFOLIO ($)</div>
                <input type="number" placeholder="e.g. 1000" value={portfolioInput} onChange={e => setPortfolioInput(e.target.value)} style={{ width: "100%", background: "#12121e", border: "1px solid #2a2a3e", borderRadius: 6, padding: "6px 8px", color: "#e2e8f0", fontSize: 12, fontFamily: "var(--mono)", outline: "none" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 3 }}>STOP LOSS %</div>
                <div style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 700, color: "#f87171", padding: "6px 0" }}>{stopPct.toFixed(1)}%</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 3 }}>POSITION SIZE</div>
                <div style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 700, color: suggestedSize ? "#a78bfa" : "#4b5563" }}>
                  {suggestedSize ? `$${suggestedSize.toFixed(0)}` : "—"}
                </div>
              </div>
            </div>
            {suggestedSize && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid #1e1e2e" }}>
                <span style={{ fontSize: 10, color: "#6b7280" }}>
                  Max loss: <span style={{ color: "#f87171", fontFamily: "var(--mono)", fontWeight: 700 }}>${maxLossUsd.toFixed(2)}</span>
                  <span style={{ color: "#4b5563" }}> ({maxLossPct.toFixed(2)}% of portfolio)</span>
                </span>
                {isCapped && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", background: "#fbbf2415", border: "1px solid #fbbf2430", borderRadius: 4, padding: "2px 6px" }}>
                    CAPPED — SPOT LIMIT
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          {/* Hold time warning */}
          {hoursElapsed > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "5px 8px", background: "#0d0d18", borderRadius: 6, border: `1px solid ${holdColor}40` }}>
              <span style={{ fontSize: 10, color: holdColor, fontWeight: 700 }}>
                ⏱ {hoursElapsed >= 48 ? "⚠ EXCEEDED" : `${hoursElapsed.toFixed(0)}H`} / 48H MAX
              </span>
              {hoursElapsed >= 48 && <span style={{ fontSize: 9, color: "#ef4444" }}>— Playbook: exit now</span>}
              {hoursElapsed >= 36 && hoursElapsed < 48 && <span style={{ fontSize: 9, color: "#fb923c" }}>— approaching limit</span>}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #2a2a3e" }}>
            <div>
              <div style={{ fontSize: 9, color: "#6b7280" }}>AVG ENTRY</div>
              <div style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 700 }}>${fp(trade.avgEntryPrice)}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#6b7280" }}>INVESTED</div>
              <div style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 700 }}>${trade.totalCapital.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "#6b7280" }}>PNL</div>
              <div style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 800, color: pnlUsd >= 0 ? "#4ade80" : "#f87171" }}>
                {pnlUsd >= 0 ? "+" : ""}{pnlUsd.toFixed(2)} ({pnlPct.toFixed(2)}%)
              </div>
            </div>
          </div>

          <div style={{ fontSize: 9, color: "#a5b4fc", marginBottom: 6, fontWeight: 700 }}>ADD DCA POSITION</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input type="number" placeholder="Price" value={priceInput} onChange={e => setPriceInput(e.target.value)} style={{ flex: 1, background: "#12121e", border: "1px solid #2a2a3e", borderRadius: 6, padding: "8px", color: "#e2e8f0", fontSize: 12, fontFamily: "var(--mono)", outline: "none" }} />
            <input type="number" placeholder="Amount (USD)" value={capitalInput} onChange={e => setCapitalInput(e.target.value)} style={{ flex: 1, background: "#12121e", border: "1px solid #2a2a3e", borderRadius: 6, padding: "8px", color: "#e2e8f0", fontSize: 12, fontFamily: "var(--mono)", outline: "none" }} />
          </div>
          <button onClick={handleDCA} style={{ width: "100%", background: "#4ade8020", color: "#4ade80", border: "1px solid #4ade8040", borderRadius: 6, padding: "9px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>DCA</button>
        </div>
      )}
    </div>
  );
}


// ─── Settings Modal ──────────────────────────────────────────────
function SettingsModal({ tokens, onSave, onClose }) {
  const [list, setList] = useState(tokens.filter(t => t.role === "alt"));
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newNarratives, setNewNarratives] = useState([]);

  const toggleNarrative = (n) =>
    setNewNarratives(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const remove = (sym) => setList(prev => prev.filter(t => t.symbol !== sym));
  const add = () => {
    const sym = newSymbol.toUpperCase().replace(/[^A-Z]/g, "");
    if (!sym || !newName) return;
    const full = sym.endsWith("USDT") ? sym : sym + "USDT";
    if (list.find(t => t.symbol === full)) return;
    setList(prev => [...prev, { symbol: full, name: newName, role: "alt", narrative: newNarratives }]);
    setNewSymbol("");
    setNewName("");
    setNewNarratives([]);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#12121e", borderTop: "1px solid #2a2a3e", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 500, maxHeight: "80vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Token Watchlist</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Add Token */}
        <div style={{ background: "#0d0d18", border: "1px solid #1e1e2e", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1.2, marginBottom: 8 }}>ADD TOKEN</div>

          {/* Narrative Picker — shown first so keyboard doesn't hide it */}
          <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1.2, marginBottom: 6 }}>NARRATIVES</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {Object.entries(NARRATIVE_COLORS).map(([n, color]) => {
              const active = newNarratives.includes(n);
              return (
                <button key={n} onClick={() => toggleNarrative(n)} style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  padding: "6px 11px", borderRadius: 6, cursor: "pointer",
                  background: active ? `${color}22` : "#1a1a2e",
                  color: active ? color : "#4b5563",
                  border: `1px solid ${active ? color + "60" : "#2a2a3e"}`,
                  transition: "all 0.15s", minHeight: 32,
                }}>{n}</button>
              );
            })}
          </div>

          {/* Symbol + Name inputs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)} placeholder="DOGE" style={{
              flex: 1, background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 8,
              padding: "8px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "var(--mono)", outline: "none",
            }} />
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Dogecoin" style={{
              flex: 1, background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 8,
              padding: "8px 12px", color: "#e2e8f0", fontSize: 13, outline: "none",
            }} />
          </div>
          <button onClick={add} style={{ width: "100%", background: "#818cf8", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add Token</button>
        </div>

        {/* Token List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {list.map(t => (
            <div key={t.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1a1a2e", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                  <span style={{ color: "#6b7280", fontSize: 11, fontFamily: "var(--mono)" }}>{t.symbol.replace("USDT", "")}</span>
                </div>
                {t.narrative && t.narrative.length > 0 && (
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                    {t.narrative.map(n => (
                      <span key={n} style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                        padding: "2px 5px", borderRadius: 3,
                        background: `${NARRATIVE_COLORS[n] || "#818cf8"}22`,
                        color: NARRATIVE_COLORS[n] || "#818cf8",
                      }}>{n}</span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => remove(t.symbol)} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>

        <button onClick={() => { onSave(list); onClose(); }} style={{
          width: "100%", marginTop: 16, background: "#818cf8", color: "#fff", border: "none",
          borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}>Save & Rescan</button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────
export default function App() {
  const [tokens, setTokens] = useState(() => {
    try { const saved = localStorage.getItem("pb_tokens"); return saved ? JSON.parse(saved) : DEFAULT_TOKENS; }
    catch { return DEFAULT_TOKENS; }
  });
  const [data, setData] = useState({});
  const [trades, setTrades] = useState(() => {
    try { const saved = localStorage.getItem("pb_trades"); return saved ? JSON.parse(saved) : {}; }
    catch { return {}; }
  });
  const [loading, setLoading] = useState(true);
  const [refreshingSymbol, setRefreshingSymbol] = useState(null); // specific token loader
  const [refreshingBTC, setRefreshingBTC] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [sortBy, setSortBy] = useState("score");
  const [expanded, setExpanded] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [watchlist, setWatchlist] = useState(() => {
    try { const saved = localStorage.getItem("pb_watchlist"); return saved ? new Set(JSON.parse(saved)) : new Set(); }
    catch { return new Set(); }
  });
  const [viewFilter, setViewFilter] = useState("all"); // "all" | "watched"
  const [copied, setCopied] = useState(null); // symbol of last copied token
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [syncStatus, setSyncStatus] = useState(FIREBASE_ENABLED ? "syncing" : "offline");
  const timerRef = useRef(null);
  const firebaseSyncRef = useRef(false); // true = local write in-flight, suppress incoming onValue echo
  const remoteUpdateRef = useRef(false); // true = processing remote data, skip trades/watchlist write-backs

  // ── Firebase real-time listener (mount only) ──
  useEffect(() => {
    if (!FIREBASE_ENABLED || !db) return;
    const root = ref(db, "crypto-scanner");
    const unsub = onValue(root, (snapshot) => {
      const remote = snapshot.val();
      if (firebaseSyncRef.current) {
        // Our own write echoing back — skip state updates to avoid triggering a rescan
        firebaseSyncRef.current = false;
        setSyncStatus("synced");
        return;
      }
      if (remote) {
        remoteUpdateRef.current = true; // block trades/watchlist write-backs during hydration
        if (remote.tokens) setTokens(remote.tokens);
        if (remote.trades) setTrades(remote.trades);
        if (remote.watchlist) setWatchlist(new Set(remote.watchlist));
        setTimeout(() => { remoteUpdateRef.current = false; }, 500);
      }
      setSyncStatus("synced");
    }, (err) => {
      console.warn("[Firebase] read error:", err);
      setSyncStatus("offline");
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist trades ──
  useEffect(() => {
    localStorage.setItem("pb_trades", JSON.stringify(trades));
    if (FIREBASE_ENABLED && db && !remoteUpdateRef.current) {
      firebaseSyncRef.current = true;
      try { set(ref(db, "crypto-scanner/trades"), trades); } catch (e) { firebaseSyncRef.current = false; }
    }
  }, [trades]);

  const toggleWatch = (symbol) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      const arr = [...next];
      localStorage.setItem("pb_watchlist", JSON.stringify(arr));
      if (FIREBASE_ENABLED && db) {
        firebaseSyncRef.current = true;
        try { set(ref(db, "crypto-scanner/watchlist"), arr); } catch (e) { firebaseSyncRef.current = false; }
      }
      return next;
    });
  };

  const toggleSelect = (symbol) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      return next;
    });
  };

  const fetchSingleToken = async (symbol) => {
    try {
      const [res1h, res4h] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=210`),
        fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=4h&limit=100`),
      ]);
      if (res1h.ok && res4h.ok) {
        const [candles1h, candles4h] = await Promise.all([res1h.json(), res4h.json()]);
        return { candles1h, candles4h };
      }
    } catch (e) { console.warn(`Failed: ${symbol}`, e); }
    return null;
  };

  const refreshIndividualToken = async (symbol) => {
    setRefreshingSymbol(symbol);
    const token = tokens.find(t => t.symbol === symbol);
    if (token) {
      const res = await fetchSingleToken(symbol);
      if (res) {
        setData(prev => ({ ...prev, [symbol]: { ...res, ...token } }));
      }
    }
    setRefreshingSymbol(null);
  };

  const refreshBTC = async () => {
    setRefreshingBTC(true);
    const btcToken = tokens.find(t => t.symbol === "BTCUSDT");
    const res = await fetchSingleToken("BTCUSDT");
    if (res) {
      setData(prev => ({ ...prev, BTCUSDT: { ...res, ...(btcToken || {}) } }));
    }
    setRefreshingBTC(false);
  };

  const copySelected = () => {
    const tokens = displayed.filter(t => selected.has(t.symbol) && t.analysis);
    if (!tokens.length) return;
    const payload = {
      _instruction: "Analyze these token setups together. Compare which has the strongest setup and best R:R. Ask me for chart screenshots (1H + 4H) of the top picks before confirming entries.",
      scanTime: new Date().toISOString(),
      session: (() => { const s = getSessionInfo(); return { current: s.session, nextOpen: s.nextSession, minsToNext: s.minsToNext, dangerWindow: s.inDangerWindow, transitionRisk: s.sessionTransitionRisk }; })(),
      btc: btcAnalysis ? { safe: btcAnalysis.btcSafe, change4h: +btcAnalysis.btcChange4h.toFixed(2), price: btcAnalysis.currentPrice, rsi1h: btcAnalysis.rsi1h ? +btcAnalysis.rsi1h.toFixed(1) : null } : null,
      tokens: tokens.map(t => buildExportPayload(t.symbol, t.name, t.narrative, t.analysis, btcAnalysis)),
    };
    // Remove redundant btc/session/scanTime from individual tokens since they're at top level
    payload.tokens.forEach(t => { delete t._instruction; delete t.scanTime; delete t.session; delete t.btc; });
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied("__multi__");
    setTimeout(() => setCopied(null), 2000);
  };

  const saveTokens = (altList) => {
    const btc = tokens.find(t => t.role === "benchmark") || DEFAULT_TOKENS[0];
    const full = [btc, ...altList];
    setTokens(full);
    localStorage.setItem("pb_tokens", JSON.stringify(full));
    if (FIREBASE_ENABLED && db) {
      firebaseSyncRef.current = true;
      try { set(ref(db, "crypto-scanner/tokens"), full); } catch (e) { firebaseSyncRef.current = false; }
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setProgress(0);
    const results = {};
    const total = tokens.length;
    for (let idx = 0; idx < total; idx++) {
      const token = tokens[idx];
      const res = await fetchSingleToken(token.symbol);
      if (res) {
        results[token.symbol] = { ...res, ...token };
      }
      setProgress(Math.round(((idx + 1) / total) * 100));
      if (idx < total - 1) await new Promise(r => setTimeout(r, 100));
    }
    setData(results);
    setLastUpdate(new Date());
    setLoading(false);
  }, [tokens]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 5 min
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(fetchData, 5 * 60 * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchData]);

  const btcData = data["BTCUSDT"] || null;
  const btcAnalysis = btcData ? scoreToken(btcData, btcData) : null;

  // BTC 1H crash detection: compare last 2 candles on 1H
  const btcChange1h = useMemo(() => {
    const c = btcData?.candles1h;
    if (!c || c.length < 2) return 0;
    const prev = parseFloat(c[c.length - 2][4]);
    const last = parseFloat(c[c.length - 1][4]);
    return prev > 0 ? ((last - prev) / prev) * 100 : 0;
  }, [btcData]);
  const btcCrashing = btcChange1h < -2;
  const hasActiveTrades = Object.values(trades).some(t => t?.isActive);

  const altResults = useMemo(() => {
    // First pass: score all tokens
    const initial = tokens.filter(t => t.role === "alt").map(t => {
      const d = data[t.symbol];
      if (!d) return { ...t, analysis: null };
      return { ...t, analysis: scoreToken(d, btcData) };
    }).filter(t => t.analysis);

    // Compute hot narratives: sector where 3+ tokens pumped >5% in 24H
    const narrativeMap = {};
    initial.forEach(t => {
      (t.narrative || []).forEach(n => {
        if (!narrativeMap[n]) narrativeMap[n] = 0;
        if ((t.analysis?.change24h || 0) > 5) narrativeMap[n]++;
      });
    });
    const hotNarratives = new Set(
      Object.entries(narrativeMap).filter(([, cnt]) => cnt >= 3).map(([n]) => n)
    );

    // Second pass: apply narrative laggard boost
    return initial.map(t => {
      const isLaggard = (t.narrative || []).some(n => hotNarratives.has(n)) &&
        (t.analysis?.change24h || 0) < 3 && t.analysis?.btcSafe;
      if (!isLaggard) return t;
      return {
        ...t,
        analysis: {
          ...t.analysis,
          score: t.analysis.score + 10,
          reasons: [...t.analysis.reasons, "Narrative laggard — sector hot, token hasn't pumped yet"],
          setupType: t.analysis.setupType === "None" ? "C: Narrative Laggard" : t.analysis.setupType,
        },
      };
    });
  }, [data, tokens, btcData]);

  const sorted = useMemo(() =>
    [...altResults].sort((a, b) => {
      if (sortBy === "score") return (b.analysis?.score || 0) - (a.analysis?.score || 0);
      if (sortBy === "rsi") return (a.analysis?.rsi1h || 100) - (b.analysis?.rsi1h || 100);
      if (sortBy === "volume") return (b.analysis?.volRatio || 0) - (a.analysis?.volRatio || 0);
      if (sortBy === "change") return (b.analysis?.change24h || 0) - (a.analysis?.change24h || 0);
      return 0;
    }),
    [altResults, sortBy]
  );

  const displayed = useMemo(() => {
    let list = sorted;
    if (viewFilter === "watched") list = sorted.filter(t => watchlist.has(t.symbol));
    if (viewFilter === "active") list = sorted.filter(t => trades[t.symbol]?.isActive);
    return list;
  }, [sorted, viewFilter, watchlist, trades]);

  const searched = useMemo(() => {
    if (!searchQuery.trim()) return displayed;
    const q = searchQuery.toLowerCase();
    return displayed.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      (t.narrative || []).some(n => n.toLowerCase().includes(q))
    );
  }, [displayed, searchQuery]);

  // Daily PNL: sum unrealized PNL across all active trades (must be after altResults)
  const dailyPnl = useMemo(() => {
    let total = 0, invested = 0;
    altResults.forEach(t => {
      const trade = trades[t.symbol];
      if (trade?.isActive && t.analysis) {
        const tokens_ = trade.totalCapital / trade.avgEntryPrice;
        const cur = tokens_ * t.analysis.currentPrice;
        total += cur - trade.totalCapital;
        invested += trade.totalCapital;
      }
    });
    return { pnl: total, invested };
  }, [altResults, trades]);

  const shortlist = sorted.filter(t => t.analysis && t.analysis.score >= 40 && t.analysis.btcSafe);

  const sessionInfo = getSessionInfo();

  // Narrative aggregation
  const narrativeHeat = useMemo(() => {
    const map = {};
    altResults.forEach(t => {
      (t.narrative || []).forEach(n => {
        if (!map[n]) map[n] = { changes: [], count: 0 };
        map[n].changes.push(t.analysis?.change24h || 0);
        map[n].count++;
      });
    });
    return Object.entries(map).map(([name, d]) => {
      const avg = d.changes.reduce((a, b) => a + b, 0) / d.changes.length;
      const pumping = d.changes.filter(c => c > 5).length;
      return { name, avg, pumping, total: d.count, hot: pumping >= 2 || avg > 4 };
    }).sort((a, b) => b.avg - a.avg);
  }, [altResults]);

  const concentrationWarnings = useMemo(() => {
    const narrativeSetups = {};
    altResults.forEach(t => {
      if (t.analysis && t.analysis.score >= 40 && t.analysis.btcSafe) {
        (t.narrative || []).forEach(n => {
          if (!narrativeSetups[n]) narrativeSetups[n] = [];
          narrativeSetups[n].push(t.name);
        });
      }
    });
    return Object.entries(narrativeSetups)
      .filter(([, tokens]) => tokens.length >= 3)
      .map(([narrative, tokens]) => ({ narrative, tokens, count: tokens.length }));
  }, [altResults]);

  return (
    <div style={{ "--mono": "'JetBrains Mono', 'Fira Code', monospace", minHeight: "100dvh", background: "#0a0a12", color: "#e2e8f0", fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 2px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 8px rgba(129,140,248,0.3) } 50% { box-shadow: 0 0 16px rgba(129,140,248,0.6) } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .spin { display: inline-block; animation: spin 0.8s linear infinite; }
        .card { animation: fadeUp 0.35s ease both; }
        .shimmer { background: linear-gradient(90deg,#1a1a2e 25%,#252540 50%,#1a1a2e 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; border-radius:12px; }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid #1a1a2e",
        background: "rgba(10,10,18,0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        padding: "12px 16px",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.03em" }}>
              <span style={{ color: "#818cf8" }}>◈</span> PLAYBOOK SCANNER
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "var(--mono)" }}>
                {lastUpdate ? lastUpdate.toLocaleTimeString() : "—"}
              </span>
              {autoRefresh && <span style={{ fontSize: 9, color: "#4ade80", fontWeight: 600 }}>● AUTO</span>}
              {FIREBASE_ENABLED && (
                <span style={{ fontSize: 9, fontWeight: 700, color: syncStatus === "synced" ? "#4ade80" : syncStatus === "syncing" ? "#fbbf24" : "#ef4444" }}
                  title={`Firebase: ${syncStatus}`}>
                  {syncStatus === "synced" ? "☁ SYNC" : syncStatus === "syncing" ? "◌ SYNC" : "✕ OFFLINE"}
                </span>
              )}
              <span style={{ width: 1, height: 10, background: "#2a2a3e", display: "inline-block" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: sessionInfo.sessionColor, letterSpacing: 0.5 }}>
                ● {sessionInfo.session} <span style={{ color: "#6b7280", fontWeight: 500 }}>vol×{sessionInfo.volumeMultiplier}</span>
              </span>
              <span style={{ fontSize: 9, color: sessionInfo.inDangerWindow ? "#fb923c" : "#4b5563" }}>
                ⏱ {sessionInfo.nextSession} in {sessionInfo.hoursToNext > 0 ? `${sessionInfo.hoursToNext}h ` : ""}{sessionInfo.minsRemaining}m
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowSettings(true)} style={{ background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#94a3b8", width: 36, height: 36, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>⚙</button>
            <button onClick={() => setAutoRefresh(p => !p)} style={{ background: autoRefresh ? "#1e3a5f" : "#1a1a2e", border: `1px solid ${autoRefresh ? "#3b82f6" : "#2a2a3e"}`, color: autoRefresh ? "#60a5fa" : "#6b7280", width: 36, height: 36, borderRadius: 8, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>⟳</button>
            <button onClick={fetchData} disabled={loading} style={{ background: loading ? "#1a1a2e" : "#818cf8", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", height: 36, fontWeight: 700, fontSize: 12, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? `${progress}%` : "SCAN"}
            </button>
          </div>
        </div>
        {loading && (
          <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, background: "#818cf8", width: `${progress}%`, transition: "width 0.3s", borderRadius: 1 }} />
        )}
      </header>

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "12px 12px 100px" }}>

        {/* ── BTC 1H Crash Alert ── */}
        {btcCrashing && hasActiveTrades && (
          <div className="card" style={{
            background: "rgba(127,29,29,0.4)", border: "1px solid #ef444470",
            borderRadius: 12, padding: "10px 14px", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#f87171", letterSpacing: 1 }}>
                BTC DROPPED {Math.abs(btcChange1h).toFixed(2)}% IN 1H — ACTIVE TRADES AT RISK
              </div>
              <div style={{ fontSize: 10, color: "#fca5a5", marginTop: 2 }}>
                Playbook: altcoins follow BTC down harder. Consider early exit.
              </div>
            </div>
          </div>
        )}

        {/* ── Daily PNL Strip ── */}
        {dailyPnl.invested > 0 && (
          <div className="card" style={{
            background: "#12121e", border: "1px solid #1e1e2e",
            borderRadius: 12, padding: "10px 14px", marginBottom: 10,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: 1 }}>OPEN POSITIONS</span>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 9, color: "#6b7280" }}>INVESTED </span>
                <span style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700 }}>${dailyPnl.invested.toFixed(0)}</span>
              </div>
              <div>
                <span style={{ fontSize: 9, color: "#6b7280" }}>UNREALIZED PNL </span>
                <span style={{ fontSize: 13, fontFamily: "var(--mono)", fontWeight: 800, color: dailyPnl.pnl >= 0 ? "#4ade80" : "#f87171" }}>
                  {dailyPnl.pnl >= 0 ? "+" : ""}{dailyPnl.pnl.toFixed(2)}
                  {dailyPnl.invested > 0 && ` (${((dailyPnl.pnl / dailyPnl.invested) * 100).toFixed(2)}%)`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── BTC Status ── */}
        {btcAnalysis && (
          <div className="card" style={{
            background: btcAnalysis.btcSafe
              ? "linear-gradient(135deg, rgba(6,78,59,0.5) 0%, #0a0a12 100%)"
              : "linear-gradient(135deg, rgba(127,29,29,0.5) 0%, #0a0a12 100%)",
            border: `1px solid ${btcAnalysis.btcSafe ? "#065f4660" : "#991b1b60"}`,
            borderRadius: 12, padding: 14, marginBottom: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: btcAnalysis.btcSafe ? "#22c55e" : "#ef4444", boxShadow: `0 0 8px ${btcAnalysis.btcSafe ? "#22c55e" : "#ef4444"}` }} />
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>
                    BTC: {btcAnalysis.btcSafe ? "SAFE" : "⚠ RISK OFF"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontFamily: "var(--mono)" }}>
                  <span style={{ color: btcAnalysis.btcChange4h >= 0 ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                    {btcAnalysis.btcChange4h >= 0 ? "+" : ""}{btcAnalysis.btcChange4h.toFixed(2)}%
                  </span>
                  {" 4H · "}RSI {btcAnalysis.rsi1h?.toFixed(0)} · ${fp(btcAnalysis.currentPrice)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <MiniChart candles={btcData?.candles1h?.slice(-40)} width={110} height={44} />
                <button onClick={refreshBTC} disabled={refreshingBTC} style={{
                  background: "none", border: "none", cursor: refreshingBTC ? "default" : "pointer",
                  padding: 0, fontSize: 12, color: refreshingBTC ? "#4b5563" : "#6b7280", lineHeight: 1,
                }}>
                  <div className={refreshingBTC ? "spin" : ""}>⟳ BTC</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Narrative Trends (Binance-wide) ── */}
        {narrativeHeat.length > 0 && (
          <div className="card" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, padding: "0 2px" }}>
            {narrativeHeat.map(n => (
              <div key={n.name} style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: n.hot ? `${NARRATIVE_COLORS[n.name] || "#818cf8"}18` : "#12121e",
                border: `1px solid ${n.hot ? `${NARRATIVE_COLORS[n.name] || "#818cf8"}40` : "#1e1e2e"}`,
                color: n.hot ? (NARRATIVE_COLORS[n.name] || "#818cf8") : "#6b7280",
              }}>
                {n.hot && "🔥 "}{n.name}{" "}
                <span style={{ fontFamily: "var(--mono)", fontSize: 10 }}>{n.avg >= 0 ? "+" : ""}{n.avg.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}

        {/* ── AI Shortlist ── */}
        {!loading && shortlist.length > 0 && (
          <div className="card" style={{
            background: "linear-gradient(135deg, rgba(30,27,75,0.6) 0%, #12121e 100%)",
            border: "1px solid #312e8180", borderRadius: 12, padding: 12, marginBottom: 10,
            animation: "glow 3s ease infinite",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#a5b4fc", letterSpacing: 1.5, marginBottom: 4 }}>
              📸 SCREENSHOT FOR AI → {shortlist.length} TOKEN{shortlist.length > 1 ? "S" : ""}
            </div>
            <div style={{ fontSize: 11, color: "#818cf8", marginBottom: 8 }}>
              These passed pre-screening. Take 1H + 4H charts → upload to Claude Project.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {shortlist.map(t => (
                <span key={t.symbol} style={{
                  background: t.analysis.setupStatus === "CONFIRMED" ? "#166534" : "#312e81",
                  color: t.analysis.setupStatus === "CONFIRMED" ? "#4ade80" : "#c7d2fe",
                  padding: "3px 8px",
                  borderRadius: 5, fontSize: 12, fontWeight: 700,
                  border: t.analysis.setupStatus === "CONFIRMED" ? "1px solid #22c55e40" : "none",
                }}>
                  {t.name} <span style={{ fontFamily: "var(--mono)", color: t.analysis.setupStatus === "CONFIRMED" ? "#86efac" : "#a5b4fc", fontSize: 10 }}>
                    {t.analysis.score} {t.analysis.setupStatus === "CONFIRMED" ? "✓" : t.analysis.setupStatus === "FORMING" ? "◐" : ""}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {!loading && shortlist.length === 0 && btcAnalysis && (
          <div className="card" style={{ background: "#12121e", border: "1px solid #1e1e2e", borderRadius: 12, padding: 14, marginBottom: 10, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>🧘</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>No setups right now</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              {btcAnalysis.btcSafe ? "Market is quiet. Patience is a position." : "BTC in risk-off mode. Stay in cash."}
            </div>
          </div>
        )}

        {/* ── Session Danger Warning ── */}
        {!loading && (sessionInfo.inDangerWindow || sessionInfo.sessionTransitionRisk) && (
          <div className="card" style={{
            background: "#12121e",
            border: `1px solid ${sessionInfo.inDangerWindow ? "#c2410c70" : "#92400e50"}`,
            borderRadius: 12, padding: 12, marginBottom: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, marginBottom: 5,
              color: sessionInfo.inDangerWindow ? "#fb923c" : "#fbbf24" }}>
              {sessionInfo.inDangerWindow ? "⚡ DANGER WINDOW" : "⚠ SESSION TRANSITION RISK"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
              <span style={{ color: sessionInfo.inDangerWindow ? "#fb923c" : "#fbbf24", fontWeight: 700 }}>
                {sessionInfo.nextSession} session
              </span>{" opens in "}
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700,
                color: sessionInfo.inDangerWindow ? "#fb923c" : "#fbbf24" }}>
                {sessionInfo.hoursToNext > 0 ? `${sessionInfo.hoursToNext}h ` : ""}{sessionInfo.minsRemaining}min
              </span>
              {". Asian session stops may be swept before the real move. Use wider stops or wait for the liquidity grab candle to close before entering."}
            </div>
          </div>
        )}

        {/* ── Concentration Warning ── */}
        {!loading && concentrationWarnings.length > 0 && (
          <div className="card" style={{ background: "#12121e", border: "1px solid #92400e40", borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#fbbf24", letterSpacing: 1.5, marginBottom: 4 }}>
              CONCENTRATION RISK
            </div>
            {concentrationWarnings.map(w => (
              <div key={w.narrative} style={{ fontSize: 11, color: "#94a3b8", padding: "2px 0" }}>
                <span style={{ color: "#fbbf24" }}>{w.narrative}</span>: {w.count} setups active ({w.tokens.join(", ")}) — consider limiting exposure
              </div>
            ))}
          </div>
        )}

        {/* ── Search ── */}
        <div style={{ position: "relative", marginBottom: 8 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#4b5563", pointerEvents: "none" }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tokens, symbols or narratives…"
            style={{
              width: "100%", background: "#12121e", border: "1px solid #1e1e2e", borderRadius: 8,
              padding: "8px 34px 8px 32px", color: "#e2e8f0", fontSize: 12,
              fontFamily: "var(--mono)", outline: "none",
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          )}
        </div>
        {searchQuery && (
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, fontFamily: "var(--mono)" }}>
            {searched.length} / {displayed.length} tokens
          </div>
        )}

        {/* ── View Filter + Sort ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
          {/* Main Filter Toggle */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", flexShrink: 0, border: "1px solid #1e1e2e" }}>
            {[["all", "ALL"], ["watched", `★ ${watchlist.size}`], ["active", "💼 ACTIVE"]].map(([val, label]) => (
              <button key={val} onClick={() => setViewFilter(val)} style={{
                background: viewFilter === val ? (val === "watched" ? "#854d0e" : val === "active" ? "#1e3a8a" : "#818cf8") : "#12121e",
                color: viewFilter === val ? "#fff" : "#6b7280",
                border: "none", padding: "5px 10px", fontSize: 11, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 18, background: "#1e1e2e", flexShrink: 0 }} />
          <button onClick={() => { setSelectMode(p => !p); if (selectMode) setSelected(new Set()); }} style={{
            background: selectMode ? "#312e81" : "#12121e",
            color: selectMode ? "#a5b4fc" : "#6b7280",
            border: `1px solid ${selectMode ? "#818cf8" : "#1e1e2e"}`,
            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>{selectMode ? `✓ ${selected.size}` : "SELECT"}</button>
          <div style={{ width: 1, height: 18, background: "#1e1e2e", flexShrink: 0 }} />
          {[["score", "Score"], ["rsi", "RSI ↓"], ["volume", "Vol ↑"], ["change", "24H ↑"]].map(([val, label]) => (
            <button key={val} onClick={() => setSortBy(val)} style={{
              background: sortBy === val ? "#818cf8" : "#12121e",
              color: sortBy === val ? "#fff" : "#6b7280",
              border: `1px solid ${sortBy === val ? "#818cf8" : "#1e1e2e"}`,
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}>{label}</button>
          ))}
        </div>

        {/* ── Loading State ── */}
        {loading && displayed.length === 0 && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shimmer" style={{ height: 110, marginBottom: 8 }} />
        ))}

        {/* Watched empty state */}
        {!loading && viewFilter === "watched" && watchlist.size === 0 && (
          <div className="card" style={{ background: "#12121e", border: "1px solid #1e1e2e", borderRadius: 12, padding: 14, marginBottom: 10, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>★</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>No watched tokens</div>
          </div>
        )}
        {!loading && viewFilter === "active" && displayed.length === 0 && (
          <div className="card" style={{ background: "#12121e", border: "1px solid #1e1e2e", borderRadius: 12, padding: 14, marginBottom: 10, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>💼</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>No active trades</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Expand a token card to log a trade.</div>
          </div>
        )}
        {!loading && searchQuery && searched.length === 0 && (
          <div className="card" style={{ background: "#12121e", border: "1px solid #1e1e2e", borderRadius: 12, padding: 14, marginBottom: 10, textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>No tokens match "{searchQuery}"</div>
          </div>
        )}

        {/* ── Token Cards ── */}
        {searched.map(({ symbol, name, narrative, analysis }, idx) => {
          if (!analysis) return null;
          const isExpanded = expanded === symbol;
          const isGood = analysis.score >= 40 && analysis.btcSafe;
          const hasSetup = analysis.entry;
          const isSelected = selected.has(symbol);
          const trade = trades[symbol];
          const bc = selectMode && isSelected ? "#818cf8" : trade?.isActive ? "#3b82f680" : hasSetup ? "#22c55e50" : isGood ? "#818cf850" : "#1e1e2e";

          // Calculate PNL for unexpanded badge
          let currentPnlPct = 0;
          if (trade?.isActive) {
            const currentVal = (trade.totalCapital / trade.avgEntryPrice) * analysis.currentPrice;
            currentPnlPct = ((currentVal - trade.totalCapital) / trade.totalCapital) * 100;
          }

          return (
            <div key={symbol} className="card" style={{ animationDelay: `${idx * 0.04}s`, marginBottom: 8 }}>
              <div
                onClick={() => selectMode ? toggleSelect(symbol) : setExpanded(isExpanded ? null : symbol)}
                style={{
                  background: trade?.isActive ? "linear-gradient(to bottom right, #1a2035, #12121e)" : "#12121e", 
                  border: `1px solid ${bc}`, borderRadius: 12,
                  cursor: "pointer", overflow: "hidden", transition: "border-color 0.3s",
                }}
              >
                <div style={{ padding: "12px 14px" }}>
                  {/* Top Row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {selectMode && (
                          <span style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: isSelected ? "#818cf8" : "transparent",
                            border: `2px solid ${isSelected ? "#818cf8" : "#3a3a5e"}`,
                            fontSize: 11, color: "#fff", fontWeight: 900, transition: "all 0.15s",
                          }}>{isSelected ? "✓" : ""}</span>
                        )}
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{name}</span>
                        <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "var(--mono)" }}>{symbol.replace("USDT", "")}</span>
                        
                        {trade?.isActive && (
                           <span style={{ background: currentPnlPct >= 0 ? "#14532d" : "#7f1d1d", color: currentPnlPct >= 0 ? "#4ade80" : "#f87171", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 800, fontFamily: "var(--mono)", letterSpacing: 0.5 }}>
                             {currentPnlPct >= 0 ? "+" : ""}{currentPnlPct.toFixed(2)}%
                           </span>
                        )}

                        {!trade?.isActive && hasSetup && (
                          <span style={{ background: "#166534", color: "#4ade80", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>SETUP</span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: analysis.setupType !== "None" ? "#fbbf24" : "#4b5563", fontWeight: 600 }}>{analysis.setupType}</span>
                        {analysis.setupStatus === "CONFIRMED" && (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, padding: "2px 5px", borderRadius: 3, background: "#16653440", color: "#4ade80", border: "1px solid #16653460" }}>CONFIRMED</span>
                        )}
                        {analysis.setupStatus === "FORMING" && (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, padding: "2px 5px", borderRadius: 3, background: "#854d0e30", color: "#fbbf24", border: "1px solid #854d0e50" }}>FORMING</span>
                        )}
                        {analysis.setupStatus === "REJECTED" && (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, padding: "2px 5px", borderRadius: 3, background: "#7f1d1d30", color: "#f87171", border: "1px solid #7f1d1d50" }}>REJECTED</span>
                        )}
                        {narrative && narrative.length > 0 && <NarrativeTags narratives={narrative} />}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--mono)" }}>${fp(analysis.currentPrice)}</div>
                        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: analysis.change24h >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                          {analysis.change24h >= 0 ? "+" : ""}{analysis.change24h.toFixed(2)}%
                        </div>
                      </div>
                      {/* Interactive Icons */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleWatch(symbol); }} style={{
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          fontSize: 16, color: watchlist.has(symbol) ? "#fbbf24" : "#2a2a3e",
                          transition: "color 0.2s", lineHeight: 1,
                        }}>★</button>
                        <button onClick={(e) => { e.stopPropagation(); refreshIndividualToken(symbol); }} disabled={refreshingSymbol === symbol} style={{
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          fontSize: 13, color: "#6b7280", lineHeight: 1, 
                        }}>
                          <div className={refreshingSymbol === symbol ? "spin" : ""}>⟳</div>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1.2, marginBottom: 3 }}>RSI 1H</div>
                      <RSIBar value={analysis.rsi1h} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1.2, marginBottom: 3 }}>VOLUME</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700,
                          color: analysis.sessionVolume?.grade === "CLIMAX" ? "#22c55e" : analysis.sessionVolume?.grade === "STRONG" ? "#4ade80" : analysis.sessionVolume?.grade === "ADEQUATE" ? "#fbbf24" : "#f87171",
                        }}>{analysis.sessionVolume ? analysis.sessionVolume.adjusted.toFixed(2) : analysis.volRatio.toFixed(2)}x</span>
                        <span style={{ fontSize: 8, color: "#6b7280", fontWeight: 600 }}>{analysis.sessionVolume?.grade || ""}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1.2, marginBottom: 3 }}>SIGNAL</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 16, fontWeight: 900,
                          color: analysis.score >= 60 ? "#22c55e" : analysis.score >= 40 ? "#fbbf24" : analysis.score >= 20 ? "#f97316" : "#ef4444",
                        }}>{analysis.score}</span>
                        <SignalStrength score={analysis.score} />
                      </div>
                    </div>
                  </div>

                  {/* Chart */}
                  <div style={{ marginTop: 8 }}>
                    <MiniChart candles={data[symbol]?.candles1h?.slice(-60)} width={340} height={55} />
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #1a1a2e", padding: 14, background: "#0d0d18" }}>
                    
                    {/* Trade Manager Component */}
                    <TradeManager
                      symbol={symbol}
                      currentPrice={analysis.currentPrice}
                      riskPct={analysis.riskPct}
                      rsi1h={analysis.rsi1h}
                      trades={trades}
                      setTrades={setTrades}
                    />

                    {/* S/R Levels & Analysis Details (Truncated for clean look, matching previous layout) */}
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 800, letterSpacing: 1.5, marginBottom: 6 }}>ANALYSIS</div>
                      {analysis.reasons.map((r, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#94a3b8", padding: "2px 0" }}>
                          <span style={{ color: "#818cf8", marginRight: 6 }}>›</span>{r}
                        </div>
                      ))}
                    </div>

                    {/* Playbook Checklist */}
                    {analysis.playbookChecklist && (
                      <div style={{ marginTop: 14, background: "rgba(30,27,75,0.3)", border: "1px solid #312e8140", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 800, letterSpacing: 1.5 }}>📋 PLAYBOOK CHECKLIST</div>
                          <span style={{
                            fontSize: 10, fontWeight: 800, fontFamily: "var(--mono)",
                            color: analysis.checklistPassCount === analysis.checklistTotal ? "#4ade80" : analysis.checklistPassCount >= 5 ? "#fbbf24" : "#f87171",
                          }}>{analysis.checklistPassCount}/{analysis.checklistTotal}</span>
                        </div>
                        {Object.entries(analysis.playbookChecklist).map(([key, check]) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>{check.pass ? "✅" : "❌"}</span>
                            <span style={{ color: "#94a3b8", fontWeight: 600 }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span style={{ color: check.pass ? "#4ade8090" : "#f8717190", fontSize: 10, fontFamily: "var(--mono)" }}>{check.value}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: 8, padding: "6px 8px", borderRadius: 6,
                          background: analysis.checklistPassCount === analysis.checklistTotal ? "rgba(22,101,52,0.2)" : analysis.checklistPassCount >= 5 ? "rgba(133,77,14,0.15)" : "rgba(127,29,29,0.15)",
                          fontSize: 10, fontWeight: 700,
                          color: analysis.checklistPassCount === analysis.checklistTotal ? "#4ade80" : analysis.checklistPassCount >= 5 ? "#fbbf24" : "#f87171",
                        }}>
                          {analysis.checklistVerdict}
                        </div>
                      </div>
                    )}

                    {/* Session Volume Context */}
                    {analysis.sessionVolume && (
                      <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 7, background: "rgba(10,10,18,0.6)", border: "1px solid #1e1e2e" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1 }}>SESSION VOLUME</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)",
                            color: analysis.sessionVolume.grade === "CLIMAX" ? "#22c55e" : analysis.sessionVolume.grade === "STRONG" ? "#4ade80" : analysis.sessionVolume.grade === "ADEQUATE" ? "#fbbf24" : "#f87171",
                          }}>{analysis.sessionVolume.grade}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                          Raw: <span style={{ fontFamily: "var(--mono)", color: "#e2e8f0" }}>{analysis.volRatio.toFixed(2)}x</span>
                          {" → "}{analysis.sessionInfo?.session}-adjusted: <span style={{ fontFamily: "var(--mono)", color: "#e2e8f0" }}>{analysis.sessionVolume.adjusted.toFixed(2)}x</span>
                        </div>
                        <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{analysis.sessionVolume.note}</div>
                      </div>
                    )}

                    {/* Grid Data */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                      {[
                        ["RSI 4H", analysis.rsi4h?.toFixed(1) || "—", null],
                        ["vs EMA200", `${analysis.priceVsEMA > 0 ? "+" : ""}${analysis.priceVsEMA.toFixed(1)}%`, analysis.priceVsEMA > 0 ? "#4ade80" : "#f87171"],
                        ["Trend", analysis.inUptrend ? "UP" : "DOWN", analysis.inUptrend ? "#4ade80" : "#f87171"],
                        ["MACD", analysis.macd ? (analysis.macd.bullishCross ? "Bull Cross" : analysis.macd.bearishCross ? "Bear Cross" : analysis.macd.rising ? "Rising" : "Falling") : "—", analysis.macd?.rising ? "#4ade80" : "#f87171"],
                        ["BB", analysis.bb ? (analysis.bb.squeeze ? "SQUEEZE" : `${(analysis.bb.percentB * 100).toFixed(0)}%`) : "—", analysis.bb?.squeeze ? "#fbbf24" : null],
                        ["Pattern", analysis.pattern.split(" ")[0], analysis.bullish ? "#4ade80" : "#f87171"],
                        ["FVG", analysis.fvg.found ? (analysis.fvg.inZone ? "In Zone" : "Near") : "None", analysis.fvg.found ? "#fbbf24" : "#6b7280"],
                        ["ROC", `${analysis.roc.toFixed(1)}%`, analysis.roc > 0 ? "#4ade80" : "#f87171"],
                        ["Vol Spike", analysis.isVolumeClimax ? analysis.volContext : "Normal", analysis.volContext === "accumulation" ? "#4ade80" : analysis.volContext === "distribution" ? "#f87171" : null],
                        ["Session", `${analysis.sessionInfo?.session || "—"} ×${analysis.sessionInfo?.volumeMultiplier || "?"}`, analysis.sessionInfo?.sessionColor || null],
                        ["Vol Adj", analysis.sessionVolume ? `${analysis.sessionVolume.adjusted.toFixed(1)}x ${analysis.sessionVolume.grade}` : "—", analysis.sessionVolume?.grade === "STRONG" || analysis.sessionVolume?.grade === "CLIMAX" ? "#4ade80" : analysis.sessionVolume?.grade === "ADEQUATE" ? "#fbbf24" : "#f87171"],
                        ["Liquidity", analysis.liquiditySweep?.detected ? (analysis.liquiditySweep.bullish ? "Sweep ↑" : "Sweep ↓") : "None", analysis.liquiditySweep?.detected ? (analysis.liquiditySweep.bullish ? "#86efac" : "#fca5a5") : "#4b5563"],
                      ].map(([label, val, color]) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1 }}>{label}</div>
                          <div style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600, color: color || "#94a3b8", marginTop: 2 }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* S/R Levels */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>SUPPORT</div>
                        {analysis.supports.length > 0
                          ? analysis.supports.slice(0, 3).map((s, i) => <div key={i} style={{ fontSize: 12, color: "#4ade80", fontFamily: "var(--mono)" }}>${fp(s)}</div>)
                          : <div style={{ fontSize: 11, color: "#4b5563" }}>Not detected</div>
                        }
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>RESISTANCE</div>
                        {analysis.resistances.length > 0
                          ? analysis.resistances.slice(0, 3).map((r, i) => <div key={i} style={{ fontSize: 12, color: "#f87171", fontFamily: "var(--mono)" }}>${fp(r)}</div>)
                          : <div style={{ fontSize: 11, color: "#4b5563" }}>Not detected</div>
                        }
                      </div>
                    </div>

                    {/* Asian Range + Sweep Detail */}
                    {analysis.asianRange && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 800, letterSpacing: 1.5, marginBottom: 6 }}>ASIAN SESSION RANGE</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>ASIAN HIGH</div>
                            <div style={{ fontSize: 12, color: "#fb923c", fontFamily: "var(--mono)", fontWeight: 600 }}>${fp(analysis.asianRange.high)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>ASIAN LOW</div>
                            <div style={{ fontSize: 12, color: "#a78bfa", fontFamily: "var(--mono)", fontWeight: 600 }}>${fp(analysis.asianRange.low)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>RANGE</div>
                            <div style={{ fontSize: 12, color: analysis.asianRange.isTight ? "#fbbf24" : "#94a3b8", fontFamily: "var(--mono)", fontWeight: 600 }}>
                              {analysis.asianRange.rangePct.toFixed(2)}% {analysis.asianRange.isTight ? "— TIGHT" : ""}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>CANDLES</div>
                            <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--mono)", fontWeight: 600 }}>{analysis.asianRange.candleCount}H</div>
                          </div>
                        </div>
                        {analysis.liquiditySweep?.detected && (
                          <div style={{
                            padding: "7px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, lineHeight: 1.5,
                            background: analysis.liquiditySweep.bullish ? "rgba(20,83,45,0.3)" : "rgba(127,29,29,0.3)",
                            border: `1px solid ${analysis.liquiditySweep.bullish ? "#16653450" : "#7f1d1d50"}`,
                            color: analysis.liquiditySweep.bullish ? "#86efac" : "#fca5a5",
                          }}>
                            {analysis.liquiditySweep.bullish ? "↑" : "↓"} {analysis.liquiditySweep.label}
                            {analysis.liquiditySweep.level
                              ? <span style={{ color: "#94a3b8", fontWeight: 400 }}> @ ${fp(analysis.liquiditySweep.level)}</span>
                              : null}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Trade Levels */}
                    {hasSetup && (
                      <div style={{ background: "rgba(22,101,52,0.2)", border: "1px solid #16653440", borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 10, color: "#4ade80", fontWeight: 800, letterSpacing: 1.5, marginBottom: 8 }}>📌 TRADE LEVELS</div>
                        {/* ATR-based levels */}
                        <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>ATR-BASED</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                          {[
                            ["Entry", fp(analysis.currentPrice), "#f1f5f9"],
                            ["Stop", fp(analysis.stopLoss), "#f87171"],
                            ["TP1", fp(analysis.tp1), "#4ade80"],
                            ["TP2", fp(analysis.tp2), "#22c55e"],
                          ].map(([label, val, color]) => (
                            <div key={label}>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>{label}</div>
                              <div style={{ fontSize: 12, color, fontFamily: "var(--mono)", fontWeight: 700 }}>${val}</div>
                            </div>
                          ))}
                        </div>
                        {/* Playbook fixed levels */}
                        <div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>PLAYBOOK (3.5% / 5.0%)</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                          {[
                            ["Entry", fp(analysis.currentPrice), "#f1f5f9"],
                            ["Stop –2%", fp(analysis.playbookStop), "#f87171"],
                            ["TP1 +3.5%", fp(analysis.playbookTP1), "#4ade80"],
                            ["TP2 +5%", fp(analysis.playbookTP2), "#22c55e"],
                          ].map(([label, val, color]) => (
                            <div key={label}>
                              <div style={{ fontSize: 9, color: "#6b7280" }}>{label}</div>
                              <div style={{ fontSize: 12, color, fontFamily: "var(--mono)", fontWeight: 700 }}>${val}</div>
                            </div>
                          ))}
                        </div>
                        {analysis.sessionAdjustedStop !== analysis.stopLoss && (
                          <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 7,
                            background: "rgba(251,146,60,0.08)", border: "1px solid #fb923c30" }}>
                            <div style={{ fontSize: 9, color: "#fb923c", fontWeight: 800, letterSpacing: 1 }}>SESSION-ADJUSTED STOP</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                              <span style={{ fontSize: 13, color: "#fb923c", fontFamily: "var(--mono)", fontWeight: 700 }}>${fp(analysis.sessionAdjustedStop)}</span>
                              <span style={{ fontSize: 10, color: "#6b7280" }}>wider stop to survive Asian sweep</span>
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8, fontFamily: "var(--mono)" }}>
                          Risk: <span style={{ color: "#f87171" }}>{analysis.riskPct.toFixed(2)}%</span>
                          {" · R:R ≈ "}<span style={{ color: "#4ade80" }}>{analysis.rrRatio.toFixed(1)}:1</span>
                          {" · Max hold: "}<span style={{ color: "#fbbf24" }}>48H</span>
                        </div>
                      </div>
                    )}

                    {/* Export for AI */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const payload = buildExportPayload(symbol, name, narrative, analysis, btcAnalysis);
                        navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                        setCopied(symbol);
                        setTimeout(() => setCopied(null), 2000);
                      }}
                      style={{
                        width: "100%", marginTop: 14, padding: "10px 0", borderRadius: 8,
                        background: copied === symbol ? "#166534" : "#1e1b4b",
                        border: `1px solid ${copied === symbol ? "#22c55e50" : "#312e8180"}`,
                        color: copied === symbol ? "#4ade80" : "#a5b4fc",
                        fontSize: 12, fontWeight: 800, letterSpacing: 1.2, cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      {copied === symbol ? "COPIED — PASTE INTO AI" : "COPY FOR AI ANALYSIS"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0 8px", color: "#4b5563", fontSize: 10 }}>
          <p>Score ≥ 40 + BTC safe = screenshot for AI</p>
          <p style={{ marginTop: 2 }}>Binance public API · Auto-refresh 5min · Not financial advice</p>
        </div>
      </main>

      {/* ── Multi-Select Action Bar ── */}
      {selectMode && selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 150,
          background: "rgba(10,10,18,0.95)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid #312e8180", padding: "12px 16px",
        }}>
          <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#a5b4fc" }}>
              {selected.size} token{selected.size > 1 ? "s" : ""} selected
            </div>
            <button onClick={() => { setSelected(new Set()); }} style={{
              background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#6b7280",
              padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>CLEAR</button>
            <button onClick={() => {
              const all = displayed.filter(t => t.analysis).map(t => t.symbol);
              setSelected(new Set(all));
            }} style={{
              background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#94a3b8",
              padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>ALL</button>
            <button onClick={copySelected} style={{
              background: copied === "__multi__" ? "#166534" : "#818cf8",
              border: "none", color: "#fff",
              padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 800, letterSpacing: 0.8,
              cursor: "pointer", transition: "background 0.2s",
            }}>
              {copied === "__multi__" ? "COPIED!" : "COPY FOR AI"}
            </button>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && <SettingsModal tokens={tokens} onSave={saveTokens} onClose={() => setShowSettings(false)} />}
    </div>
  );
}