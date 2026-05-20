import { useRef, useEffect } from "react";
import { getMetricColor, aqiStandardColor } from "../utils/colormaps";

// ── AQI band definitions ──────────────────────────────────────────────────────
const AQI_BANDS = [
  { label: "Good",           min: 0,   max: 50,  color: "#22c55e" },
  { label: "Moderate",       min: 51,  max: 100, color: "#eab308" },
  { label: "Unhealthy (S.)", min: 101, max: 150, color: "#f97316" },
  { label: "Unhealthy",      min: 151, max: 200, color: "#ef4444" },
  { label: "Very Unhealthy", min: 201, max: 300, color: "#a855f7" },
  { label: "Hazardous",      min: 301, max: 999, color: "#7f1d1d" },
];

// Standard hardcoded AQI color (used as fallback when colormap === "aqi")
export const aqiColor = (v) =>
  v == null ? "#666" : AQI_BANDS.find((b) => v >= b.min && v <= b.max)?.color ?? "#7f1d1d";

// Colormap-aware color — uses getMetricColor when a non-default colormap is active
const metricColor = (metric, value, colormap) => {
  if (!colormap || colormap === "aqi") return aqiColor(value);
  return getMetricColor(metric ?? "us_aqi", value, colormap);
};

// UV band legend entries (for the UV Index legend card)
const UV_BANDS = [
  { label: "Low",       min: 0,  max: 2,  color: "#22c55e" },
  { label: "Moderate",  min: 3,  max: 5,  color: "#eab308" },
  { label: "High",      min: 6,  max: 7,  color: "#f97316" },
  { label: "Very High", min: 8,  max: 10, color: "#ef4444" },
  { label: "Extreme",   min: 11, max: 99, color: "#a855f7" },
];

// ── DraggableCard ─────────────────────────────────────────────────────────────
export function DraggableCard({ id, x: initX, y: initY, onPositionSave, children, theme, title }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const ref  = useRef(null);
  const pos  = useRef({ x: initX ?? 12, y: initY ?? 56 });

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
    <div ref={ref} style={{
      position: "fixed",
      left: pos.current.x,
      top:  pos.current.y,
      zIndex: 100, userSelect: "none",
      background: `${c.panel}ee`, border: `1px solid ${c.border}`,
      borderRadius: theme.shape.cardRadius,
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      backdropFilter: "blur(10px)", minWidth: 180,
      overflow: "hidden",
    }}>
      <div onMouseDown={onMouseDown} style={{
        padding: "6px 10px 5px",
        background: c.surface,
        borderBottom: `1px solid ${c.border}`,
        cursor: "grab", display: "flex", alignItems: "center", gap: 6,
      }}>
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
export function KpiTop5({ data, mode, theme, colormap }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const sorted = [...(data || [])]
    .filter((d) => d.us_aqi != null)
    .sort((a, b) => mode === "worst" ? (b.us_aqi - a.us_aqi) : (a.us_aqi - b.us_aqi))
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
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700,
            color: metricColor("us_aqi", city.us_aqi, colormap) }}>
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
// When colormap is "aqi" → shows standard AQI band colors with labels.
// When colormap is anything else → shows a gradient swatch of the active colormap
// with representative AQI values colored through it.
export function KpiLegend({ theme, colormap }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const useStandard = !colormap || colormap === "aqi";

  // Representative sample values across the AQI scale for gradient colormaps
  const SAMPLE_VALUES = [
    { label: "Good",           value: 25  },
    { label: "Moderate",       value: 75  },
    { label: "Unhealthy (S.)", value: 125 },
    { label: "Unhealthy",      value: 175 },
    { label: "Very Unhealthy", value: 250 },
    { label: "Hazardous",      value: 350 },
  ];

  return (
    <div style={{ padding: "8px 12px 10px" }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.18em",
        color: c.textSubtle, textTransform: "uppercase", marginBottom: 6 }}>US AQI</div>
      {(useStandard ? AQI_BANDS : SAMPLE_VALUES).map((b, i) => {
        const dotColor = useStandard
          ? b.color
          : getMetricColor("us_aqi", b.value, colormap);
        const rangeText = useStandard
          ? `${b.min}–${b.max === 999 ? "300+" : b.max}`
          : `~${b.value}`;
        return (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <span style={{ fontFamily: mono, fontSize: 10, color: c.textMuted }}>{b.label}</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle, marginLeft: "auto" }}>
              {rangeText}
            </span>
          </div>
        );
      })}
      {!useStandard && (
        <div style={{ fontFamily: mono, fontSize: 8, color: c.textSubtle, marginTop: 4,
          letterSpacing: "0.08em", opacity: 0.7 }}>
          {colormap} colormap
        </div>
      )}
    </div>
  );
}

// ── UV Index Legend card ──────────────────────────────────────────────────────
// Separate legend for the UV Index tab — always uses WHO UV band colors.
export function KpiUVLegend({ theme, colormap }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const useStandard = !colormap || colormap === "aqi";

  const UV_SAMPLES = [
    { label: "Low",       value: 1  },
    { label: "Moderate",  value: 4  },
    { label: "High",      value: 6.5},
    { label: "Very High", value: 9  },
    { label: "Extreme",   value: 12 },
  ];

  return (
    <div style={{ padding: "8px 12px 10px" }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.18em",
        color: c.textSubtle, textTransform: "uppercase", marginBottom: 6 }}>UV Index</div>
      {(useStandard ? UV_BANDS : UV_SAMPLES).map((b) => {
        const dotColor = useStandard
          ? b.color
          : getMetricColor("uv_index", b.value ?? (b.min + b.max) / 2, colormap);
        return (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <span style={{ fontFamily: mono, fontSize: 10, color: c.textMuted }}>{b.label}</span>
            <span style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle, marginLeft: "auto" }}>
              {useStandard ? `${b.min}–${b.max === 99 ? "11+" : b.max}` : `~${b.value}`}
            </span>
          </div>
        );
      })}
      {!useStandard && (
        <div style={{ fontFamily: mono, fontSize: 8, color: c.textSubtle, marginTop: 4,
          letterSpacing: "0.08em", opacity: 0.7 }}>
          {colormap} colormap
        </div>
      )}
    </div>
  );
}

// ── Global average card ───────────────────────────────────────────────────────
export function KpiGlobalAvg({ data, metric, metricMeta, theme, colormap }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const valid = (data || []).filter((d) => d[metric] != null);
  const avg   = valid.length
    ? Math.round(valid.reduce((s, d) => s + d[metric], 0) / valid.length * 10) / 10
    : null;
  const max   = valid.length ? Math.max(...valid.map((d) => d[metric])) : null;
  const min   = valid.length ? Math.min(...valid.map((d) => d[metric])) : null;
  const m     = metricMeta?.[metric] ?? { label: "US AQI", unit: "" };

  const valColor = avg != null
    ? metricColor(metric, avg, colormap)
    : c.accent;

  return (
    <div style={{ padding: "8px 14px 12px" }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.1em",
        color: c.textSubtle, textTransform: "uppercase", marginBottom: 6 }}>
        {m.label} {m.unit ? `(${m.unit})` : ""}
      </div>
      <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700,
        color: valColor, lineHeight: 1, marginBottom: 8 }}>
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
export function KpiRegionSummary({ data, theme, colormap }) {
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
              background: metricColor("us_aqi", avg, colormap), borderRadius: 2 }} />
            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700,
              color: metricColor("us_aqi", avg, colormap) }}>{avg}</span>
          </div>
        </div>
      ))}
      <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle, marginTop: 6, letterSpacing: "0.1em" }}>
        AVG US AQI BY REGION
      </div>
    </div>
  );
}
