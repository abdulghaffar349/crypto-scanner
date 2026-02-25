import { useState, useEffect, useCallback, useRef, useMemo } from "react";

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
  const [o, h, l, c] = [parseFloat(last[1]), parseFloat(last[2]), parseFloat(last[3]), parseFloat(last[4])];
  const [po, , , pc] = [parseFloat(prev[1]), parseFloat(prev[2]), parseFloat(prev[3]), parseFloat(prev[4])];
  const body = Math.abs(c - o);
  const upperWick = h - Math.max(o, c);
  const lowerWick = Math.min(o, c) - l;

  if (c > o && body > Math.abs(pc - po) && c > po && o < pc) return { pattern: "Bullish Engulfing", bullish: true };
  if (c > o && lowerWick > body * 2 && upperWick < body * 0.3) return { pattern: "Hammer", bullish: true };
  if (c < o && upperWick > body * 2 && lowerWick < body * 0.3) return { pattern: "Shooting Star", bullish: false };
  if (c < o && body > Math.abs(pc - po) && c < po && o > pc) return { pattern: "Bearish Engulfing", bullish: false };
  if (c > o) return { pattern: "Green Candle", bullish: true };
  return { pattern: "Red Candle", bullish: false };
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
      const currentPrice = parseFloat(candles[candles.length - 1][4]);
      const gapMid = (l3 + h1) / 2;
      const inFVG = currentPrice >= h1 && currentPrice <= l3;
      const nearFVG = Math.abs(currentPrice - gapMid) / currentPrice < 0.015;
      if (inFVG || nearFVG) return { found: true, high: l3, low: h1, mid: gapMid, inZone: inFVG };
    }
  }
  return { found: false };
}

// ─── Session + Liquidity Analysis ────────────────────────────────
// Sessions in UTC: Asian 00:00-08:00 · London 08:00-16:00 · US 13:00-22:00
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
  };
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

  const { pattern, bullish } = detectCandlePattern(candles1h);
  const { supports, resistances, nearSupport } = findSupportResistance(candles1h);
  const fvg = detectFVG(candles1h);

  // Session + liquidity sweep
  const sessionInfo    = getSessionInfo();
  const asianRange     = detectAsianRange(candles1h);
  const liquiditySweep = detectLiquiditySweep(candles1h, supports, resistances, asianRange);

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

  let score = 0;
  let reasons = [];
  let setupType = "None";

  // ── RSI 1H scoring ──
  if (rsi1h !== null) {
    if (rsi1h >= 30 && rsi1h <= 40) { score += 30; reasons.push(`RSI 1H in primary zone (${rsi1h.toFixed(1)})`); }
    else if (rsi1h > 40 && rsi1h <= 50) { score += 15; reasons.push(`RSI 1H neutral (${rsi1h.toFixed(1)})`); }
    else if (rsi1h < 30) { score += 20; reasons.push(`RSI 1H deeply oversold (${rsi1h.toFixed(1)})`); }
    else if (rsi1h > 70) { score -= 20; reasons.push(`RSI 1H overbought (${rsi1h.toFixed(1)})`); }
  }

  // ── Multi-TF RSI alignment ──
  if (rsi1h !== null && rsi4h !== null) {
    if (rsi1h < 40 && rsi4h < 40) { score += 15; reasons.push(`RSI aligned oversold (4H: ${rsi4h.toFixed(0)})`); }
    else if (rsi1h > 65 && rsi4h > 65) { score -= 15; reasons.push(`RSI aligned overbought (4H: ${rsi4h.toFixed(0)})`); }
    else if ((rsi1h < 40 && rsi4h > 60) || (rsi1h > 60 && rsi4h < 40)) { score -= 5; reasons.push(`RSI timeframe divergence (4H: ${rsi4h.toFixed(0)})`); }
  }

  // ── Structure + EMA ──
  if (nearSupport) { score += 20; reasons.push("Price near key support level"); }
  if (priceVsEMA > -2 && priceVsEMA < 2) { score += 10; reasons.push(`Near 200 EMA (${priceVsEMA > 0 ? "+" : ""}${priceVsEMA.toFixed(1)}%)`); }

  // ── Volume scoring ──
  if (volRatio > 1.2) { score += 15; reasons.push(`Volume ${volRatio.toFixed(1)}x above average`); }
  else if (volRatio > 0.8) { score += 5; reasons.push("Adequate volume"); }
  else { reasons.push("⚠ Low volume — weak conviction"); }
  if (isVolumeClimax && nearSupport) { score += 10; reasons.push("Volume climax at support — accumulation"); }
  else if (isVolumeClimax && nearResistance) { score -= 5; reasons.push("Volume climax at resistance — distribution risk"); }

  // ── Candle patterns ──
  if (bullish && nearSupport) { score += 15; reasons.push(`${pattern} at support`); }
  else if (bullish) { score += 5; reasons.push(pattern); }
  if (fvg.found && fvg.inZone && rsi1h < 50) { score += 20; reasons.push("Price in FVG reclaim zone"); }

  // ── MACD ──
  if (macd) {
    if (macd.bullishCross) { score += 15; reasons.push("MACD bullish crossover"); }
    else if (macd.rising && macd.histogram < 0) { score += 5; reasons.push("MACD momentum improving"); }
    if (macd.bearishCross) { score -= 10; reasons.push("MACD bearish crossover"); }
  }

  // ── Trend direction ──
  if (closes1h.length >= 50) {
    if (inUptrend && rsi1h < 45) { score += 10; reasons.push(`Dip in uptrend (EMA20 > EMA50 by ${trendStrength.toFixed(1)}%)`); }
    else if (!inUptrend && rsi1h < 40) { score -= 10; reasons.push("Dip in downtrend — catching knife risk"); }
  }

  // ── Bollinger Bands ──
  if (bb) {
    if (bb.percentB < 0.15 && rsi1h < 40) { score += 15; reasons.push("Price at lower Bollinger Band + RSI oversold"); }
    else if (bb.percentB < 0.2) { score += 5; reasons.push("Near lower Bollinger Band"); }
    if (bb.squeeze) { score += 5; reasons.push("Bollinger squeeze — breakout imminent"); }
    if (bb.percentB > 0.95 && rsi1h > 65) { score -= 10; reasons.push("At upper BB + RSI high — overextended"); }
  }

  // ── Momentum (ROC) ──
  if (momentumImproving && rsi1h < 55) { score += 10; reasons.push(`Momentum improving (ROC: ${roc.toFixed(1)}%)`); }
  else if (roc < -8) { score -= 5; reasons.push(`Momentum deteriorating (ROC: ${roc.toFixed(1)}%)`); }

  // ── BTC risk ──
  if (!btcSafe) { score -= 40; reasons.push(`⛔ BTC risk-off (${btcChange4h.toFixed(1)}% on 4H)`); }

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

  // ── Setup detection ──
  if (rsi1h >= 30 && rsi1h <= 40 && nearSupport && bullish && volRatio > 0.8 && btcSafe) {
    setupType = "A: RSI + Structure"; score += 10;
  } else if (fvg.found && fvg.inZone && rsi1h < 50 && btcSafe) {
    setupType = "B: FVG Reclaim";
  } else if (rsi1h < 60 && change24h < 2 && btcSafe && score >= 40) {
    setupType = "C: Momentum Candidate";
  }

  // ── ATR-based trade levels ──
  const nearestSupport = supports[0] || currentPrice * 0.98;
  const atrStop = atr ? currentPrice - (atr * 1.5) : currentPrice * 0.985;
  const supportStop = nearestSupport * 0.995;
  const stopLoss = setupType.startsWith("C") ? (atr ? currentPrice - atr * 1.5 : currentPrice * 0.985) : Math.max(atrStop, supportStop);
  const tp1 = atr ? currentPrice + atr * 2 : currentPrice * 1.035;
  const tp2 = atr ? currentPrice + atr * 3.5 : currentPrice * 1.05;
  const riskPct = ((currentPrice - stopLoss) / currentPrice) * 100;
  const rewardPct = ((tp1 - currentPrice) / currentPrice) * 100;
  const rrRatio = riskPct > 0 ? rewardPct / riskPct : 0;

  // Session-adjusted stop — wider to survive Asian low sweep before the real move
  let sessionAdjustedStop = stopLoss;
  if (asianRange && (sessionInfo.inAsian || sessionInfo.sessionTransitionRisk)) {
    const asianBuffer = asianRange.low * 0.995;
    if (asianBuffer < stopLoss) sessionAdjustedStop = asianBuffer;
  }

  return {
    rsi1h, rsi4h, currentPrice, ema200: currentEMA200, priceVsEMA,
    volRatio, pattern, bullish, supports, resistances, nearSupport,
    fvg, btcChange4h, btcSafe, change24h, score, reasons, setupType,
    stopLoss, tp1, tp2, riskPct, rrRatio,
    entry: setupType !== "None" && btcSafe,
    macd, inUptrend, trendStrength, atr, bb, roc, momentumImproving,
    volSpike, volContext, isVolumeClimax,
    sessionInfo, asianRange, liquiditySweep, sessionAdjustedStop,
  };
}

// ─── AI Export ───────────────────────────────────────────────────
function buildExportPayload(symbol, name, narrative, analysis, btcAnalysis) {
  const a = analysis;
  return {
    _instruction: "Analyze this token setup. Ask me for 1H and 4H chart screenshots if the setup looks strong. Focus on whether this is a valid entry or if I should wait.",
    token: { symbol: symbol.replace("USDT", ""), pair: symbol, name, narratives: narrative || [] },
    scanTime: new Date().toISOString(),
    session: {
      current: a.sessionInfo?.session,
      nextOpen: a.sessionInfo?.nextSession,
      minsToNext: a.sessionInfo?.minsToNext,
      dangerWindow: a.sessionInfo?.inDangerWindow,
      transitionRisk: a.sessionInfo?.sessionTransitionRisk,
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
      ratio: +a.volRatio.toFixed(2),
      spike: +a.volSpike.toFixed(2),
      climax: a.isVolumeClimax,
      context: a.volContext,
    },
    structure: {
      pattern: a.pattern,
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
      score: a.score,
      entry: a.entry,
      reasons: a.reasons,
    },
    tradeLevels: {
      entry: a.currentPrice,
      stopLoss: a.stopLoss,
      sessionAdjustedStop: a.sessionAdjustedStop !== a.stopLoss ? a.sessionAdjustedStop : null,
      tp1: a.tp1,
      tp2: a.tp2,
      riskPct: +a.riskPct.toFixed(2),
      rrRatio: +a.rrRatio.toFixed(2),
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

// ─── Settings Modal ──────────────────────────────────────────────
function SettingsModal({ tokens, onSave, onClose }) {
  const [list, setList] = useState(tokens.filter(t => t.role === "alt"));
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");

  const remove = (sym) => setList(prev => prev.filter(t => t.symbol !== sym));
  const add = () => {
    const sym = newSymbol.toUpperCase().replace(/[^A-Z]/g, "");
    if (!sym || !newName) return;
    const full = sym.endsWith("USDT") ? sym : sym + "USDT";
    if (list.find(t => t.symbol === full)) return;
    setList(prev => [...prev, { symbol: full, name: newName, role: "alt", narrative: [] }]);
    setNewSymbol("");
    setNewName("");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#12121e", borderTop: "1px solid #2a2a3e", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 500, maxHeight: "80vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>Token Watchlist</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Add Token */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={newSymbol} onChange={e => setNewSymbol(e.target.value)} placeholder="DOGE" style={{
            flex: 1, background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 8,
            padding: "8px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "var(--mono)", outline: "none",
          }} />
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Dogecoin" style={{
            flex: 1, background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 8,
            padding: "8px 12px", color: "#e2e8f0", fontSize: 13, outline: "none",
          }} />
          <button onClick={add} style={{ background: "#818cf8", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+</button>
        </div>

        {/* Token List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {list.map(t => (
            <div key={t.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1a1a2e", borderRadius: 8, padding: "8px 12px" }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                <span style={{ color: "#6b7280", fontSize: 11, fontFamily: "var(--mono)", marginLeft: 8 }}>{t.symbol}</span>
              </div>
              <button onClick={() => remove(t.symbol)} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>×</button>
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
  const [loading, setLoading] = useState(true);
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
  const timerRef = useRef(null);

  const toggleWatch = (symbol) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      localStorage.setItem("pb_watchlist", JSON.stringify([...next]));
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
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setProgress(0);
    const results = {};
    const total = tokens.length;
    for (let idx = 0; idx < total; idx++) {
      const token = tokens[idx];
      try {
        const [res1h, res4h] = await Promise.all([
          fetch(`https://api.binance.com/api/v3/klines?symbol=${token.symbol}&interval=1h&limit=210`),
          fetch(`https://api.binance.com/api/v3/klines?symbol=${token.symbol}&interval=4h&limit=100`),
        ]);
        if (res1h.ok && res4h.ok) {
          const [candles1h, candles4h] = await Promise.all([res1h.json(), res4h.json()]);
          results[token.symbol] = { candles1h, candles4h, ...token };
        }
      } catch (e) { console.warn(`Failed: ${token.symbol}`, e); }
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

  const altResults = useMemo(() =>
    tokens.filter(t => t.role === "alt").map(t => {
      const d = data[t.symbol];
      if (!d) return { ...t, analysis: null };
      return { ...t, analysis: scoreToken(d, btcData) };
    }).filter(t => t.analysis),
    [data, tokens, btcData]
  );

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

  const displayed = useMemo(() =>
    viewFilter === "watched" ? sorted.filter(t => watchlist.has(t.symbol)) : sorted,
    [sorted, viewFilter, watchlist]
  );

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
              <span style={{ width: 1, height: 10, background: "#2a2a3e", display: "inline-block" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: sessionInfo.sessionColor, letterSpacing: 0.5 }}>
                ● {sessionInfo.session}
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
              <MiniChart candles={btcData?.candles1h?.slice(-40)} width={110} height={44} />
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
                  background: "#312e81", color: "#c7d2fe", padding: "3px 8px",
                  borderRadius: 5, fontSize: 12, fontWeight: 700,
                }}>
                  {t.name} <span style={{ fontFamily: "var(--mono)", color: "#a5b4fc", fontSize: 10 }}>{t.analysis.score}</span>
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

        {/* ── View Filter + Sort ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
          {/* Watchlist filter toggle */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", flexShrink: 0, border: "1px solid #1e1e2e" }}>
            {[["all", "ALL"], ["watched", `★ ${watchlist.size}`]].map(([val, label]) => (
              <button key={val} onClick={() => setViewFilter(val)} style={{
                background: viewFilter === val ? (val === "watched" ? "#854d0e" : "#818cf8") : "#12121e",
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
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Tap the ★ on any token card to add it to your watchlist.</div>
          </div>
        )}

        {/* ── Token Cards ── */}
        {displayed.map(({ symbol, name, narrative, analysis }, idx) => {
          if (!analysis) return null;
          const isExpanded = expanded === symbol;
          const isGood = analysis.score >= 40 && analysis.btcSafe;
          const hasSetup = analysis.entry;
          const isSelected = selected.has(symbol);
          const bc = selectMode && isSelected ? "#818cf8" : hasSetup ? "#22c55e50" : isGood ? "#818cf850" : "#1e1e2e";

          return (
            <div key={symbol} className="card" style={{ animationDelay: `${idx * 0.04}s`, marginBottom: 8 }}>
              <div
                onClick={() => selectMode ? toggleSelect(symbol) : setExpanded(isExpanded ? null : symbol)}
                style={{
                  background: "#12121e", border: `1px solid ${bc}`, borderRadius: 12,
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
                        {hasSetup && (
                          <span style={{ background: "#166534", color: "#4ade80", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>SETUP</span>
                        )}
                        {analysis.liquiditySweep?.detected && (
                          <span style={{
                            background: analysis.liquiditySweep.bullish ? "#14532d" : "#7f1d1d",
                            color: analysis.liquiditySweep.bullish ? "#86efac" : "#fca5a5",
                            padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 800, letterSpacing: 1,
                          }}>
                            {analysis.liquiditySweep.bullish ? "SWEEP ↑" : "SWEEP ↓"}
                          </span>
                        )}
                        {analysis.sessionInfo?.sessionTransitionRisk && (
                          <span style={{ background: "#431407", color: "#fb923c", padding: "1px 6px", borderRadius: 3, fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>
                            SESSION RISK
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: analysis.setupType !== "None" ? "#fbbf24" : "#4b5563", fontWeight: 600 }}>{analysis.setupType}</span>
                        {narrative && narrative.length > 0 && <NarrativeTags narratives={narrative} />}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--mono)" }}>${fp(analysis.currentPrice)}</div>
                        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: analysis.change24h >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                          {analysis.change24h >= 0 ? "+" : ""}{analysis.change24h.toFixed(2)}%
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); toggleWatch(symbol); }} style={{
                        background: "none", border: "none", cursor: "pointer", padding: "2px 0 0",
                        fontSize: 18, color: watchlist.has(symbol) ? "#fbbf24" : "#2a2a3e",
                        transition: "color 0.2s", lineHeight: 1,
                      }}>★</button>
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
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700,
                        color: analysis.volRatio > 1.2 ? "#4ade80" : analysis.volRatio > 0.8 ? "#fbbf24" : "#f87171",
                      }}>{analysis.volRatio.toFixed(2)}x</span>
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
                    {/* Reasons */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 800, letterSpacing: 1.5, marginBottom: 6 }}>ANALYSIS</div>
                      {analysis.reasons.map((r, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#94a3b8", padding: "2px 0" }}>
                          <span style={{ color: "#818cf8", marginRight: 6 }}>›</span>{r}
                        </div>
                      ))}
                    </div>

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
                        ["Session", analysis.sessionInfo?.session || "—", analysis.sessionInfo?.sessionColor || null],
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
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
