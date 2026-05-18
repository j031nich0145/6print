import { useRef, useEffect } from "react";

// ── AQI color ─────────────────────────────────────────────────────────────────
const AQI_BANDS = [
  { label: "Good",           min: 0,   max: 50,  color: "#22c55e" },
  { label: "Moderate",       min: 51,  max: 100, color: "#eab308" },
  { label: "Unhealthy (S.)", min: 101, max: 150, color: "#f97316" },
  { label: "Unhealthy",      min: 151, max: 200, color: "#ef4444" },
  { label: "Very Unhealthy", min: 201, max: 300, color: "#a855f7" },
  { label: "Hazardous",      min: 301, max: 999, color: "#7f1d1d" },
];
export const aqiColor = (v) =>
  v == null ? "#666" : AQI_BANDS.find((b) => v >= b.min && v <= b.max)?.color ?? "#7f1d1d";

// ── DraggableCard ─────────────────────────────────────────────────────────────
export function DraggableCard({ id, x: initX, y: initY, onPositionSave, children, theme, title }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const ref  = useRef(null);
  const pos  = useRef({ x: initX ?? 12, y: initY ?? 56 });

  // Update position if parent forces a new x/y (align action)
  useEffect(() => {
    pos.current = { x: initX ?? 12, y: initY ?? 56 };
    if (ref.current) {
      ref.current.style.left = pos.current.x + "px";
      ref.current.style.top  = pos.current.y + "px";
    }
  }, [initX, initY]);

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX - pos.current.x;
    const startY = e.clientY - pos.current.y;

    if (ref.current) ref.current.style.cursor = "grabbing";

    const onMove = (e) => {
      const W = window.innerWidth, H = window.innerHeight;
      const el = ref.current;
      const W2 = el ? el.offsetWidth  : 200;
      const H2 = el ? el.offsetHeight : 200;
      let x = Math.max(0, Math.min(e.clientX - startX, W - W2));
      let y = Math.max(44, Math.min(e.clientY - startY, H - H2));
      pos.current = { x, y };
      if (el) { el.style.left = x + "px"; el.style.top = y + "px"; }
    };

    const onUp = () => {
      if (ref.current) ref.current.style.cursor = "default";
      const W = window.innerWidth, H = window.innerHeight;
      const el = ref.current;
      const W2 = el ? el.offsetWidth  : 200;
      const H2 = el ? el.offsetHeight : 200;
      const SNAP = 40, PAD = 8;
      let { x, y } = pos.current;
      if (x < SNAP)           x = PAD;
      if (x + W2 > W - SNAP)  x = W - W2 - PAD;
      if (y < 44 + SNAP)      y = 44 + PAD;
      if (y + H2 > H - SNAP)  y = H - H2 - PAD;
      pos.current = { x, y };
      if (el) { el.style.left = x + "px"; el.style.top = y + "px"; }
      onPositionSave?.(id, x, y);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.current.x,   // read from ref — correct immediately, no useEffect flash
        top:  pos.current.y,
        zIndex: 100, userSelect: "none",
        background: `${c.panel}ee`, border: `1px solid ${c.border}`,
        borderRadius: theme.shape.cardRadius,
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        backdropFilter: "blur(10px)", minWidth: 180,
        overflow: "hidden",
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          padding: "6px 10px 5px",
          background: c.surface,
          borderBottom: `1px solid ${c.border}`,
          cursor: "grab", display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ color: c.textSubtle, fontSize: 11, letterSpacing: "0.08em" }}>⠿</span>
        <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em",
          textTransform: "uppercase", color: c.textSubtle, flex: 1 }}>{title}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onPositionSave?.(id, -9999, -9999); }}
          title="Dismiss"
          style={{ background: "none", border: "none", color: c.textSubtle,
            fontSize: 14, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>
      {children}
    </div>
  );
}

// ── Top 5 card ────────────────────────────────────────────────────────────────
export function KpiTop5({ data, mode, theme }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const sorted = [...(data || [])]
    .filter((d) => d.us_aqi != null)
    .sort((a, b) => mode === "worst"
      ? (b.us_aqi - a.us_aqi)
      : (a.us_aqi - b.us_aqi))
    .slice(0, 5);

  return (
    <div style={{ padding: "8px 12px 10px" }}>
      {sorted.map((city, i) => (
        <div key={city.location} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, padding: "3px 0",
          borderBottom: i < 4 ? `1px solid ${c.border}` : "none",
        }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: c.textMuted }}>
            {i + 1}. {city.location}
          </span>
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: aqiColor(city.us_aqi) }}>
            {city.us_aqi}
          </span>
        </div>
      ))}
      <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle,
        marginTop: 6, letterSpacing: "0.1em", textAlign: "right" }}>
        {mode === "worst" ? "WORST" : "BEST"} US AQI · {(data || []).length} CITIES
      </div>
    </div>
  );
}

// ── AQI Legend card ───────────────────────────────────────────────────────────
export function KpiLegend({ theme }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  return (
    <div style={{ padding: "8px 12px 10px" }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.18em",
        color: c.textSubtle, textTransform: "uppercase", marginBottom: 6 }}>US AQI</div>
      {AQI_BANDS.map((b) => (
        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
          <span style={{ fontFamily: mono, fontSize: 10, color: c.textMuted }}>{b.label}</span>
          <span style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle, marginLeft: "auto" }}>
            {b.min}–{b.max === 999 ? "300+" : b.max}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Global average card ───────────────────────────────────────────────────────
export function KpiGlobalAvg({ data, metric, metricMeta, theme }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const valid = (data || []).filter((d) => d[metric] != null);
  const avg   = valid.length
    ? Math.round(valid.reduce((s, d) => s + d[metric], 0) / valid.length * 10) / 10
    : null;
  const max   = valid.length ? Math.max(...valid.map((d) => d[metric])) : null;
  const min   = valid.length ? Math.min(...valid.map((d) => d[metric])) : null;
  const m     = metricMeta?.[metric] ?? { label: "US AQI", unit: "" };

  return (
    <div style={{ padding: "8px 14px 12px" }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
        color: c.textSubtle, textTransform: "uppercase", marginBottom: 6 }}>
        {m.label} {m.unit ? `(${m.unit})` : ""}
      </div>
      <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700,
        color: metric === "us_aqi" || metric === "european_aqi" ? aqiColor(avg) : c.accent,
        lineHeight: 1, marginBottom: 8 }}>
        {avg ?? "—"}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {[["Min", min], ["Max", max]].map(([lbl, val]) => (
          <div key={lbl}>
            <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle }}>{lbl}</div>
            <div style={{ fontFamily: mono, fontSize: 12, color: c.text }}>{val?.toFixed(1) ?? "—"}</div>
          </div>
        ))}
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle }}>Cities</div>
          <div style={{ fontFamily: mono, fontSize: 12, color: c.text }}>{valid.length}</div>
        </div>
      </div>
    </div>
  );
}

// ── Region summary card ───────────────────────────────────────────────────────
export function KpiRegionSummary({ data, theme }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const byRegion = {};
  (data || []).forEach((city) => {
    if (city.us_aqi == null) return;
    byRegion[city.region] = byRegion[city.region] || [];
    byRegion[city.region].push(city.us_aqi);
  });
  const regions = Object.entries(byRegion)
    .map(([r, vals]) => ({ r, avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) }))
    .sort((a, b) => b.avg - a.avg).slice(0, 6);

  return (
    <div style={{ padding: "8px 12px 10px", minWidth: 200 }}>
      {regions.map(({ r, avg }, i) => (
        <div key={r} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10, padding: "3px 0",
          borderBottom: i < regions.length - 1 ? `1px solid ${c.border}` : "none",
        }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: c.textMuted }}>{r}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: Math.round(avg / 8), maxWidth: 60, height: 4,
              background: aqiColor(avg), borderRadius: 2 }} />
            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: aqiColor(avg) }}>{avg}</span>
          </div>
        </div>
      ))}
      <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle, marginTop: 6, letterSpacing: "0.1em" }}>
        AVG US AQI BY REGION
      </div>
    </div>
  );
}
