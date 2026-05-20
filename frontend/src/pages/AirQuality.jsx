import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, CartesianGrid,
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

const aqiBand = (v) => {
  if (v == null) return "";
  if (v <= 50)  return "Good";
  if (v <= 100) return "Moderate";
  if (v <= 150) return "Unhealthy (Sensitive)";
  if (v <= 200) return "Unhealthy";
  if (v <= 300) return "Very Unhealthy";
  return "Hazardous";
};

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
const PW = 240, PH = 340;
function CityPopup({ city, pos, W, H, onClose, onViewTrend, theme, timeWindow }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const left = pos.x + PW + 14 > W ? Math.max(4, pos.x - PW - 14) : pos.x + 14;
  let   top  = pos.y - 70;
  if (top + PH > (H ?? 800) - 8) top = Math.max(44, (H ?? 800) - PH - 8);
  top = Math.max(44, top);

  const aColor = aqiColor(city.us_aqi);
  const countryLabel = getCountryName(city.country);
  const rows = [
    ["EU AQI", city.european_aqi?.toFixed(0), "", false],
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
      position: "absolute", left, top, zIndex: 50,
      background: c.panel, border: `1px solid ${c.border}`,
      borderTop: `2px solid ${aColor}`,
      borderRadius: theme.shape.cardRadius,
      padding: "12px 14px", width: PW,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      fontFamily: mono,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.text, lineHeight: 1.2 }}>
              {city.location}
            </span>
            {countryLabel && (
              <span style={{ fontSize: 10, color: c.textSubtle }}>{countryLabel}</span>
            )}
          </div>
          {city.province && city.province !== city.location && (
            <div style={{ fontSize: 9, color: c.textSubtle, marginTop: 1, opacity: 0.8 }}>{city.province}</div>
          )}
          {timeWindow && timeWindow !== "live" && (
            <div style={{ display:"inline-flex", alignItems:"center", gap:4, marginTop:4,
              background:`${c.accent}18`, border:`1px solid ${c.accent}44`,
              borderRadius:3, padding:"2px 6px",
              fontFamily:mono, fontSize:8, color:c.accent, letterSpacing:"0.08em" }}>
              ↩ {TIME_WINDOW_LABELS[timeWindow] ?? timeWindow} avg
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: c.textMuted, fontSize: 18, cursor: "pointer", flexShrink: 0, marginLeft: 8 }}>×</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
        background: `${aColor}18`, border: `1px solid ${aColor}44`,
        borderRadius: 4, padding: "5px 9px" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: aColor, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: aColor }}>
          US AQI {city.us_aqi ?? "—"}
        </span>
        <span style={{ fontSize: 10, color: aColor, opacity: 0.8 }}>
          · {aqiBand(city.us_aqi)}
        </span>
      </div>
      {rows.map(([label, val, unit]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between",
          padding: "3px 0", borderBottom: `1px solid ${c.border}`, fontSize: 11 }}>
          <span style={{ color: c.textMuted }}>{label}</span>
          <span style={{ color: c.text }}>{val} {unit}</span>
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
function HoverTooltip({ info, W, H, theme, metric, colormap, timeWindow }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const { city, x, y } = info;
  const factors = getFactors(city);
  const metricVal = city[metric] ?? city.us_aqi;
  const aColor = getMetricColor(metric ?? "us_aqi", metricVal, colormap ?? "aqi");
  const { left, top } = smartPos(x, y, W, H);
  const countryLabel = getCountryName(city.country);
  return (
    <div style={{
      position: "absolute", left, top, zIndex: 30, pointerEvents: "none",
      background: `${c.panel}f5`, border: `1px solid ${c.border}`, borderTop: `2px solid ${aColor}`,
      borderRadius: theme.shape.cardRadius, padding: "10px 13px", width: TW,
      backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", fontFamily: mono,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{city.location}</span>
        {countryLabel && (
          <span style={{ fontSize: 10, color: c.textSubtle }}>{countryLabel}</span>
        )}
      </div>
      {timeWindow && timeWindow !== "live" && (
        <div style={{ display:"inline-flex", alignItems:"center", gap:4, marginTop:4,
          background:`${c.accent}18`, border:`1px solid ${c.accent}44`,
          borderRadius:3, padding:"2px 6px",
          fontFamily:mono, fontSize:8, color:c.accent, letterSpacing:"0.08em" }}>
          ↩ {TIME_WINDOW_LABELS[timeWindow] ?? timeWindow} avg
        </div>
      )}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
        marginTop: 7, marginBottom: 8,
        background: `${aColor}1a`, border: `1px solid ${aColor}55`, borderRadius: 4, padding: "3px 8px" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: aColor, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: aColor }}>
          US AQI {city.us_aqi ?? "—"}
        </span>
        <span style={{ fontSize: 9, color: aColor, opacity: 0.8 }}>· {aqiBand(city.us_aqi)}</span>
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
  const [lineCity, setLineCity]         = useState(null);
  const [lineTrend, setLineTrend]       = useState([]);
  const [lineLoading, setLineLoading]   = useState(false);
  // Trend granularity: "city" | "country" | "region"
  const [trendGranularity, setTrendGranularity] = useState("city");
  const [trendCountry, setTrendCountry]   = useState(null);
  const [trendRegion, setTrendRegion]     = useState(null);
  const [trendLabel, setTrendLabel]       = useState(""); // display label for aggregated trends
  // Scatter outlier states
  const [hideOutliers, setHideOutliers] = useState(false);
  const [viewOutliers, setViewOutliers] = useState(false);
  const [outlierView,  setOutlierView]  = useState("bar"); // "bar" | "scatter"

  // Auto-select top city when entering line view
  useEffect(() => {
    if (chartType === "line" && data?.length > 0) {
      const sorted = [...data].sort((a, b) => (b[filters.metric] ?? 0) - (a[filters.metric] ?? 0));
      if (trendGranularity === "city" && !lineCity) {
        setLineCity(sorted[0]?.location ?? null);
      }
      if (trendGranularity === "country" && !trendCountry) {
        const countries = [...new Set(data.map(d => d.country).filter(Boolean))].sort();
        setTrendCountry(countries[0] ?? null);
      }
      if (trendGranularity === "region" && !trendRegion) {
        const regions = [...new Set(data.map(d => d.region).filter(Boolean))].sort();
        setTrendRegion(regions[0] ?? null);
      }
    }
  }, [chartType, data, trendGranularity]);

  // Reset selections when granularity switches
  useEffect(() => {
    setLineCity(null); setTrendCountry(null); setTrendRegion(null); setLineTrend([]);
  }, [trendGranularity]);

  // Reset lineCity when metric changes
  useEffect(() => {
    if (chartType === "line") { setLineCity(null); setLineTrend([]); }
  }, [filters.metric]);

  // Fetch trend — all three granularities
  useEffect(() => {
    if (chartType !== "line") return;
    const metric = filters.metric;

    const fetchCities = async (cities) => {
      const top = cities.slice(0, 3);
      const results = await Promise.all(
        top.map(c => axios.get("/api/trend", { params: { city: c.location, metric } }).then(r => r.data).catch(() => []))
      );
      const dateMap = {};
      results.forEach(trend => {
        trend.forEach(pt => {
          if (!dateMap[pt.date]) dateMap[pt.date] = { date: pt.date, vals: [] };
          const v = pt[metric];
          if (v != null) dateMap[pt.date].vals.push(v);
        });
      });
      return Object.values(dateMap)
        .map(({ date, vals }) => ({ date, [metric]: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null }))
        .filter(d => d[metric] != null)
        .sort((a, b) => a.date.localeCompare(b.date));
    };

    if (trendGranularity === "city") {
      if (!lineCity) return;
      setLineLoading(true);
      axios.get("/api/trend", { params: { city: lineCity, metric } })
        .then(r => { setLineTrend(r.data); setTrendLabel(lineCity); })
        .catch(console.error).finally(() => setLineLoading(false));

    } else if (trendGranularity === "country") {
      if (!trendCountry) return;
      const cities = (data || []).filter(d => d.country === trendCountry)
        .sort((a,b) => (b[metric]??0)-(a[metric]??0));
      if (!cities.length) return;
      setLineLoading(true);
      fetchCities(cities).then(trend => {
        setLineTrend(trend);
        setTrendLabel(`${trendCountry} avg (top ${Math.min(3,cities.length)} cities)`);
      }).catch(console.error).finally(() => setLineLoading(false));

    } else if (trendGranularity === "region") {
      if (!trendRegion) return;
      const cities = (data || []).filter(d => d.region === trendRegion)
        .sort((a,b) => (b[metric]??0)-(a[metric]??0));
      if (!cities.length) return;
      setLineLoading(true);
      fetchCities(cities).then(trend => {
        setLineTrend(trend);
        setTrendLabel(`${trendRegion} avg (top ${Math.min(3,cities.length)} cities)`);
      }).catch(console.error).finally(() => setLineLoading(false));
    }
  }, [lineCity, trendCountry, trendRegion, trendGranularity, filters.metric, chartType]);

  // Deduplicate by location — historical/snapshot data can have multiple rows per city
  // Data arrives sorted by metric DESC from backend so first occurrence = best value
  const dedupedData = (() => {
    const seen = new Set();
    return (data || []).filter((d) => {
      if (seen.has(d.location)) return false;
      seen.add(d.location);
      return true;
    });
  })();

  // Bar data — top 30 by active metric
  const barData = dedupedData.filter((d) => d[filters.metric] != null)
    .sort((a, b) => (b[filters.metric] ?? 0) - (a[filters.metric] ?? 0))
    .slice(0, 30)
    .map((d) => ({ name: d.location, value: d[filters.metric], aqi: d.us_aqi }));

  // Scatter data — AQI vs PM2.5, bubble = population
  const scatterData = dedupedData.filter((d) => d.us_aqi != null && d.pm2_5 != null).map((d) => ({
    x: d.us_aqi,
    y: d.pm2_5,
    z: Math.max(6, Math.min(22, (d.population || 1e6) / 400000)),
    name: d.location,
    country: d.country,
    population: d.population || 0,
  }));

  // IQR outlier filter (1.5 × IQR fence on X axis)
  const filteredScatterData = (() => {
    if (!hideOutliers || scatterData.length < 4) return scatterData;
    const xs = scatterData.map((d) => d.x).sort((a, b) => a - b);
    const q1 = xs[Math.floor(xs.length * 0.25)];
    const q3 = xs[Math.floor(xs.length * 0.75)];
    const iqr = q3 - q1;
    return scatterData.filter((d) => d.x >= q1 - 1.5 * iqr && d.x <= q3 + 1.5 * iqr);
  })();

  // Heatmap rows — top 20 cities by active metric
  const hmCities = dedupedData.filter((d) => d[filters.metric] != null)
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
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12,
          fontFamily: mono, fontSize: 9, color: c.textSubtle, letterSpacing: "0.1em", paddingRight: 12 }}>
          <span>{m.label}{m.unit ? ` (${m.unit})` : ""} · {(data || []).length} CITIES</span>
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
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 120, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }}
                  axisLine={{ stroke: c.border }} tickLine={false} />
                <YAxis
                  type="category" dataKey="name" width={120}
                  axisLine={false} tickLine={false} interval={0}
                  tick={({ x, y, payload }) => (
                    <text x={x - 6} y={y} textAnchor="end" dominantBaseline="central"
                      fill={c.textMuted} fontSize={10} fontFamily={mono}>
                      {payload.value}
                    </text>
                  )}
                />
                <Tooltip
                  contentStyle={{ background: c.panel, border: `1px solid ${c.border}`, borderRadius: 6, fontFamily: mono, fontSize: 11, color: c.text }}
                  labelStyle={{ color: c.text, fontWeight: 700 }}
                  itemStyle={{ color: c.text }}
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

      {/* ── LINE: time-series trend ── */}
      {chartType === "line" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Controls row */}
          <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {/* Granularity pill */}
            <div style={{ display:"flex", background:c.surface, border:`1px solid ${c.border}`,
              borderRadius:theme.shape?.buttonRadius??4, overflow:"hidden" }}>
              {[
                { id:"city",    label:"City"    },
                { id:"country", label:"Country" },
                { id:"region",  label:"Region"  },
              ].map(opt => {
                const active = trendGranularity === opt.id;
                return (
                  <button key={opt.id} onClick={() => setTrendGranularity(opt.id)} style={{
                    padding:"5px 10px", border:"none", borderRadius:0,
                    background: active ? c.accent : "transparent",
                    color: active ? (c.accentFg ?? "#fff") : c.textMuted,
                    fontFamily: mono, fontSize: 9, cursor:"pointer",
                    letterSpacing:"0.08em", textTransform:"uppercase",
                    transition:"all 0.15s", fontWeight: active ? 700 : 400,
                  }}>{opt.label}</button>
                );
              })}
            </div>

            {/* Selection dropdown — changes based on granularity */}
            {trendGranularity === "city" && (
              <select value={lineCity ?? ""} onChange={(e) => setLineCity(e.target.value)}
                style={{ padding:"5px 10px", background:c.inputBg??c.surface,
                  border:`1px solid ${c.inputBorder??c.border}`,
                  borderRadius:4, color:c.text, fontFamily:mono, fontSize:11,
                  cursor:"pointer", outline:"none", minWidth:200 }}>
                {sortedCities.slice(0, 60).map(city => (
                  <option key={city.location} value={city.location}>{city.location}</option>
                ))}
              </select>
            )}
            {trendGranularity === "country" && (
              <select value={trendCountry ?? ""} onChange={(e) => setTrendCountry(e.target.value)}
                style={{ padding:"5px 10px", background:c.inputBg??c.surface,
                  border:`1px solid ${c.inputBorder??c.border}`,
                  borderRadius:4, color:c.text, fontFamily:mono, fontSize:11,
                  cursor:"pointer", outline:"none", minWidth:180 }}>
                {[...new Set((data||[]).map(d=>d.country).filter(Boolean))].sort().map(cn => (
                  <option key={cn} value={cn}>{getCountryName(cn)}</option>
                ))}
              </select>
            )}
            {trendGranularity === "region" && (
              <select value={trendRegion ?? ""} onChange={(e) => setTrendRegion(e.target.value)}
                style={{ padding:"5px 10px", background:c.inputBg??c.surface,
                  border:`1px solid ${c.inputBorder??c.border}`,
                  borderRadius:4, color:c.text, fontFamily:mono, fontSize:11,
                  cursor:"pointer", outline:"none", minWidth:160 }}>
                {[...new Set((data||[]).map(d=>d.region).filter(Boolean))].sort().map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            )}

            {lineTrend.length > 0 && !lineLoading && (
              <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginLeft:4 }}>
                {lineTrend.length} pts · 2023–present
                {trendLabel && trendGranularity !== "city" && (
                  <span style={{ color:c.accent }}> · avg</span>
                )}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, padding: "8px 16px 16px 4px" }}>
            {lineLoading ? (
              <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:mono, fontSize:11, color:c.textMuted }}>Loading trend data…</div>
            ) : lineTrend.length === 0 ? (
              <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                fontFamily:mono, fontSize:11, color:c.textSubtle }}>
                Select a {trendGranularity} to view its {m.label} trend
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
          <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {viewOutliers ? (
              <>
                <button onClick={() => setViewOutliers(false)} style={{
                  padding:"4px 10px", background:c.surface,
                  border:`1px solid ${c.border}`, borderRadius:theme.shape?.buttonRadius??4,
                  color:c.textMuted, fontFamily:mono, fontSize:9, cursor:"pointer",
                  letterSpacing:"0.08em", textTransform:"uppercase",
                }}>← Scatter</button>
                {/* Bar / Scatter toggle for outlier view */}
                <div style={{ display:"flex", background:c.surface, border:`1px solid ${c.border}`,
                  borderRadius:theme.shape?.buttonRadius??4, overflow:"hidden" }}>
                  {[{id:"bar",label:"Bar"},{id:"scatter",label:"Scatter"}].map(opt => {
                    const active = outlierView === opt.id;
                    return (
                      <button key={opt.id} onClick={() => setOutlierView(opt.id)} style={{
                        padding:"4px 10px", border:"none", borderRadius:0,
                        background: active ? c.accent : "transparent",
                        color: active ? (c.accentFg??"#fff") : c.textMuted,
                        fontFamily:mono, fontSize:9, cursor:"pointer",
                        letterSpacing:"0.08em", textTransform:"uppercase",
                        transition:"all 0.15s",
                      }}>{opt.label}</button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ fontFamily:mono, fontSize:9,
                color:c.textSubtle, letterSpacing:"0.12em", textTransform:"uppercase" }}>
                US AQI vs PM2.5 · bubble = population · color = AQI band
              </div>
            )}
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
              {hideOutliers && scatterData.length !== filteredScatterData.length && (
                <>
                  <span style={{ fontFamily:mono, fontSize:9, color:c.textSubtle }}>
                    {scatterData.length - filteredScatterData.length} hidden
                  </span>
                  <button onClick={() => { setViewOutliers(true); setHideOutliers(true); }} style={{
                    padding:"4px 10px",
                    background: viewOutliers ? c.accentSubtle : c.surface,
                    border:`1px solid ${viewOutliers ? c.accent : c.border}`,
                    borderRadius:theme.shape?.buttonRadius??4,
                    color: viewOutliers ? c.accent : c.textMuted,
                    fontFamily:mono, fontSize:9, cursor:"pointer",
                    letterSpacing:"0.08em", textTransform:"uppercase",
                    transition:"all 0.15s",
                  }}>Compare Outliers</button>
                </>
              )}
              <button onClick={() => { setHideOutliers(v=>!v); setViewOutliers(false); }} style={{
                padding:"4px 10px",
                background: hideOutliers ? c.accentSubtle : c.surface,
                border:`1px solid ${hideOutliers ? c.accent : c.border}`,
                borderRadius:theme.shape?.buttonRadius??4,
                color: hideOutliers ? c.accent : c.textMuted,
                fontFamily:mono, fontSize:9, cursor:"pointer",
                letterSpacing:"0.08em", textTransform:"uppercase",
                transition:"all 0.15s",
              }}>
                {hideOutliers ? "Show All" : "Hide Outliers"}
              </button>
            </div>
          </div>

          <div style={{ flex:1, minHeight:0 }}>
            {/* Outlier comparison views */}
            {viewOutliers && hideOutliers ? (() => {
              const outlierData = scatterData
                .filter(d => !filteredScatterData.some(f => f.name === d.name))
                .sort((a,b) => b.x - a.x);
              if (outlierData.length === 0) return (
                <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:mono, fontSize:11, color:c.textSubtle }}>No outliers detected</div>
              );
              const barOutliers = outlierData.map(d => ({ name:d.name, value:d.x, pm25:d.y }));
              return (
                <div style={{ height:"100%", display:"flex", flexDirection:"column" }}>
                  <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle,
                    letterSpacing:"0.12em", textTransform:"uppercase", padding:"8px 16px 0" }}>
                    {outlierData.length} outlier {outlierData.length===1?"city":"cities"} · IQR method
                  </div>
                  <div style={{ flex:1, padding:"4px 8px 16px" }}>
                    {outlierView === "bar" ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barOutliers} layout="vertical" margin={{top:0,right:60,left:120,bottom:0}}>
                          <XAxis type="number" tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                            axisLine={{stroke:c.border}} tickLine={false}/>
                          <YAxis type="category" dataKey="name" width={120} axisLine={false} tickLine={false} interval={0}
                            tick={({x,y,payload}) => (
                              <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                                fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                            )}
                          />
                          <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                            labelStyle={{color:c.text,fontWeight:700}} itemStyle={{color:c.text}}
                            formatter={(v) => [v?.toFixed(1),"US AQI"]}/>
                          <Bar dataKey="value" radius={[0,3,3,0]}>
                            {barOutliers.map((e,i) => <Cell key={i} fill={aqiColor(e.value)} opacity={0.85}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{top:16,right:32,bottom:40,left:16}}>
                          <CartesianGrid strokeDasharray="3 3" stroke={c.border} opacity={0.5}/>
                          <XAxis type="number" dataKey="x" name="US AQI"
                            label={{value:"US AQI",position:"insideBottom",offset:-12,fill:c.textSubtle,fontFamily:mono,fontSize:9}}
                            tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}} axisLine={{stroke:c.border}} tickLine={false}/>
                          <YAxis type="number" dataKey="y" name="PM2.5"
                            label={{value:"PM2.5",angle:-90,position:"insideLeft",offset:14,fill:c.textSubtle,fontFamily:mono,fontSize:9}}
                            tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}} axisLine={{stroke:c.border}} tickLine={false} width={44}/>
                          <ZAxis type="number" dataKey="z" range={[40,500]}/>
                          <Tooltip cursor={{strokeDasharray:"4 4",stroke:c.border}}
                            content={({active:a,payload:p}) => {
                              if (!a||!p?.[0]) return null;
                              const d=p[0].payload, col=aqiColor(d.x);
                              return (
                                <div style={{background:c.panel,border:`1px solid ${c.border}`,borderTop:`3px solid ${col}`,borderRadius:6,padding:"8px 12px",fontFamily:mono,fontSize:10}}>
                                  <div style={{fontWeight:700,color:c.text,marginBottom:4}}>{d.name}</div>
                                  <div style={{color:c.textMuted}}>AQI: <span style={{color:col,fontWeight:700}}>{d.x}</span> <span style={{fontSize:9,opacity:0.8}}>· {aqiBand(d.x)}</span></div>
                                  <div style={{color:c.textMuted}}>PM2.5: <span style={{color:c.text}}>{d.y?.toFixed(1)} μg/m³</span></div>
                                </div>
                              );
                            }}/>
                          <Scatter data={outlierData}
                            shape={(props) => {
                              const {cx,cy,r,payload}=props, col=aqiColor(payload.x);
                              return <circle cx={cx} cy={cy} r={Math.max(4,r??6)} fill={`${col}99`} stroke={col} strokeWidth={1.5}/>;
                            }}/>
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              );
            })() : (
              /* Main scatter chart */
              filteredScatterData.length === 0 ? (
                <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:mono, fontSize:11, color:c.textSubtle }}>No data with both AQI + PM2.5</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top:16, right:32, bottom:40, left:16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={`${c.border}`} opacity={0.5} />
                    <XAxis type="number" dataKey="x" name="US AQI"
                      domain={[0, (dm) => Math.ceil(dm * 1.1 / 50) * 50]}
                      label={{ value:"US AQI", position:"insideBottom", offset:-12, fill:c.textSubtle, fontFamily:mono, fontSize:9 }}
                      tick={{ fill:c.textSubtle, fontSize:9, fontFamily:mono }}
                      axisLine={{ stroke:c.border }} tickLine={false} />
                    <YAxis type="number" dataKey="y" name="PM2.5"
                      domain={[0, (dm) => Math.ceil(dm * 1.12 / 20) * 20]}
                      label={{ value:"PM2.5 (μg/m³)", angle:-90, position:"insideLeft", offset:14, fill:c.textSubtle, fontFamily:mono, fontSize:9 }}
                      tick={{ fill:c.textSubtle, fontSize:9, fontFamily:mono }}
                      axisLine={{ stroke:c.border }} tickLine={false} width={44} />
                    <ZAxis type="number" dataKey="z" range={[40, 700]} />
                    <Tooltip
                      cursor={{ strokeDasharray:"4 4", stroke:c.border }}
                      content={({ active:a, payload:p }) => {
                        if (!a || !p?.[0]) return null;
                        const d = p[0].payload;
                        const dotCol = aqiColor(d.x);
                        return (
                          <div style={{ background:c.panel, border:`1px solid ${c.border}`,
                            borderTop:`3px solid ${dotCol}`, borderRadius:6, padding:"10px 14px",
                            fontFamily:mono, fontSize:10, minWidth:160, boxShadow:"0 4px 16px rgba(0,0,0,0.4)" }}>
                            <div style={{ fontWeight:700, color:c.text, marginBottom:6, fontSize:11 }}>{d.name}</div>
                            <div style={{ color:c.textMuted, marginBottom:2 }}>
                              AQI: <span style={{ color:dotCol, fontWeight:700, fontSize:12 }}>{d.x}</span>
                              <span style={{ color:dotCol, opacity:0.8, fontSize:9 }}> · {aqiBand(d.x)}</span>
                            </div>
                            <div style={{ color:c.textMuted, marginBottom:2 }}>
                              PM2.5: <span style={{ color:c.text, fontWeight:600 }}>{d.y?.toFixed(1)} μg/m³</span>
                            </div>
                            {d.population > 0 && (
                              <div style={{ color:c.textMuted }}>Pop: <span style={{ color:c.text }}>{(d.population/1e6).toFixed(1)}M</span></div>
                            )}
                            {d.country && (
                              <div style={{ color:c.textSubtle, marginTop:4, fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase" }}>{d.country}</div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Scatter data={filteredScatterData}
                      shape={(props) => {
                        const { cx, cy, r, payload } = props;
                        const col = aqiColor(payload.x);
                        return <circle cx={cx} cy={cy} r={Math.max(4,r??6)} fill={`${col}99`} stroke={col} strokeWidth={1.5}/>;
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              )
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

// ── Country choropleth tooltip ────────────────────────────────────────────────
function CountryTooltip({ info, W, H, theme, metric, metricMeta, colormap }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const m = metricMeta?.[metric] ?? { label: "US AQI", unit: "" };
  const { countryName, avg, cities, cityCount, x, y } = info;
  const aColor = avg != null ? getMetricColor(metric, avg, colormap) : c.textSubtle;
  const { left, top } = smartPos(x, y, W, H);
  return (
    <div style={{
      position: "absolute", left, top, zIndex: 28, pointerEvents: "none",
      background: `${c.panel}f5`, border: `1px solid ${c.border}`, borderTop: `2px solid ${aColor}`,
      borderRadius: theme.shape.cardRadius, padding: "10px 13px", width: TW,
      backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", fontFamily: mono,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: 1 }}>{countryName}</div>
      <div style={{ fontSize: 9, color: c.textSubtle, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
        {cityCount} {cityCount === 1 ? "city" : "cities"} monitored
      </div>
      {avg != null && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8,
          background: `${aColor}1a`, border: `1px solid ${aColor}55`, borderRadius: 4, padding: "3px 8px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: aColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: aColor }}>
            {m.label} avg {avg.toFixed(1)}
          </span>
          {metric === "us_aqi" && (
            <span style={{ fontSize: 9, color: aColor, opacity: 0.8 }}>· {aqiBand(avg)}</span>
          )}
        </div>
      )}
      {cities.length > 0 && (
        <>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: c.textSubtle,
            textTransform: "uppercase", marginBottom: 5 }}>Top Cities</div>
          {cities.map((city) => {
            const val = city[metric] ?? city.us_aqi;
            const col = val != null ? getMetricColor(metric, val, colormap) : c.textSubtle;
            return (
              <div key={city.location} style={{ display: "flex", justifyContent: "space-between",
                fontSize: 10, padding: "3px 0", borderBottom: `1px solid ${c.border}` }}>
                <span style={{ color: c.textMuted }}>{city.location}</span>
                <span style={{ color: col, fontWeight: 600 }}>{val?.toFixed(0)}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Module-level GeoJSON cache + constants ────────────────────────────────────
const COUNTRY_URL  = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson";
let _countryGeoJson = null; // cached to avoid re-fetching on every data update

const TIME_WINDOW_LABELS = {
  "1d":"1 Day","3d":"3 Days","7d":"7 Days","30d":"30 Days","90d":"90 Days",
  "6m":"6 Months","1y":"1 Year","2y":"2 Years","3y":"3+ Years",
};

// ── UV index helpers (shared map) ────────────────────────────────────────────
const UV_BANDS_MAP = [
  { min:0,  max:2,  color:"#22c55e", label:"Low"       },
  { min:3,  max:5,  color:"#eab308", label:"Moderate"  },
  { min:6,  max:7,  color:"#f97316", label:"High"      },
  { min:8,  max:10, color:"#ef4444", label:"Very High" },
  { min:11, max:99, color:"#a855f7", label:"Extreme"   },
];
const uvColorFor = (v) => (UV_BANDS_MAP.find(b=>(v??0)>=b.min&&(v??0)<=b.max)??UV_BANDS_MAP[0]).color;

// ── Carbon Monoxide helpers (shared map) ──────────────────────────────────────
// CO values from Open-Meteo are in μg/m³. WHO 24hr guideline = 4000 μg/m³.
const CO_BANDS_MAP = [
  { min:0,     max:499,   color:"#22c55e", label:"Low",       note:"Clean / background air"     },
  { min:500,   max:1499,  color:"#eab308", label:"Moderate",  note:"Typical urban level"         },
  { min:1500,  max:3999,  color:"#f97316", label:"Elevated",  note:"Approaching WHO limit"       },
  { min:4000,  max:9999,  color:"#ef4444", label:"High",      note:"Above WHO 24hr guideline"    },
  { min:10000, max:Infinity,color:"#a855f7",label:"Very High", note:"Significantly polluted"     },
];
const coColorFor = (v) => (CO_BANDS_MAP.find(b=>(v??0)>=b.min&&(v??0)<=b.max)??CO_BANDS_MAP[0]).color;

const buildCOGeoJSON = (data, colormap="aqi") => ({
  type:"FeatureCollection",
  features:(data||[]).filter(c=>c.carbon_monoxide!=null).map(city=>{
    const co = city.carbon_monoxide;
    const color = (!colormap||colormap==="aqi")
      ? coColorFor(co)
      : getMetricColor("carbon_monoxide", co, colormap);
    return {
      type:"Feature",
      geometry:{ type:"Point", coordinates:[city.lon,city.lat] },
      properties:{
        id:city.location, color,
        radius:Math.max(5,Math.min(20,5+(co/9000)*12)),
        co, cityJson:JSON.stringify(city),
      },
    };
  }),
});

const buildUVGeoJSON = (data, colormap = "aqi") => ({
  type: "FeatureCollection",
  features: (data||[]).map(city => {
    const uv = city.uv_index ?? 0;
    // Default "aqi" colormap → use standard WHO UV band colors.
    // Any other colormap → apply it via getMetricColor so Settings changes are visible.
    const color = (!colormap || colormap === "aqi")
      ? uvColorFor(uv)
      : getMetricColor("uv_index", uv, colormap);
    return {
      type:"Feature",
      geometry:{ type:"Point", coordinates:[city.lon, city.lat] },
      properties:{
        id:city.location, color,
        radius:Math.max(5, Math.min(22, 5 + uv * 1.3)),
        uv, cityJson:JSON.stringify(city),
      },
    };
  }),
});

// ISO 3166-1 alpha-2 → full English country name (browser-native, no lookup table needed)
let _countryFmt = null;
const getCountryName = (code) => {
  if (!code) return code;
  try {
    if (!_countryFmt) _countryFmt = new Intl.DisplayNames(["en"], { type: "region" });
    return _countryFmt.of(code) || code;
  } catch { return code; }
};

// Bounding boxes for region fly-to: [[minLng,minLat],[maxLng,maxLat]]
const REGION_BOUNDS = {
  "North America":   [[-168,  7],  [-52,  84]],
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
  viewMode, choroplethOn = false, colormap = "aqi",
  oceanPreset = "auto", oceanRefreshKey = 0,
  showCities = true, satellite = false,
  chartType = "bar", onChartType,
  timeWindow = "live",
  activeTab = "aqi",
  downloadRef,
}) {
  const c       = theme.colors;
  const mono    = theme.typography.fontFamilyMono;
  const isLight = !!(theme.meta.tags?.includes("light"));

  // Derive choropleth + border state from single toggle
  const choropleth  = choroplethOn ? "country" : "none";
  const borderLevel = choroplethOn ? "country" : "none";

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
  const showCitiesRef  = useRef(showCities);
  const satelliteRef   = useRef(satellite);
  const lastOceanPresetRef    = useRef(oceanPreset);
  const lastOceanRefreshKeyRef = useRef(oceanRefreshKey);
  const styleReloadSeqRef = useRef(0);
  const eventsBoundRef    = useRef(false);
  const isLightRef        = useRef(isLight);
  const originalWaterColorsRef = useRef({});
  // Track city hover state without stale closures (avoids queryRenderedFeatures on every mousemove)
  const hoverActiveRef    = useRef(false);
  // Track last hovered country to skip expensive recomputes on intra-country moves
  const lastHoveredIsoRef = useRef(null);

  const [cSize,        setCSize]        = useState({ w: 1200, h: 700 });
  const [popup,        setPopup]        = useState(null);
  const [hover,        setHover]        = useState(null);
  const [uvHover,      setUvHover]      = useState(null);
  const [coHover,      setCoHover]      = useState(null);
  const [countryHover, setCountryHover] = useState(null);
  const [trendCity,    setTrendCity]    = useState(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Track container size
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e]) => setCSize({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Keep refs current every render
  bgRef.current         = c.bg;
  isLightRef.current    = isLight;
  colormapRef.current   = colormap;
  oceanRef.current      = oceanPreset;
  choroRef.current      = choropleth;
  showCitiesRef.current = showCities;
  satelliteRef.current  = satellite;

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
    // Sync UV dots if UV tab is active
    if (activeTabRef.current === "uv") {
      setUVDots(map);
      ["uv-dots","uv-glow"].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      });
      ["cities-dots","cities-glow","co-dots","co-glow"].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      });
    } else if (activeTabRef.current === "carbon") {
      setCODots(map);
      ["co-dots","co-glow"].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
      });
      ["cities-dots","cities-glow","uv-dots","uv-glow"].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      });
    }
    // Clear any stale hover highlight
    map.getSource("country-hover")?.setData({ type:"FeatureCollection", features:[] });
    // One idle pass to catch race-y style transitions
    map.once("idle", () => {
      try {
        setDots(map);
        updateCountries(map);
        if (activeTabRef.current === "uv")     setUVDots(map);
        if (activeTabRef.current === "carbon") setCODots(map);
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
    // Separate source for hover highlight — always just the hovered feature
    if (!map.getSource("country-hover")) {
      map.addSource("country-hover", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }

    // Country fill — choropleth colors (opacity toggled by updateCountries)
    if (!map.getLayer("country-fill")) {
      map.addLayer({ id: "country-fill", type: "fill", source: "countries",
        paint: { "fill-color": ["coalesce", ["get", "fillColor"], "transparent"], "fill-opacity": 0 } });
    }
    // Country hover highlight — solid fill of choropleth color at higher opacity
    if (!map.getLayer("country-highlight")) {
      map.addLayer({ id: "country-highlight", type: "fill", source: "country-hover",
        paint: {
          "fill-color": ["coalesce", ["get", "fillColor"], "#888888"],
          "fill-opacity": 0.38,
        } });
    }
    // Country border lines — solid color, opacity toggled by updateCountries
    if (!map.getLayer("country-line")) {
      map.addLayer({ id: "country-line", type: "line", source: "countries",
        paint: {
          "line-color": light ? "rgba(60,60,60,0.55)" : "rgba(210,210,210,0.3)",
          "line-width": 0.8, "line-opacity": 0,
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

    // ── UV layers ──
    if (!map.getSource("uv-cities"))
      map.addSource("uv-cities", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
    if (!map.getLayer("uv-glow"))
      map.addLayer({ id:"uv-glow", type:"circle", source:"uv-cities",
        layout:{ visibility:"none" },
        paint:{ "circle-radius":["*",["get","radius"],2.2], "circle-color":["get","color"],
          "circle-opacity":0.12, "circle-blur":1 } });
    if (!map.getLayer("uv-dots"))
      map.addLayer({ id:"uv-dots", type:"circle", source:"uv-cities",
        layout:{ visibility:"none" },
        paint:{ "circle-radius":["get","radius"], "circle-color":["get","color"],
          "circle-opacity":0.88, "circle-stroke-width":1.5,
          "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.4 } });

    // ── CO (Carbon Monoxide) layers ──
    if (!map.getSource("co-cities"))
      map.addSource("co-cities", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
    if (!map.getLayer("co-glow"))
      map.addLayer({ id:"co-glow", type:"circle", source:"co-cities",
        layout:{ visibility:"none" },
        paint:{ "circle-radius":["*",["get","radius"],2.2], "circle-color":["get","color"],
          "circle-opacity":0.12, "circle-blur":1 } });
    if (!map.getLayer("co-dots"))
      map.addLayer({ id:"co-dots", type:"circle", source:"co-cities",
        layout:{ visibility:"none" },
        paint:{ "circle-radius":["get","radius"], "circle-color":["get","color"],
          "circle-opacity":0.88, "circle-stroke-width":1.5,
          "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.4 } });

    if (eventsBoundRef.current) return;
    eventsBoundRef.current = true;

    map.on("mouseenter", "cities-dots", (e) => {
      hoverActiveRef.current = true;
      map.getCanvas().style.cursor = "pointer";
      const city = JSON.parse(e.features[0].properties.cityJson);
      const pt = map.project([city.lon, city.lat]);
      map.setFilter("cities-hover", ["==", "id", city.location]);
      map.setPaintProperty("cities-hover", "circle-stroke-opacity", 0.7);
      setHover({ city, x: pt.x, y: pt.y });
    });
    map.on("mouseleave", "cities-dots", () => {
      hoverActiveRef.current = false;
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

    // Country choropleth hover — tooltip + fill highlight
    // hoverActiveRef avoids expensive queryRenderedFeatures per pixel
    // lastHoveredIsoRef skips full recompute when mouse stays in same country
    map.on("mousemove", "country-fill", (e) => {
      if (choroRef.current !== "country") return;
      if (hoverActiveRef.current) {
        if (lastHoveredIsoRef.current !== null) {
          lastHoveredIsoRef.current = null;
          setCountryHover(null);
          map.getSource("country-hover")?.setData({ type:"FeatureCollection", features:[] });
        }
        return;
      }
      const feat = e.features?.[0];
      if (!feat) {
        if (lastHoveredIsoRef.current !== null) {
          lastHoveredIsoRef.current = null;
          setCountryHover(null);
          map.getSource("country-hover")?.setData({ type:"FeatureCollection", features:[] });
        }
        return;
      }
      const isoA2 = feat.properties.iso_a2;
      // Same country — just nudge the position, skip all stats recompute
      if (isoA2 === lastHoveredIsoRef.current) {
        setCountryHover((prev) => prev ? { ...prev, x: e.point.x, y: e.point.y } : null);
        return;
      }
      lastHoveredIsoRef.current = isoA2;
      const countryName = feat.properties.name ?? isoA2;
      const cities = (dataRef.current || []).filter((d) => d.country === isoA2);
      if (!cities.length) {
        setCountryHover(null);
        map.getSource("country-hover")?.setData({ type:"FeatureCollection", features:[] });
        return;
      }
      const metric = metricRef.current;
      const vals = cities.map((d) => d[metric] ?? d.us_aqi).filter((v) => v != null);
      const avg  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const topCities = [...cities].sort((a, b) => ((b[metric] ?? 0) - (a[metric] ?? 0))).slice(0, 5);
      setCountryHover({ countryName, isoA2, avg, cities: topCities, cityCount: cities.length, x: e.point.x, y: e.point.y });
      map.getSource("country-hover")?.setData({
        type: "FeatureCollection",
        features: [{ type:"Feature", geometry: feat.geometry, properties: feat.properties }],
      });
    });
    map.on("mouseleave", "country-fill", () => {
      lastHoveredIsoRef.current = null;
      setCountryHover(null);
      map.getSource("country-hover")?.setData({ type:"FeatureCollection", features:[] });
      map.getCanvas().style.cursor = "";
    });

    // UV dot hover events
    map.on("mouseenter", "uv-dots", (e) => {
      if (activeTabRef.current !== "uv") return;
      map.getCanvas().style.cursor = "pointer";
      const city = JSON.parse(e.features[0].properties.cityJson);
      const pt = map.project([city.lon, city.lat]);
      setUvHover({ city, x:pt.x, y:pt.y });
    });
    map.on("mouseleave", "uv-dots", () => {
      map.getCanvas().style.cursor = "";
      setUvHover(null);
    });

    // CO dot hover events
    map.on("mouseenter", "co-dots", (e) => {
      if (activeTabRef.current !== "carbon") return;
      map.getCanvas().style.cursor = "pointer";
      const city = JSON.parse(e.features[0].properties.cityJson);
      const pt = map.project([city.lon, city.lat]);
      setCoHover({ city, x:pt.x, y:pt.y });
    });
    map.on("mouseleave", "co-dots", () => {
      map.getCanvas().style.cursor = "";
      setCoHover(null);
    });

    map.on("move", () => {
      setHover(p => { if(!p) return null; const pt=map.project([p.city.lon,p.city.lat]); return{...p,x:pt.x,y:pt.y}; });
      setUvHover(p => { if(!p) return null; const pt=map.project([p.city.lon,p.city.lat]); return{...p,x:pt.x,y:pt.y}; });
      setCoHover(p => { if(!p) return null; const pt=map.project([p.city.lon,p.city.lat]); return{...p,x:pt.x,y:pt.y}; });
    });
  };

  const setDots = (map) => {
    const src = map.getSource("cities");
    if (src) src.setData(buildGeoJSON(dataRef.current, metricRef.current, colormapRef.current));
  };

  // Country layer update — choroplethOn controls both fill and border lines together
  const updateCountries = async (map) => {
    const src = map.getSource("countries");
    if (!src) return;

    const want = choroRef.current === "country";

    if (!want) {
      src.setData({ type: "FeatureCollection", features: [] });
      if (map.getLayer("country-fill")) map.setPaintProperty("country-fill", "fill-opacity", 0);
      if (map.getLayer("country-line")) map.setPaintProperty("country-line", "line-opacity", 0);
      return;
    }

    try {
      if (!_countryGeoJson) _countryGeoJson = await fetch(COUNTRY_URL).then((r) => r.json());
      const gj   = _countryGeoJson;
      const avgs = buildCountryAvg(dataRef.current, metricRef.current);
      src.setData({
        ...gj,
        features: gj.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            fillColor: avgs[f.properties.iso_a2] != null
              ? getMetricColor(metricRef.current, avgs[f.properties.iso_a2], colormapRef.current)
              : null,
          },
        })),
      });
      if (map.getLayer("country-fill"))
        map.setPaintProperty("country-fill", "fill-opacity", 0.35);
      if (map.getLayer("country-line")) {
        map.setPaintProperty("country-line", "line-opacity", 0.65);
        map.setPaintProperty("country-line", "line-color",
          isLightRef.current ? "rgba(60,60,60,0.55)" : "rgba(210,210,210,0.3)");
      }
    } catch (e) { console.error("country update", e); }
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
      preserveDrawingBuffer: true,
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
    };

    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
  }, [c.bg, oceanPreset, oceanRefreshKey]);

  // ── Dots + countries update on data / metric / choropleth / colormap change ──
  useEffect(() => {
    dataRef.current     = data;
    metricRef.current   = filters.metric;
    choroRef.current    = choropleth;
    colormapRef.current = colormap;
    const map = mapInst.current;
    if (!map) return;
    const update = () => {
      setDots(map);
      updateCountries(map);
      if (activeTabRef.current === "uv")     setUVDots(map);
      if (activeTabRef.current === "carbon") setCODots(map);
    };
    if (map.isStyleLoaded()) update();
    else map.once("style.load", update);
  }, [data, filters.metric, choropleth, colormap]);

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

  // ── Download helpers ───────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (!data.length) return;
    const keys = ["location","country","province","lat","lon","population",
      "us_aqi","european_aqi","pm2_5","pm10","nitrogen_dioxide","ozone","dust","uv_index","measured_at"];
    const header = keys.join(",");
    const rows = data.map((row) =>
      keys.map((k) => {
        const v = row[k];
        if (v == null) return "";
        if (typeof v === "string" && v.includes(",")) return `"${v}"`;
        return v;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carbon-monitor-${filters.region.replace(/\s+/g,"_")}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPNG = async () => {
    const ts = new Date().toISOString().slice(0, 10);
    if (viewMode === "map") {
      const canvas = mapInst.current?.getCanvas();
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `carbon-monitor-map-${ts}.png`; a.click();
        URL.revokeObjectURL(url);
      });
    } else {
      alert("Chart PNG export requires html2canvas.\nRun: npm install html2canvas in your frontend directory.");
    }
  };

  // ── Resize map when switching back from charts ─────────────────────────────
  useEffect(() => {
    if (viewMode === "map" && mapInst.current) {
      window.requestAnimationFrame(() => mapInst.current?.resize());
    }
  }, [viewMode]);

  const setUVDots = (map) => {
    map.getSource("uv-cities")?.setData(buildUVGeoJSON(dataRef.current, colormapRef.current));
  };

  const setCODots = (map) => {
    map.getSource("co-cities")?.setData(buildCOGeoJSON(dataRef.current, colormapRef.current));
  };

  // ── Tab switch — toggle correct dot layer per tab ──────────────────────────
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !map.isStyleLoaded()) return;
    const isUV     = activeTab === "uv";
    const isCarbon = activeTab === "carbon";
    const isAQI    = activeTab === "aqi";

    const aqiVis = isAQI ? (showCitiesRef.current ? "visible" : "none") : "none";
    const uvVis  = isUV  ? "visible" : "none";
    const coVis  = isCarbon ? "visible" : "none";

    ["cities-dots","cities-glow"].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", aqiVis);
    });
    ["uv-dots","uv-glow"].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", uvVis);
    });
    ["co-dots","co-glow"].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", coVis);
    });

    if (isUV)     setUVDots(map);
    if (isCarbon) setCODots(map);
  }, [activeTab]);
  useEffect(() => {
    if (downloadRef) {
      downloadRef.current = { csv: downloadCSV, png: downloadPNG };
    }
  }, [data, viewMode, c.bg]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: c.bg }}>
      <div ref={mapRef} style={{
        position: "absolute", inset: 0, zIndex: 0,
        opacity: viewMode === "map" ? 1 : 0,
        visibility: viewMode === "map" ? "visible" : "hidden",
        pointerEvents: viewMode === "map" ? "auto" : "none",
      }} />
      {/* Inset border to cover Mapbox edge artifacts */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1,
        outline: `6px solid ${c.bg}`, outlineOffset: "-6px" }} />

      <ChartsView
        data={data} filters={filters} metricMeta={metricMeta}
        theme={theme} colormap={colormap}
        active={viewMode === "charts"}
        chartType={chartType} onChartType={onChartType}
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

      {viewMode === "map" && activeTab === "aqi" && (
        <>
          {hover && !popup && (
            <HoverTooltip info={hover} W={cSize.w} H={cSize.h} theme={theme}
              metric={filters.metric} colormap={colormap} timeWindow={timeWindow} />
          )}
          {countryHover && !hover && !popup && (
            <CountryTooltip
              info={countryHover} W={cSize.w} H={cSize.h} theme={theme}
              metric={filters.metric} metricMeta={metricMeta} colormap={colormap} />
          )}
          {popup && (
            <CityPopup city={popup.city} pos={popup} W={cSize.w} H={cSize.h}
              onClose={() => setPopup(null)} onViewTrend={(city) => setTrendCity(city)}
              theme={theme} timeWindow={timeWindow} />
          )}
          {trendCity && (
            <TrendPanel city={trendCity} metric={filters.metric} metricMeta={metricMeta}
              onClose={() => setTrendCity(null)} theme={theme} />
          )}
        </>
      )}

      {/* UV hover tooltip — shown on the shared map when UV tab is active */}
      {activeTab === "uv" && uvHover && (() => {
        const { city, x, y } = uvHover;
        const uv   = city.uv_index ?? 0;
        const band = UV_BANDS_MAP.find(b=>uv>=b.min&&uv<=b.max) ?? UV_BANDS_MAP[0];
        const left = x + 260 > cSize.w ? Math.max(4, x - 260) : x + 14;
        let   top  = y - 80; if (top < 44) top = y + 14;
        return (
          <div style={{
            position:"absolute", left, top, zIndex:30, pointerEvents:"none",
            background:`${c.panel}f5`, border:`1px solid ${c.border}`,
            borderTop:`2px solid ${band.color}`,
            borderRadius:theme.shape.cardRadius, padding:"10px 13px", width:244,
            backdropFilter:"blur(12px)", boxShadow:"0 4px 24px rgba(0,0,0,0.4)", fontFamily:mono,
          }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:7, marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:700, color:c.text }}>{city.location}</span>
              <span style={{ fontSize:10, color:c.textSubtle }}>{getCountryName(city.country)}</span>
            </div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:7, marginBottom:6,
              background:`${band.color}22`, border:`1px solid ${band.color}55`,
              borderRadius:4, padding:"4px 9px" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:band.color }}/>
              <span style={{ fontSize:12, fontWeight:700, color:band.color }}>UV {uv?.toFixed(1)}</span>
              <span style={{ fontSize:9, color:band.color, opacity:0.85 }}>· {band.label}</span>
            </div>
            <div style={{ fontSize:9, color:c.textSubtle }}>Click to open UV calculator</div>
          </div>
        );
      })()}

      {/* CO hover tooltip — shown when Carbon tab is active */}
      {activeTab === "carbon" && coHover && (() => {
        const { city, x, y } = coHover;
        const co   = city.carbon_monoxide ?? 0;
        const band = CO_BANDS_MAP.find(b=>co>=b.min&&co<=b.max) ?? CO_BANDS_MAP[0];
        const left = x + 260 > cSize.w ? Math.max(4, x - 260) : x + 14;
        let   top  = y - 80; if (top < 44) top = y + 14;
        return (
          <div style={{
            position:"absolute", left, top, zIndex:30, pointerEvents:"none",
            background:`${c.panel}f5`, border:`1px solid ${c.border}`,
            borderTop:`2px solid ${band.color}`,
            borderRadius:theme.shape.cardRadius, padding:"10px 13px", width:256,
            backdropFilter:"blur(12px)", boxShadow:"0 4px 24px rgba(0,0,0,0.4)", fontFamily:mono,
          }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:7, marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:700, color:c.text }}>{city.location}</span>
              <span style={{ fontSize:10, color:c.textSubtle }}>{getCountryName(city.country)}</span>
            </div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:7, marginBottom:6,
              background:`${band.color}22`, border:`1px solid ${band.color}55`,
              borderRadius:4, padding:"4px 9px" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:band.color }}/>
              <span style={{ fontSize:12, fontWeight:700, color:band.color }}>
                CO {co?.toFixed(0)} μg/m³
              </span>
              <span style={{ fontSize:9, color:band.color, opacity:0.85 }}>· {band.label}</span>
            </div>
            <div style={{ fontSize:10, color:c.textMuted, lineHeight:1.6 }}>{band.note}</div>
            <div style={{ fontSize:9, color:c.textSubtle, marginTop:4 }}>
              WHO 24hr limit: 4,000 μg/m³
            </div>
          </div>
        );
      })()}

      {/* CO legend — shown on shared map when Carbon tab is active */}
      {activeTab === "carbon" && viewMode === "map" && (
        <div style={{ position:"absolute", bottom:52, left:12, zIndex:10, pointerEvents:"none",
          background:`${c.panel}ee`, border:`1px solid ${c.border}`,
          borderRadius:6, padding:"10px 12px", backdropFilter:"blur(8px)" }}>
          <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.18em",
            color:c.textSubtle, textTransform:"uppercase", marginBottom:7 }}>
            Carbon Monoxide
          </div>
          {CO_BANDS_MAP.slice(0,-1).map(b => {
            const dotColor = (!colormap||colormap==="aqi")
              ? b.color
              : getMetricColor("carbon_monoxide", (b.min+b.max)/2, colormap);
            return (
              <div key={b.label} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:dotColor, flexShrink:0 }}/>
                <span style={{ fontFamily:mono, fontSize:10, color:c.textMuted }}>
                  {b.label}
                </span>
                <span style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginLeft:"auto" }}>
                  {b.min === 0 ? `<${b.max}` : `${b.min.toLocaleString()}+`} μg/m³
                </span>
              </div>
            );
          })}
          <div style={{ fontFamily:mono, fontSize:8, color:c.textSubtle, marginTop:4,
            borderTop:`1px solid ${c.border}`, paddingTop:4 }}>
            WHO 24hr limit: 4,000 μg/m³
          </div>
        </div>
      )}
      {activeTab === "uv" && viewMode === "map" && (
        <div style={{ position:"absolute", bottom:52, left:12, zIndex:10, pointerEvents:"none",
          background:`${c.panel}ee`, border:`1px solid ${c.border}`,
          borderRadius:6, padding:"10px 12px", backdropFilter:"blur(8px)" }}>
          <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.18em",
            color:c.textSubtle, textTransform:"uppercase", marginBottom:7 }}>UV Index</div>
          {UV_BANDS_MAP.map(b => {
            // Use colormap-aware color — same logic as the dot layer
            const dotColor = (!colormap || colormap === "aqi")
              ? b.color
              : getMetricColor("uv_index", (b.min + Math.min(b.max, 11)) / 2, colormap);
            return (
              <div key={b.label} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:dotColor, flexShrink:0 }}/>
                <span style={{ fontFamily:mono, fontSize:10, color:c.textMuted }}>
                  {b.label} ({b.min}–{b.max===99?"11+":b.max})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
