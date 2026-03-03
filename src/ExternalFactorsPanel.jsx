import { useState, useEffect, useRef, useCallback } from "react";

// ─── Macro Calendar 2026 ─────────────────────────────────────────
// Source: federalreserve.gov · bls.gov/schedule/news_release/cpi.htm · bls.gov/schedule/news_release/empsit.htm
// !! UPDATE THESE ARRAYS at the start of each new year !!
const CALENDAR_YEAR = 2026;
const FOMC_DATES_2026 = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-16",
];
const CPI_DATES_2026 = [
  "2026-01-14", "2026-02-11", "2026-03-11", "2026-04-10",
  "2026-05-13", "2026-06-10", "2026-07-14", "2026-08-12",
  "2026-09-11", "2026-10-13", "2026-11-12", "2026-12-10",
];
const NFP_DATES_2026 = [
  "2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03",
  "2026-05-08", "2026-06-05", "2026-07-02", "2026-08-07",
  "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
];

const RISK_KEYWORDS = [
  "hack", "exploit", "breach", "liquidation", "crash", "ban", "sec", "lawsuit",
  "bankrupt", "rug", "scam", "fdic", "regulation", "arrest", "fraud", "emergency",
  "panic", "collapse", "seized", "shut down", "insolvent",
];

// ─── Helpers ─────────────────────────────────────────────────────
function todayUTC()    { return new Date().toISOString().slice(0, 10); }
function tomorrowUTC() { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }

function getNextEvents() {
  const today = todayUTC();
  return [
    ...FOMC_DATES_2026.map(d => ({ date: d, type: "FOMC" })),
    ...CPI_DATES_2026.map(d  => ({ date: d, type: "CPI"  })),
    ...NFP_DATES_2026.map(d  => ({ date: d, type: "NFP"  })),
  ].filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
}

function getFngColor(v) {
  if (v === null) return "#6b7280";
  if (v <= 25) return "#ef4444";
  if (v <= 45) return "#f97316";
  if (v <= 55) return "#eab308";
  if (v <= 75) return "#84cc16";
  return "#22c55e";
}

// ─── Fear & Greed Semicircle Gauge ───────────────────────────────
function FngGauge({ value, label }) {
  const color = getFngColor(value);
  const cx = 60, cy = 58, r = 44;
  const trackD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  let fillD = null;
  let needleX = cx, needleY = cy - (r - 10);

  if (value !== null) {
    const pct = Math.min(Math.max(value, 0.5), 99.5) / 100;
    const angle = Math.PI * (1 - pct);
    const nr = r - 10;
    needleX = cx + nr * Math.cos(angle);
    needleY = cy - nr * Math.sin(angle);
    if (value > 0) {
      const fx = cx + r * Math.cos(angle);
      const fy = cy - r * Math.sin(angle);
      fillD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${fx} ${fy}`;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="100%" viewBox="0 0 120 68" style={{ maxWidth: 120 }}>
        <path d={trackD} fill="none" stroke="#1e1e2e" strokeWidth={7} strokeLinecap="round" />
        {fillD && <path d={fillD} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />}
        {value !== null && (
          <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        )}
        <circle cx={cx} cy={cy} r={3.5} fill={value !== null ? color : "#374151"} />
        <text x={cx} y={cy - 15} textAnchor="middle" fill={value !== null ? color : "#6b7280"}
          fontSize={15} fontWeight={800} fontFamily="'JetBrains Mono','Fira Code',monospace">
          {value !== null ? value : "—"}
        </text>
      </svg>
      <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: -2, letterSpacing: 0.3, textAlign: "center" }}>
        {label || "—"}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function ExternalFactorsPanel() {
  const [fng, setFng]           = useState(null);
  const [btcDom, setBtcDom]     = useState(null);
  const [news, setNews]         = useState([]);
  const [fetching, setFetching] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  const [expandMacro, setExpandMacro] = useState(false);
  const timerRef = useRef(null);

  const macroEvents = getNextEvents();
  const today    = todayUTC();
  const tomorrow = tomorrowUTC();

  // Calendar outdated check — shown when current year > CALENDAR_YEAR
  const calendarOutdated = new Date().getFullYear() > CALENDAR_YEAR;

  const riskArticles = news.filter(a =>
    RISK_KEYWORDS.some(k => `${a.title || ""} ${a.body || ""}`.toLowerCase().includes(k))
  );

  // ── Verdict — playbook Section 2 order matters, do not reorder ──
  const todayEvent    = macroEvents.find(e => e.date === today);
  const tomorrowEvent = macroEvents.find(e => e.date === tomorrow);
  const verdict =
    todayEvent
      ? { label: "NO TRADE",      icon: "🚫", color: "#ef4444", bg: "rgba(127,29,29,0.35)",  border: "#ef444448", reason: `${todayEvent.type} today — 12H blackout window active` }
    : tomorrowEvent
      ? { label: "CAUTION",       icon: "⚡", color: "#eab308", bg: "rgba(113,63,18,0.35)",  border: "#eab30848", reason: `${tomorrowEvent.type} tomorrow — reduce to 50% position size` }
    : riskArticles.length >= 3
      ? { label: "HIGH RISK",     icon: "⚠",  color: "#f97316", bg: "rgba(124,45,18,0.35)",  border: "#f9731648", reason: `${riskArticles.length} high-risk headlines active — verify before entering` }
    : fng?.value <= 20
      ? { label: "EXTREME FEAR",  icon: "😱", color: "#eab308", bg: "rgba(113,63,18,0.3)",   border: "#eab30848", reason: "F&G ≤ 20 — raise confirmation bar before entry" }
    : fng?.value >= 85
      ? { label: "EXTREME GREED", icon: "🤑", color: "#eab308", bg: "rgba(113,63,18,0.3)",   border: "#eab30848", reason: "F&G ≥ 85 — tighten stops, reversal risk elevated" }
      : { label: "CLEAR",         icon: "✅", color: "#22c55e", bg: "rgba(6,78,59,0.2)",     border: "#22c55e48", reason: "No macro events or risk flags. Proceed to chart analysis." };

  // ── Data Fetch ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setFetching(true);
    const [fngRes, globalRes, newsRes] = await Promise.allSettled([
      fetch("https://api.alternative.me/fng/?limit=3").then(r => r.json()),
      fetch("https://api.coingecko.com/api/v3/global").then(r => r.json()),
      fetch("https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=30").then(r => r.json()),
    ]);

    if (fngRes.status === "fulfilled") {
      const d = fngRes.value?.data?.[0];
      if (d) setFng({ value: parseInt(d.value), label: d.value_classification, prev: parseInt(fngRes.value.data[1]?.value ?? d.value) });
    }
    if (globalRes.status === "fulfilled") {
      const dom = globalRes.value?.data?.market_cap_percentage?.btc;
      if (dom !== undefined) setBtcDom(parseFloat(dom.toFixed(1)));
    }
    if (newsRes.status === "fulfilled") {
      const articles = newsRes.value?.Data;
      if (Array.isArray(articles)) setNews(articles);
    }

    setFetching(false);
    setLastFetch(new Date());
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, 15 * 60 * 1000);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  // ── Checklist ────────────────────────────────────────────────────
  const sentimentOk   = fng === null || (fng.value > 20 && fng.value < 85);
  const sentimentWarn = fng !== null && (fng.value <= 35 || fng.value >= 70);
  const checklist = [
    {
      auto: true,
      pass: !todayEvent,
      warn: !todayEvent && !!tomorrowEvent,
      label: "No macro events within 12H",
      detail: todayEvent ? `${todayEvent.type} TODAY 🚫` : tomorrowEvent ? `${tomorrowEvent.type} tomorrow ⚡` : "Clear",
    },
    {
      auto: true,
      pass: sentimentOk,
      warn: sentimentOk && sentimentWarn,
      label: "Sentiment acceptable",
      detail: fng ? `F&G ${fng.value} — ${fng.label}` : fetching ? "Loading…" : "Unavailable",
    },
    {
      auto: true,
      pass: riskArticles.length < 3,
      warn: riskArticles.length > 0 && riskArticles.length < 3,
      label: "No high-risk news",
      detail: `${riskArticles.length} risk headline${riskArticles.length !== 1 ? "s" : ""}`,
    },
    { auto: false, label: "Emotional state ≥7/10", detail: "Playbook §6.2 — self-assess" },
  ];

  return (
    <>
      {/* ── Calendar Outdated Warning ── */}
      {calendarOutdated && (
        <div style={{
          background: "rgba(127,29,29,0.25)", border: "1px solid #ef444440",
          borderRadius: 10, padding: "8px 12px", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <div>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#f87171" }}>
              MACRO CALENDAR OUTDATED
            </span>
            <span style={{ fontSize: 9, color: "#fca5a5", marginLeft: 6 }}>
              Update FOMC / CPI / NFP date arrays in ExternalFactorsPanel.jsx for {new Date().getFullYear()}
            </span>
          </div>
        </div>
      )}

      {/* ── Verdict Banner ── */}
      <div className="card" style={{
        background: verdict.bg, border: `1px solid ${verdict.border}`,
        borderRadius: 12, padding: "10px 14px", marginBottom: 8,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: verdict.color, letterSpacing: 1.5 }}>
            {verdict.icon} EXTERNAL FACTORS — {verdict.label}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{verdict.reason}</div>
        </div>
        <button onClick={fetchAll} disabled={fetching} style={{
          background: "none", border: "none", cursor: fetching ? "default" : "pointer",
          color: fetching ? "#4b5563" : "#6b7280", fontSize: 16, padding: "0 0 0 8px", lineHeight: 1,
        }}>
          <span className={fetching ? "spin" : ""} style={{ display: "inline-block" }}>⟳</span>
        </button>
      </div>

      {/* ── Row: F&G + BTC Dominance + Macro Calendar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>

        {/* Fear & Greed */}
        <div className="card" style={{
          background: "#12121e", border: "1px solid #1e1e2e",
          borderRadius: 12, padding: "10px 6px 6px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        }}>
          {fetching && !fng
            ? <div className="shimmer" style={{ width: "100%", height: 76, borderRadius: 8 }} />
            : <FngGauge value={fng?.value ?? null} label={fng?.label ?? "—"} />
          }
          {fng && (
            <div style={{ fontSize: 9, color: "#6b7280", textAlign: "center" }}>
              prev {fng.prev} {fng.prev > fng.value ? "↓" : fng.prev < fng.value ? "↑" : "→"}
            </div>
          )}
          <div style={{ fontSize: 8, color: "#374151", letterSpacing: 0.5, marginTop: 1 }}>FEAR & GREED</div>
        </div>

        {/* BTC Dominance */}
        <div className="card" style={{
          background: "#12121e", border: "1px solid #1e1e2e",
          borderRadius: 12, padding: 10,
          display: "flex", flexDirection: "column", justifyContent: "center", gap: 5,
        }}>
          <div style={{ fontSize: 8, color: "#6b7280", fontWeight: 700, letterSpacing: 1 }}>BTC DOM</div>
          {btcDom !== null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#f7931a", fontFamily: "var(--mono)", lineHeight: 1 }}>
                {btcDom}%
              </div>
              <div style={{ background: "#1a1a2e", borderRadius: 4, height: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${Math.min(btcDom, 100)}%`,
                  background: btcDom > 55 ? "#f7931a" : btcDom < 45 ? "#34d399" : "#60a5fa",
                  transition: "width 0.6s ease",
                }} />
              </div>
              <div style={{ fontSize: 9, color: "#6b7280" }}>
                {btcDom > 55 ? "BTC-led · alts lag" : btcDom < 45 ? "Alt season" : "Balanced"}
              </div>
            </>
          ) : (
            <div className="shimmer" style={{ height: 52, borderRadius: 6 }} />
          )}
        </div>

        {/* Macro Calendar */}
        <div className="card" style={{
          background: "#12121e", border: "1px solid #1e1e2e",
          borderRadius: 12, padding: 10,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 8, color: "#6b7280", fontWeight: 700, letterSpacing: 1 }}>NEXT MACRO</div>
            <button onClick={() => setExpandMacro(p => !p)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#374151", fontSize: 9, padding: 0, lineHeight: 1,
            }}>
              {expandMacro ? "▲" : "▼"}
            </button>
          </div>
          {macroEvents.slice(0, expandMacro ? 6 : 3).map(e => {
            const isToday    = e.date === today;
            const isTomorrow = e.date === tomorrow;
            const col = isToday ? "#ef4444" : isTomorrow ? "#eab308" : "#6b7280";
            return (
              <div key={`${e.type}-${e.date}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? "#ef4444" : isTomorrow ? "#eab308" : "#818cf8" }}>
                  {e.type}
                </span>
                <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: col }}>
                  {isToday ? "TODAY" : isTomorrow ? "TMRW" : e.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Risk Headlines ── */}
      <div className="card" style={{
        background: "#12121e", border: "1px solid #1e1e2e",
        borderRadius: 12, padding: 10, marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: riskArticles.length > 0 ? "#f97316" : "#4b5563" }}>
            ⚠ RISK HEADLINES{riskArticles.length > 0 ? ` (${riskArticles.length})` : " — CLEAR"}
          </div>
          {lastFetch && (
            <span style={{ fontSize: 9, color: "#374151", fontFamily: "var(--mono)" }}>
              {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {fetching && news.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[1, 2, 3].map(i => <div key={i} className="shimmer" style={{ height: 38, borderRadius: 6 }} />)}
          </div>
        ) : riskArticles.length === 0 ? (
          <div style={{ fontSize: 11, color: "#374151", padding: "12px 0", textAlign: "center" }}>
            No high-risk headlines detected
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
            {riskArticles.slice(0, 8).map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{
                display: "block",
                background: "rgba(127,29,29,0.18)", border: "1px solid #ef444428",
                borderRadius: 6, padding: "6px 8px", textDecoration: "none",
              }}>
                <div style={{ fontSize: 10, color: "#fca5a5", lineHeight: 1.45 }}>
                  {(a.title || "").slice(0, 92)}{(a.title || "").length > 92 ? "…" : ""}
                </div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                  {a.source_info?.name || a.source || "—"}
                  {a.published_on ? ` · ${new Date(a.published_on * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Pre-Trade Checklist ── */}
      <div className="card" style={{
        background: "#12121e", border: "1px solid #1e1e2e",
        borderRadius: 12, padding: 10, marginBottom: 8,
      }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#4b5563", letterSpacing: 1.5, marginBottom: 8 }}>
          PRE-TRADE CHECKLIST
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checklist.map((item, i) => {
            const icon  = !item.auto ? "○" : !item.pass ? "✗" : item.warn ? "~" : "✓";
            const color = !item.auto ? "#6b7280" : !item.pass ? "#ef4444" : item.warn ? "#eab308" : "#22c55e";
            return (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color, minWidth: 12, fontFamily: "var(--mono)" }}>
                  {icon}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, color: "#e2e8f0" }}>{item.label}</span>
                  <span style={{ fontSize: 9, color: "#6b7280", marginLeft: 6 }}>{item.detail}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: "#1a1a2e", marginBottom: 8, marginLeft: -12, marginRight: -12 }} />
    </>
  );
}
