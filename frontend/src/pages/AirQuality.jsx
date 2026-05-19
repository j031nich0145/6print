import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import axios from "axios";
import { getMetricColor, aqiStandardColor, COLORMAP_DEFS, resolveOceanColor } from "../utils/colormaps";

// ── AQI scale ─────────────────────────────────────────────────────────────────
const AQI_BANDS = [
  { label: "Good",           min: 0,   max: 50,  color: "#22c55e" },
  { label: "Moderate",       min: 51,  max: 100, color: "#eab308" },
  { label: "Unhealthy (S.)", min: 101, max: 150, color: "#f97316" },
  { label: "Unhealthy",      min: 151, max: 200, color: "#ef4444" },
  { label: "Very Unhealthy", min: 201, max: 300, color: "#a855f7" },
  { label: "Hazardous",      min: 301, max: 999, color: "#7f1d1d" },
];
const aqiColor = aqiStandardColor;

const dotRadius = (metric, v) => {
  if (v == null) return 5;
  if (metric === "us_aqi" || metric === "european_aqi")
    return Math.max(4, Math.min(20, 4 + (v / 60) * 8));
  return 6;
};

// ── GeoJSON helpers ───────────────────────────────────────────────────────────
const buildGeoJSON = (data, metric, colormap = "aqi") => ({
  type: "FeatureCollection",
  features: (data || []).map((city) => {
    const val = city[metric] ?? city.us_aqi;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [city.lon, city.lat] },
      properties: {
        id: city.location,
        color: getMetricColor(metric, val, colormap),
        radius: dotRadius(metric, val),
        cityJson: JSON.stringify(city),
      },
    };
  }),
});

const buildCountryAvg = (data, metric) => {
  const acc = {};
  (data || []).forEach((city) => {
    const v = city[metric] ?? city.us_aqi;
    if (v != null) { acc[city.country] = acc[city.country] || []; acc[city.country].push(v); }
  });
  return Object.fromEntries(
    Object.entries(acc).map(([k, vs]) => [k, vs.reduce((a, b) => a + b, 0) / vs.length])
  );
};

// ── Contributing factors ──────────────────────────────────────────────────────
const FACTORS = [
  { key: "dust",             name: "Dust",  unit: "μg/m³", thr: 500  },
  { key: "pm2_5",            name: "PM2.5", unit: "μg/m³", thr: 55   },
  { key: "pm10",             name: "PM10",  unit: "μg/m³", thr: 150  },
  { key: "ozone",            name: "Ozone", unit: "μg/m³", thr: 180  },
  { key: "nitrogen_dioxide", name: "NO₂",   unit: "μg/m³", thr: 200  },
  { key: "carbon_monoxide",  name: "CO",    unit: "μg/m³", thr: 9000 },
  { key: "sulphur_dioxide",  name: "SO₂",   unit: "μg/m³", thr: 500  },
];
const getFactors = (city) =>
  FACTORS.filter(({ key }) => city[key] > 0)
    .map(({ key, name, unit, thr }) => ({ name, unit, val: city[key], pct: Math.round((city[key] / thr) * 100) }))
    .sort((a, b) => b.pct - a.pct).slice(0, 4);

// ── Tooltip positioning ───────────────────────────────────────────────────────
const TW = 248; const TH = 270; const PAD = 14;
const smartPos = (x, y, W, H) => {
  const left = x + TW + PAD > W ? Math.max(4, x - TW - PAD) : x + PAD;
  let top = y - TH / 2;
  if (top < 44) top = Math.min(y + PAD, H - TH - 8);
  if (top + TH > H - 8) top = H - TH - 8;
  return { left, top: Math.max(44, top) };
};

// ── City popup ────────────────────────────────────────────────────────────────
function CityPopup({ city, pos, W, onClose, onViewTrend, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono, pw = 230;
  const left = pos.x + pw + 20 > W ? pos.x - pw - 14 : pos.x + 14;
  const rows = [
    ["US AQI", city.us_aqi, "", true],
    ["EU AQI", city.european_aqi, "", false],
    ["PM2.5",  city.pm2_5?.toFixed(1), "μg/m³", false],
    ["PM10",   city.pm10?.toFixed(1),  "μg/m³", false],
    ["NO₂",    city.nitrogen_dioxide?.toFixed(1), "μg/m³", false],
    ["Ozone",  city.ozone?.toFixed(1), "μg/m³", false],
    ["SO₂",    city.sulphur_dioxide?.toFixed(1), "μg/m³", false],
    ["Dust",   city.dust?.toFixed(1),  "μg/m³", false],
    ["UV",     city.uv_index?.toFixed(1), "", false],
  ].filter(([, v]) => v != null && v !== "null");
  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: "absolute", left, top: Math.max(8, pos.y - 60), zIndex: 50,
      background: c.panel, border: `1px solid ${c.border}`, borderRadius: theme.shape.cardRadius,
      padding: "12px 14px", width: pw, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: c.text }}>{city.location}</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: c.textSubtle }}>
            {[city.province, city.country].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: c.textMuted, fontSize: 18, cursor: "pointer", alignSelf: "flex-start" }}>×</button>
      </div>
      {rows.map(([label, val, unit, bold]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${c.border}`, fontFamily: mono, fontSize: 11 }}>
          <span style={{ color: c.textMuted }}>{label}</span>
          <span style={{ fontWeight: bold ? 700 : 400, color: bold ? aqiColor(city.us_aqi) : c.text }}>{val} {unit}</span>
        </div>
      ))}
      <button onClick={() => onViewTrend(city)} style={{
        marginTop: 10, width: "100%", padding: "6px 0",
        background: c.accentSubtle, border: `1px solid ${c.accent}`,
        borderRadius: theme.shape.buttonRadius, color: c.accent,
        fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", cursor: "pointer",
      }}>↗ View Trend</button>
    </div>
  );
}

// ── Trend panel ───────────────────────────────────────────────────────────────
function TrendPanel({ city, metric, metricMeta, onClose, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const [td, setTd] = useState([]), [ld, setLd] = useState(true);
  const m = metricMeta?.[metric] ?? { label: "US AQI", unit: "" };
  useEffect(() => {
    setLd(true);
    axios.get("/api/trend", { params: { city: city.location, metric } })
      .then((r) => setTd(r.data)).catch(console.error).finally(() => setLd(false));
  }, [city.location, metric]);
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 220,
      background: `${c.panel}f0`, backdropFilter: "blur(16px)", borderTop: `1px solid ${c.border}`,
      display: "flex", flexDirection: "column", zIndex: 40,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px 6px", borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: mono }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{city.location}</span>
          <span style={{ fontSize: 10, color: c.textSubtle, marginLeft: 10, letterSpacing: "0.1em" }}>
            {m.label.toUpperCase()} · 2023–PRESENT
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: c.textMuted, fontSize: 20, cursor: "pointer" }}>×</button>
      </div>
      <div style={{ flex: 1, padding: "6px 12px 6px 4px" }}>
        {ld ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 11, color: c.textMuted }}>Loading…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={td} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tickFormatter={(d) => d?.slice(0, 7)}
                tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }}
                axisLine={{ stroke: c.border }} tickLine={false} interval={45} />
              <YAxis tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, fontFamily: mono, fontSize: 11 }}
                labelStyle={{ color: c.textMuted }}
                formatter={(v) => [typeof v === "number" ? v.toFixed(1) : v, m.label]}
                labelFormatter={(d) => d?.slice(0, 10) ?? ""} />
              <Line type="monotone" dataKey={metric} stroke={aqiColor(city.us_aqi)} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────
function HoverTooltip({ info, W, H, theme, metric, colormap }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const { city, x, y } = info;
  const factors = getFactors(city);
  const metricVal = city[metric] ?? city.us_aqi;
  const aColor = getMetricColor(metric ?? "us_aqi", metricVal, colormap ?? "aqi");
  const { left, top } = smartPos(x, y, W, H);
  return (
    <div style={{
      position: "absolute", left, top, zIndex: 30, pointerEvents: "none",
      background: `${c.panel}f5`, border: `1px solid ${c.border}`, borderTop: `2px solid ${aColor}`,
      borderRadius: theme.shape.cardRadius, padding: "10px 13px", width: TW,
      backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", fontFamily: mono,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{city.location}</div>
      <div style={{ fontSize: 10, color: c.textSubtle, marginTop: 2 }}>
        {[city.province, city.country].filter(Boolean).join(" · ")}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 7, marginBottom: 8, background: `${aColor}1a`, border: `1px solid ${aColor}55`, borderRadius: 4, padding: "3px 8px" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: aColor }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: aColor }}>US AQI {city.us_aqi ?? "—"}</span>
      </div>
      {factors.length > 0 && (
        <>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: c.textSubtle, textTransform: "uppercase", marginBottom: 5 }}>Contributing Factors</div>
          {factors.map(({ name, val, unit, pct }) => {
            const bc = pct >= 200 ? "#ef4444" : pct >= 100 ? "#f97316" : pct >= 60 ? "#eab308" : "#22c55e";
            return (
              <div key={name} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                  <span style={{ color: c.textMuted }}>{name}</span>
                  <span style={{ color: c.text }}>{val?.toFixed(1)} {unit} <span style={{ color: bc }}>({pct}%)</span></span>
                </div>
                <div style={{ height: 3, background: c.surface, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: bc, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </>
      )}
      {city.population && (
        <div style={{ fontSize: 9, color: c.textSubtle, marginTop: 6 }}>
          {(city.population / 1e6).toFixed(1)}M pop · click for details
        </div>
      )}
    </div>
  );
}

// ── Static overlays ───────────────────────────────────────────────────────────
function AQILegend({ theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  return (
    <div style={{ position: "absolute", bottom: 52, left: 12, zIndex: 10, background: `${c.panel}ee`, border: `1px solid ${c.border}`, borderRadius: theme.shape.cardRadius, padding: "10px 12px", backdropFilter: "blur(8px)", pointerEvents: "none" }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.18em", color: c.textSubtle, textTransform: "uppercase", marginBottom: 7 }}>US AQI</div>
      {AQI_BANDS.map((b) => (
        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
          <span style={{ fontFamily: mono, fontSize: 10, color: c.textMuted }}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function TopCities({ data, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const top = (data || []).slice(0, 5);
  if (!top.length) return null;
  return (
    <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, background: `${c.panel}ee`, border: `1px solid ${c.border}`, borderRadius: theme.shape.cardRadius, padding: "10px 14px", backdropFilter: "blur(8px)", minWidth: 180, pointerEvents: "none" }}>
      {top.map((city, i) => (
        <div key={city.location} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: mono, padding: "3px 0", borderBottom: i < top.length - 1 ? `1px solid ${c.border}` : "none" }}>
          <span style={{ color: c.textMuted }}>{i + 1}. {city.location}</span>
          <span style={{ color: aqiColor(city.us_aqi), fontWeight: 700 }}>{city.us_aqi ?? "?"}</span>
        </div>
      ))}
      <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle, marginTop: 6, letterSpacing: "0.1em", textAlign: "right" }}>
        WORST AQI · {data.length} CITIES
      </div>
    </div>
  );
}

// ── Heatmap metric columns ────────────────────────────────────────────────────
const HM_METRICS = [
  { id:"us_aqi",           label:"AQI"   },
  { id:"pm2_5",            label:"PM2.5" },
  { id:"pm10",             label:"PM10"  },
  { id:"nitrogen_dioxide", label:"NO₂"  },
  { id:"ozone",            label:"Ozone" },
  { id:"dust",             label:"Dust"  },
];

// ── Chart type icon tabs ──────────────────────────────────────────────────────
const CHART_TABS = [
  { id:"bar",     icon:"▬▬", label:"Ranking"  },
  { id:"line",    icon:"∿",  label:"Trend"    },
  { id:"scatter", icon:"⬤⬤", label:"Compare"  },
  { id:"heatmap", icon:"▦",  label:"Heatmap"  },
];

// ── Charts view ───────────────────────────────────────────────────────────────
function ChartsView({ data, filters, metricMeta, theme, colormap, active, chartType, onChartType }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const m = metricMeta?.[filters.metric] ?? { label: "US AQI", unit: "" };

  // Line chart state — city selector + trend fetch
  const [lineCity, setLineCity]   = useState(null);
  const [lineTrend, setLineTrend] = useState([]);
  const [lineLoading, setLineLoading] = useState(false);

  // Auto-select top city when entering line view
  useEffect(() => {
    if (chartType === "line" && data?.length > 0 && !lineCity) {
      const sorted = [...data].sort((a, b) => (b[filters.metric] ?? 0) - (a[filters.metric] ?? 0));
      setLineCity(sorted[0]?.location ?? null);
    }
  }, [chartType, data]);

  // Reset lineCity when metric changes so the auto-select re-fires
  useEffect(() => {
    if (chartType === "line") setLineCity(null);
  }, [filters.metric]);

  // Fetch trend for selected city + metric
  useEffect(() => {
    if (!lineCity || chartType !== "line") return;
    setLineLoading(true);
    axios.get("/api/trend", { params: { city: lineCity, metric: filters.metric } })
      .then((r) => setLineTrend(r.data))
      .catch(console.error)
      .finally(() => setLineLoading(false));
  }, [lineCity, filters.metric]);

  // Bar data — top 30 by active metric
  const barData = [...(data || [])].filter((d) => d[filters.metric] != null)
    .sort((a, b) => (b[filters.metric] ?? 0) - (a[filters.metric] ?? 0))
    .slice(0, 30)
    .map((d) => ({ name: d.location, value: d[filters.metric], aqi: d.us_aqi }));

  // Scatter data — AQI vs PM2.5, bubble = population
  const scatterData = (data || []).filter((d) => d.us_aqi != null && d.pm2_5 != null).map((d) => ({
    x: d.us_aqi,
    y: d.pm2_5,
    z: Math.max(6, Math.min(22, (d.population || 1e6) / 400000)),
    name: d.location,
    country: d.country,
  }));

  // Heatmap rows — top 20 cities by active metric
  const hmCities = [...(data || [])].filter((d) => d[filters.metric] != null)
    .sort((a, b) => (b[filters.metric] ?? 0) - (a[filters.metric] ?? 0))
    .slice(0, 20);

  // City list for line chart selector
  const sortedCities = [...(data || [])].sort((a, b) => (b[filters.metric] ?? 0) - (a[filters.metric] ?? 0));

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: active ? 5 : 0,
      background: c.bg, display: "flex", flexDirection: "column", overflow: "hidden",
      opacity: active ? 1 : 0, visibility: active ? "visible" : "hidden",
      pointerEvents: active ? "auto" : "none",
      transition: "opacity 0.18s ease",
    }}>
      {/* Chart type tab bar */}
      <div style={{
        display: "flex", alignItems: "stretch",
        background: c.panel, borderBottom: `1px solid ${c.border}`, flexShrink: 0,
      }}>
        {CHART_TABS.map((tab) => {
          const isActive = chartType === tab.id;
          return (
            <button key={tab.id} onClick={() => onChartType(tab.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px",
              background: "transparent", border: "none",
              borderBottom: `2px solid ${isActive ? c.accent : "transparent"}`,
              color: isActive ? c.accent : c.textMuted,
              fontFamily: mono, fontSize: 10, letterSpacing: "0.1em",
              textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{tab.icon}</span>
              <span style={{ fontWeight: isActive ? 700 : 400 }}>{tab.label}</span>
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center",
          fontFamily: mono, fontSize: 9, color: c.textSubtle, letterSpacing: "0.1em", paddingRight: 16 }}>
          {m.label}{m.unit ? ` (${m.unit})` : ""} · {(data || []).length} CITIES
        </div>
      </div>

      {/* ── BAR: horizontal city ranking ── */}
      {chartType === "bar" && (
        <div style={{ flex: 1, minHeight: 0, padding: "0 16px 16px" }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.15em", color: c.textSubtle,
            textTransform: "uppercase", padding: "12px 0 8px" }}>
            Top 30 cities by {m.label}
          </div>
          <div style={{ height: "calc(100% - 36px)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 90, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }}
                  axisLine={{ stroke: c.border }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={90}
                  tick={{ fill: c.textMuted, fontSize: 10, fontFamily: mono }}
                  axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, fontFamily: mono, fontSize: 11 }}
                  labelStyle={{ color: c.text, fontWeight: 700 }}
                  formatter={(v) => [v?.toFixed(1), m.label]} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {barData.map((e, i) => (
                    <Cell key={i} fill={getMetricColor(filters.metric, e.value, colormap)} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── LINE: time-series trend for a city ── */}
      {chartType === "line" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle,
              letterSpacing: "0.12em", textTransform: "uppercase" }}>City</div>
            <select
              value={lineCity ?? ""}
              onChange={(e) => setLineCity(e.target.value)}
              style={{
                padding: "5px 10px", background: c.inputBg ?? c.surface,
                border: `1px solid ${c.inputBorder ?? c.border}`,
                borderRadius: 4, color: c.text, fontFamily: mono, fontSize: 11,
                cursor: "pointer", outline: "none", minWidth: 200,
              }}>
              {sortedCities.slice(0, 60).map((city) => (
                <option key={city.location} value={city.location}>{city.location}</option>
              ))}
            </select>
            {lineTrend.length > 0 && !lineLoading && (
              <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle }}>
                {lineTrend.length} data points · 2023–present
              </div>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: "8px 16px 16px 4px" }}>
            {lineLoading ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: mono, fontSize: 11, color: c.textMuted }}>Loading trend data…</div>
            ) : lineTrend.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: mono, fontSize: 11, color: c.textSubtle }}>
                Select a city to view its {m.label} trend
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineTrend} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" tickFormatter={(d) => d?.slice(0, 7)}
                    tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }}
                    axisLine={{ stroke: c.border }} tickLine={false} interval={45} />
                  <YAxis tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }}
                    axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, fontFamily: mono, fontSize: 11 }}
                    labelStyle={{ color: c.textMuted }}
                    formatter={(v) => [typeof v === "number" ? v.toFixed(1) : v, m.label]}
                    labelFormatter={(d) => d?.slice(0, 10) ?? ""} />
                  <Line type="monotone" dataKey={filters.metric}
                    stroke={c.accent} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── SCATTER: AQI vs PM2.5, bubble = population ── */}
      {chartType === "scatter" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 16px 0", fontFamily: mono, fontSize: 9,
            color: c.textSubtle, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
            US AQI vs PM2.5 · bubble size = population
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {scatterData.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: mono, fontSize: 11, color: c.textSubtle }}>No data with both AQI + PM2.5</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 16, right: 24, bottom: 36, left: 16 }}>
                  <XAxis type="number" dataKey="x" name="US AQI"
                    label={{ value: "US AQI", position: "insideBottom", offset: -8,
                      fill: c.textSubtle, fontFamily: mono, fontSize: 9 }}
                    tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }}
                    axisLine={{ stroke: c.border }} tickLine={false} />
                  <YAxis type="number" dataKey="y" name="PM2.5"
                    label={{ value: "PM2.5 μg/m³", angle: -90, position: "insideLeft", offset: 12,
                      fill: c.textSubtle, fontFamily: mono, fontSize: 9 }}
                    tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }}
                    axisLine={{ stroke: c.border }} tickLine={false} width={44} />
                  <ZAxis type="number" dataKey="z" range={[30, 600]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3", stroke: c.border }}
                    content={({ active: a, payload: p }) => {
                      if (!a || !p?.[0]) return null;
                      const d = p[0].payload;
                      return (
                        <div style={{ background: c.panel, border: `1px solid ${c.border}`,
                          borderRadius: 6, padding: "8px 12px", fontFamily: mono, fontSize: 10 }}>
                          <div style={{ fontWeight: 700, color: c.text, marginBottom: 4 }}>{d.name}</div>
                          <div style={{ color: c.textMuted }}>
                            AQI: <span style={{ color: aqiColor(d.x) }}>{d.x}</span>
                          </div>
                          <div style={{ color: c.textMuted }}>
                            PM2.5: <span style={{ color: c.text }}>{d.y?.toFixed(1)} μg/m³</span>
                          </div>
                          {d.country && (
                            <div style={{ color: c.textSubtle, marginTop: 2, fontSize: 9 }}>{d.country}</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={scatterData}
                    fill={`${c.accent}88`}
                    stroke={`${c.accent}cc`}
                    strokeWidth={0.5}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── HEATMAP: cities × metrics grid ── */}
      {chartType === "heatmap" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 16px 16px" }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: c.textSubtle,
            letterSpacing: "0.12em", textTransform: "uppercase", padding: "12px 0 10px" }}>
            Top 20 cities × key metrics
          </div>
          {hmCities.length === 0 ? (
            <div style={{ fontFamily: mono, fontSize: 11, color: c.textMuted }}>No data available</div>
          ) : (
            <div>
              {/* Column header */}
              <div style={{ display: "flex", marginBottom: 4, marginLeft: 124 }}>
                {HM_METRICS.map((hm) => (
                  <div key={hm.id} style={{
                    flex: 1, minWidth: 52,
                    fontFamily: mono, fontSize: 8, color: c.textSubtle,
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    textAlign: "center",
                  }}>{hm.label}</div>
                ))}
              </div>
              {/* Data rows */}
              {hmCities.map((city) => (
                <div key={city.location} style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
                  <div style={{
                    width: 124, flexShrink: 0, paddingRight: 8,
                    fontFamily: mono, fontSize: 10, color: c.textMuted,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    textAlign: "right",
                  }} title={city.location}>{city.location}</div>
                  {HM_METRICS.map((hm) => {
                    const val = city[hm.id];
                    const cellColor = val != null ? getMetricColor(hm.id, val, colormap) : c.surface;
                    return (
                      <div
                        key={hm.id}
                        title={val != null ? `${city.location} · ${hm.label}: ${val.toFixed(1)}` : "N/A"}
                        style={{
                          flex: 1, minWidth: 52, height: 24,
                          background: val != null ? cellColor : c.surface,
                          opacity: val != null ? 0.85 : 0.15,
                          margin: "0 1px", borderRadius: 2,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                        <span style={{
                          fontFamily: mono, fontSize: 8,
                          color: "rgba(255,255,255,0.9)", fontWeight: 600,
                          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                        }}>
                          {val != null ? (val > 99 ? Math.round(val) : val.toFixed(0)) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Module-level GeoJSON cache + constants ────────────────────────────────────
const COUNTRY_URL  = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson";
const PROVINCE_URL = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_1_states_provinces.geojson";
let _provinceGeoJson = null;

// Bounding boxes for region fly-to: [[minLng,minLat],[maxLng,maxLat]]
const REGION_BOUNDS = {
  "Canada":          [[-141, 41],  [-52,  84]],
  "United States":   [[-127, 24],  [-65,  50]],
  "Central America": [[-92,   7],  [-77,  21]],
  "South America":   [[-82, -56],  [-34,  13]],
  "Europe":          [[-25,  34],  [45,   72]],
  "Africa":          [[-18, -36],  [52,   38]],
  "Middle East":     [[25,   12],  [63,   42]],
  "Asia":            [[60,    1],  [150,  55]],
  "Central Asia":    [[45,   35],  [90,   56]],
  "Oceania":         [[112, -48],  [180,  -8]],
};

// ── Main component ────────────────────────────────────────────────────────────
export default function AirQuality({
  data, loading, filters, metricMeta, theme,
  viewMode, choropleth, colormap = "aqi",
  oceanPreset = "auto", oceanRefreshKey = 0,
  borderLevel = "country", showCities = true,
  satellite = false,
  chartType = "bar", onChartType,
}) {
  const c       = theme.colors;
  const mono    = theme.typography.fontFamilyMono;
  const isLight = !!(theme.meta.tags?.includes("light"));

  // Satellite replaces the basemap style
  const mapStyle = satellite
    ? "mapbox://styles/mapbox/satellite-streets-v12"
    : isLight ? "mapbox://styles/mapbox/light-v11" : "mapbox://styles/mapbox/dark-v11";

  const mapRef      = useRef(null);
  const mapInst     = useRef(null);
  const styleRef    = useRef(mapStyle);
  const bgRef       = useRef(c.bg);
  const dataRef     = useRef(data);
  const metricRef   = useRef(filters.metric);
  const choroRef    = useRef(choropleth);
  const colormapRef = useRef(colormap);
  const oceanRef    = useRef(oceanPreset);
  const borderLevelRef = useRef(borderLevel);
  const showCitiesRef  = useRef(showCities);
  const satelliteRef   = useRef(satellite);
  const lastOceanPresetRef    = useRef(oceanPreset);
  const lastOceanRefreshKeyRef = useRef(oceanRefreshKey);
  const styleReloadSeqRef = useRef(0);
  const eventsBoundRef    = useRef(false);
  const isLightRef        = useRef(isLight);
  const originalWaterColorsRef = useRef({});

  const [cSize,     setCSize]     = useState({ w: 1200, h: 700 });
  const [popup,     setPopup]     = useState(null);
  const [hover,     setHover]     = useState(null);
  const [trendCity, setTrendCity] = useState(null);

  // Track container size
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e]) => setCSize({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Keep refs current every render
  bgRef.current          = c.bg;
  isLightRef.current     = isLight;
  colormapRef.current    = colormap;
  oceanRef.current       = oceanPreset;
  borderLevelRef.current = borderLevel;
  showCitiesRef.current  = showCities;
  satelliteRef.current   = satellite;

  // ── Layer helpers ──────────────────────────────────────────────────────────
  const applyBg = (map, color) => {
    try { map.getContainer().style.background = color; } catch (_) {}
    try { map.getCanvas().style.background    = color; } catch (_) {}
    try {
      const bg = map.getStyle()?.layers?.find((l) => l.type === "background");
      if (bg) map.setPaintProperty(bg.id, "background-color", color);
    } catch (_) {}
  };

  // Snapshot native Mapbox water fill colors before we mutate them with applyOcean.
  // Called once per style load (in rehydrateMapLayers) so we can restore later.
  const captureWaterColors = (map) => {
    try {
      const captured = {};
      (map.getStyle()?.layers ?? []).forEach((layer) => {
        if (layer.type === "fill" && /^water/i.test(layer.id)) {
          try {
            const color = map.getPaintProperty(layer.id, "fill-color");
            if (color !== undefined) captured[layer.id] = color;
          } catch (_) {}
        }
      });
      if (Object.keys(captured).length > 0) {
        originalWaterColorsRef.current = captured;
      }
    } catch (_) {}
  };

  // Restore native water fill colors without triggering a full style reload.
  // Used when switching ocean preset back to "auto/Default".
  const resetOcean = (map) => {
    try {
      Object.entries(originalWaterColorsRef.current).forEach(([layerId, color]) => {
        try { map.setPaintProperty(layerId, "fill-color", color); } catch (_) {}
      });
    } catch (_) {}
  };

  const rehydrateMapLayers = (map, light) => {
    // Restores all custom overlays after a map.setStyle() wipes them.
    applyBg(map, bgRef.current);
    addLayers(map, light);
    if (!satelliteRef.current) captureWaterColors(map);
    if (!satelliteRef.current) applyOcean(map);
    // Apply city circle visibility
    const vis = showCitiesRef.current ? "visible" : "none";
    ["cities-dots", "cities-glow"].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    });
    setDots(map);
    updateCountries(map);
    setProvinces(map);
    // One idle pass to catch race-y style transitions
    map.once("idle", () => {
      try {
        setDots(map);
        updateCountries(map);
        setProvinces(map);
      } catch (_) {}
    });
  };

  const applyOcean = (map) => {
    if (!oceanRef.current || oceanRef.current === "auto") return;
    const color = resolveOceanColor(oceanRef.current, isLightRef.current);
    try {
      (map.getStyle()?.layers ?? []).forEach((layer) => {
        if (layer.type === "fill" && /^water/i.test(layer.id)) {
          try { map.setPaintProperty(layer.id, "fill-color", color); } catch (_) {}
        }
      });
    } catch (_) {}
  };

  const addLayers = (map, light) => {
    if (!map.getSource("cities")) {
      map.addSource("cities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getSource("countries")) {
      map.addSource("countries", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getSource("provinces")) {
      map.addSource("provinces", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }

    // Country fill — choropleth colors (opacity toggled by updateCountries)
    if (!map.getLayer("country-fill")) {
      map.addLayer({ id: "country-fill", type: "fill", source: "countries",
        paint: { "fill-color": ["coalesce", ["get", "fillColor"], "transparent"], "fill-opacity": 0 } });
    }
    // Country border lines — solid color, opacity toggled by updateCountries
    if (!map.getLayer("country-line")) {
      map.addLayer({ id: "country-line", type: "line", source: "countries",
        paint: {
          "line-color": light ? "rgba(60,60,60,0.55)" : "rgba(210,210,210,0.3)",
          "line-width": 0.8, "line-opacity": 0,
        } });
    }
    // Province / state border lines — toggled by setProvinces
    if (!map.getLayer("province-line")) {
      map.addLayer({ id: "province-line", type: "line", source: "provinces",
        layout: { visibility: "none" },
        paint: {
          "line-color": light ? "rgba(60,60,60,0.3)" : "rgba(200,200,200,0.18)",
          "line-width": 0.5, "line-opacity": 0.7,
        } });
    }
    // City circles
    if (!map.getLayer("cities-glow")) {
      map.addLayer({ id: "cities-glow", type: "circle", source: "cities",
        paint: { "circle-radius": ["*", ["get", "radius"], 2], "circle-color": ["get", "color"],
          "circle-opacity": 0.15, "circle-blur": 1 } });
    }
    if (!map.getLayer("cities-dots")) {
      map.addLayer({ id: "cities-dots", type: "circle", source: "cities",
        paint: { "circle-radius": ["get", "radius"], "circle-color": ["get", "color"],
          "circle-opacity": 0.85, "circle-stroke-width": 1.5,
          "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.4 } });
    }
    if (!map.getLayer("cities-hover")) {
      map.addLayer({ id: "cities-hover", type: "circle", source: "cities",
        filter: ["==", "id", ""],
        paint: { "circle-radius": ["*", ["get", "radius"], 1.5], "circle-color": "transparent",
          "circle-stroke-width": 2,
          "circle-stroke-color": light ? "#333" : "#fff", "circle-stroke-opacity": 0 } });
    }
    if (map.getLayer("cities-hover")) {
      map.setPaintProperty("cities-hover", "circle-stroke-color", light ? "#333" : "#fff");
    }

    if (eventsBoundRef.current) return;
    eventsBoundRef.current = true;

    map.on("mouseenter", "cities-dots", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const city = JSON.parse(e.features[0].properties.cityJson);
      const pt = map.project([city.lon, city.lat]);
      map.setFilter("cities-hover", ["==", "id", city.location]);
      map.setPaintProperty("cities-hover", "circle-stroke-opacity", 0.7);
      setHover({ city, x: pt.x, y: pt.y });
    });
    map.on("mouseleave", "cities-dots", () => {
      map.getCanvas().style.cursor = "";
      map.setFilter("cities-hover", ["==", "id", ""]);
      map.setPaintProperty("cities-hover", "circle-stroke-opacity", 0);
      setHover(null);
    });
    map.on("click", "cities-dots", (e) => {
      e.preventDefault();
      const city = JSON.parse(e.features[0].properties.cityJson);
      const pt = map.project([city.lon, city.lat]);
      setPopup({ city, x: pt.x, y: pt.y }); setTrendCity(null);
    });
    map.on("click", (e) => { if (!e.defaultPrevented) setPopup(null); });
    map.on("move", () => {
      setPopup((p) => { if (!p) return null; const pt = map.project([p.city.lon, p.city.lat]); return { ...p, x: pt.x, y: pt.y }; });
      setHover((p) => { if (!p) return null; const pt = map.project([p.city.lon, p.city.lat]); return { ...p, x: pt.x, y: pt.y }; });
    });
  };

  const setDots = (map) => {
    const src = map.getSource("cities");
    if (src) src.setData(buildGeoJSON(dataRef.current, metricRef.current, colormapRef.current));
  };

  // Unified country layer update: handles both choropleth fill and border line visibility
  const updateCountries = async (map) => {
    const src = map.getSource("countries");
    if (!src) return;

    const wantFill   = choroRef.current === "country";
    const wantBorder = borderLevelRef.current === "country" || borderLevelRef.current === "province";

    if (!wantFill && !wantBorder) {
      src.setData({ type: "FeatureCollection", features: [] });
      if (map.getLayer("country-fill")) map.setPaintProperty("country-fill", "fill-opacity", 0);
      if (map.getLayer("country-line")) map.setPaintProperty("country-line", "line-opacity", 0);
      return;
    }

    try {
      const gj = await fetch(COUNTRY_URL).then((r) => r.json());
      const avgs = wantFill ? buildCountryAvg(dataRef.current, metricRef.current) : {};
      src.setData({
        ...gj,
        features: gj.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            fillColor: wantFill && avgs[f.properties.iso_a2] != null
              ? getMetricColor(metricRef.current, avgs[f.properties.iso_a2], colormapRef.current)
              : null,
          },
        })),
      });

      if (map.getLayer("country-fill"))
        map.setPaintProperty("country-fill", "fill-opacity", wantFill ? 0.35 : 0);

      if (map.getLayer("country-line")) {
        map.setPaintProperty("country-line", "line-opacity", wantBorder ? 0.65 : 0);
        map.setPaintProperty("country-line", "line-color",
          isLightRef.current ? "rgba(60,60,60,0.55)" : "rgba(210,210,210,0.3)");
      }
    } catch (e) { console.error("country update", e); }
  };

  // Province/state border lines — lazy-loaded and cached at module level
  const setProvinces = async (map) => {
    const src = map.getSource("provinces");
    if (!src) return;

    if (borderLevelRef.current !== "province") {
      if (map.getLayer("province-line"))
        map.setLayoutProperty("province-line", "visibility", "none");
      return;
    }

    try {
      if (!_provinceGeoJson)
        _provinceGeoJson = await fetch(PROVINCE_URL).then((r) => r.json());
      src.setData(_provinceGeoJson);
      if (map.getLayer("province-line")) {
        map.setLayoutProperty("province-line", "visibility", "visible");
        map.setPaintProperty("province-line", "line-color",
          isLightRef.current ? "rgba(60,60,60,0.3)" : "rgba(200,200,200,0.18)");
      }
    } catch (e) { console.error("provinces", e); }
  };

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInst.current || !mapRef.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: styleRef.current,
      center: [10, 22], zoom: 2, minZoom: 1.2,
      projection: "mercator", renderWorldCopies: true,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => {
      map.resize();
      rehydrateMapLayers(map, styleRef.current.includes("light"));
    });
    mapInst.current = map;
    return () => { map.remove(); mapInst.current = null; };
  }, []);

  // ── Style switch: theme change OR satellite toggle ─────────────────────────
  useEffect(() => {
    if (mapStyle === styleRef.current) return;
    styleRef.current = mapStyle;
    const map = mapInst.current;
    if (!map) return;
    const apply = () => {
      const seq = ++styleReloadSeqRef.current;
      map.setStyle(mapStyle);
      map.once("style.load", () => {
        if (seq !== styleReloadSeqRef.current) return;
        rehydrateMapLayers(map, mapStyle.includes("light"));
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
  }, [mapStyle]);

  // ── Ocean / bg change ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInst.current;
    if (!map) return;

    const previousOceanPreset = lastOceanPresetRef.current;
    const refreshRequested    = oceanRefreshKey !== lastOceanRefreshKeyRef.current;
    lastOceanPresetRef.current     = oceanPreset;
    lastOceanRefreshKeyRef.current = oceanRefreshKey;

    const apply = () => {
      applyBg(map, c.bg);
      // Skip ocean manipulation on satellite basemap
      if (!satelliteRef.current) {
        if ((!oceanPreset || oceanPreset === "auto") && (previousOceanPreset !== "auto" || refreshRequested)) {
          resetOcean(map);
        } else {
          applyOcean(map);
        }
      }
      setDots(map);
      updateCountries(map);
      setProvinces(map);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
  }, [c.bg, oceanPreset, oceanRefreshKey]);

  // ── Dots + countries update on data / metric / choropleth / colormap / borders change ──
  useEffect(() => {
    dataRef.current        = data;
    metricRef.current      = filters.metric;
    choroRef.current       = choropleth;
    colormapRef.current    = colormap;
    borderLevelRef.current = borderLevel;
    const map = mapInst.current;
    if (!map) return;
    const update = () => {
      setDots(map);
      updateCountries(map);
      setProvinces(map);
    };
    if (map.isStyleLoaded()) update();
    else map.once("style.load", update);
  }, [data, filters.metric, choropleth, colormap, borderLevel]);

  // ── Toggle city circle visibility ─────────────────────────────────────────
  useEffect(() => {
    showCitiesRef.current = showCities;
    const map = mapInst.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = showCities ? "visible" : "none";
    ["cities-dots", "cities-glow"].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    });
  }, [showCities]);

  // ── Fly to selected region ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInst.current;
    if (!map) return;
    if (filters.region === "All Regions") {
      map.flyTo({ center: [10, 22], zoom: 2, duration: 1200 });
    } else {
      const bounds = REGION_BOUNDS[filters.region];
      if (bounds) map.fitBounds(bounds, { padding: 40, duration: 1200, maxZoom: 6 });
    }
  }, [filters.region]);

  // ── Resize map when switching back from charts ─────────────────────────────
  useEffect(() => {
    if (viewMode === "map" && mapInst.current) {
      window.requestAnimationFrame(() => mapInst.current?.resize());
    }
  }, [viewMode]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: c.bg }}>
      <div ref={mapRef} style={{
        position: "absolute", inset: 0, zIndex: 0,
        opacity: viewMode === "map" ? 1 : 0,
        visibility: viewMode === "map" ? "visible" : "hidden",
        pointerEvents: viewMode === "map" ? "auto" : "none",
      }} />
      {/* Inset border to cover Mapbox edge artifacts with theme color */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1,
        outline: `6px solid ${c.bg}`, outlineOffset: "-6px" }} />

      <ChartsView
        data={data}
        filters={filters}
        metricMeta={metricMeta}
        theme={theme}
        colormap={colormap}
        active={viewMode === "charts"}
        chartType={chartType}
        onChartType={onChartType}
      />

      {loading && !data.length && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 10,
          background: `${c.bg}cc`, backdropFilter: "blur(4px)", pointerEvents: "none" }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", color: c.textSubtle }}>
            QUERYING SNOWFLAKE
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: c.textSubtle }}>157 cities</div>
        </div>
      )}

      {viewMode === "map" && (
        <>
          {hover && !popup && (
            <HoverTooltip info={hover} W={cSize.w} H={cSize.h} theme={theme}
              metric={filters.metric} colormap={colormap} />
          )}
          {popup && (
            <CityPopup city={popup.city} pos={popup} W={cSize.w}
              onClose={() => setPopup(null)} onViewTrend={(city) => setTrendCity(city)} theme={theme} />
          )}
          {trendCity && (
            <TrendPanel city={trendCity} metric={filters.metric} metricMeta={metricMeta}
              onClose={() => setTrendCity(null)} theme={theme} />
          )}
        </>
      )}
    </div>
  );
}
