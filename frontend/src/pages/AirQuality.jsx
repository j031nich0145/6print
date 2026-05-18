import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";
import axios from "axios";
import { getMetricColor, aqiStandardColor, interpolateColormap, COLORMAP_DEFS, resolveOceanColor } from "../utils/colormaps";

// ── AQI scale (for popup/tooltip badge colors — always AQI standard) ──────────
const AQI_BANDS = [
  { label: "Good",           min: 0,   max: 50,  color: "#22c55e" },
  { label: "Moderate",       min: 51,  max: 100, color: "#eab308" },
  { label: "Unhealthy (S.)", min: 101, max: 150, color: "#f97316" },
  { label: "Unhealthy",      min: 151, max: 200, color: "#ef4444" },
  { label: "Very Unhealthy", min: 201, max: 300, color: "#a855f7" },
  { label: "Hazardous",      min: 301, max: 999, color: "#7f1d1d" },
];
// aqiColor always uses AQI standard (for badges, trend lines, city popup)
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
      fontFamily: mono, pointerEvents: "all",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{city.location}</div>
          <div style={{ fontSize: 10, color: c.textSubtle, marginTop: 2 }}>
            {[city.province, city.country].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: c.textMuted, fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      {rows.map(([lbl, val, unit, isAqi]) => (
        <div key={lbl} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${c.border}` }}>
          <span style={{ color: c.textMuted }}>{lbl}</span>
          <span style={{ color: isAqi ? aqiColor(Number(val)) : c.text, fontWeight: isAqi ? 700 : 400 }}>
            {val}{unit ? ` ${unit}` : ""}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <span style={{ fontSize: 9, color: c.textSubtle }}>{city.population ? `${(city.population / 1e6).toFixed(1)}M` : ""}</span>
        <button onClick={() => { onViewTrend(city); onClose(); }} style={{
          padding: "5px 12px", background: c.accentSubtle, border: `1px solid ${c.accent}`,
          borderRadius: theme.shape.buttonRadius, color: c.accent, fontFamily: mono, fontSize: 10, cursor: "pointer",
        }}>Trend →</button>
      </div>
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
  // Badge/border color matches the active colormap and metric
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

// ── Charts view ───────────────────────────────────────────────────────────────
function ChartsView({ data, filters, metricMeta, theme, colormap, active }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const m = metricMeta?.[filters.metric] ?? { label: "US AQI", unit: "" };
  const sorted = [...(data || [])].filter((d) => d[filters.metric] != null)
    .sort((a, b) => (b[filters.metric] ?? 0) - (a[filters.metric] ?? 0)).slice(0, 30)
    .map((d) => ({ name: d.location, value: d[filters.metric], aqi: d.us_aqi }));
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: active ? 5 : 0,
      background: c.bg, display: "flex", flexDirection: "column", overflow: "hidden",
      opacity: active ? 1 : 0,
      visibility: active ? "visible" : "hidden",
      pointerEvents: active ? "auto" : "none",
      width: "100%", height: "100%", minHeight: 0,
      transition: "opacity 0.18s ease",
    }}>
      <div style={{ padding: "16px 24px 8px", flexShrink: 0 }}>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.2em", color: c.textSubtle, textTransform: "uppercase" }}>
          {m.label}{m.unit ? ` (${m.unit})` : ""} · TOP 30 CITIES · {(data || []).length} TOTAL
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 300, width: "100%", padding: "0 16px 16px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 60, left: 90, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: c.textSubtle, fontSize: 9, fontFamily: mono }} axisLine={{ stroke: c.border }} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fill: c.textMuted, fontSize: 10, fontFamily: mono }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, fontFamily: mono, fontSize: 11 }}
              labelStyle={{ color: c.text, fontWeight: 700 }} formatter={(v) => [v?.toFixed(1), m.label]} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {sorted.map((e, i) => (
                <Cell key={i} fill={getMetricColor(filters.metric, e.value, colormap)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Country GeoJSON ───────────────────────────────────────────────────────────
const COUNTRY_URL = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson";

// ── Main component ────────────────────────────────────────────────────────────
export default function AirQuality({ data, loading, filters, metricMeta, theme, viewMode, choropleth, colormap = "aqi", oceanPreset = "auto", oceanRefreshKey = 0 }) {
  const c       = theme.colors;
  const mono    = theme.typography.fontFamilyMono;
  const isLight = !!(theme.meta.tags?.includes("light"));
  const mapStyle = isLight ? "mapbox://styles/mapbox/light-v11" : "mapbox://styles/mapbox/dark-v11";

  const mapRef      = useRef(null);
  const mapInst     = useRef(null);
  const styleRef    = useRef(mapStyle);
  const bgRef       = useRef(c.bg);
  const dataRef     = useRef(data);
  const metricRef   = useRef(filters.metric);
  const choroRef    = useRef(choropleth);
  const colormapRef = useRef(colormap);
  const oceanRef    = useRef(oceanPreset);
  const lastOceanPresetRef     = useRef(oceanPreset);
  const lastOceanRefreshKeyRef = useRef(oceanRefreshKey);
  const styleReloadSeqRef      = useRef(0);
  const eventsBoundRef         = useRef(false);
  const isLightRef             = useRef(isLight);
  // Snapshot of Mapbox's native water fill colors, captured after each style load.
  // Used by resetOcean() to restore Default without a destructive setStyle() call.
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
  bgRef.current       = c.bg;
  isLightRef.current  = isLight;
  colormapRef.current = colormap;
  oceanRef.current    = oceanPreset;

  // ── Layer helpers (called after every style load) ──────────────────────────
  const applyBg = (map, color) => {
    try { map.getContainer().style.background = color; } catch (_) {}
    try { map.getCanvas().style.background    = color; } catch (_) {}
    try {
      const bg = map.getStyle()?.layers?.find((l) => l.type === "background");
      if (bg) map.setPaintProperty(bg.id, "background-color", color);
    } catch (_) {}
  };

  // Snapshot the native Mapbox water fill colors BEFORE applyOcean() mutates them.
  // Must be called once per style load (inside rehydrateMapLayers, after addLayers).
  const captureWaterColors = (map) => {
    const colors = {};
    try {
      (map.getStyle()?.layers ?? []).forEach((layer) => {
        if (layer.type === "fill" && /^water/i.test(layer.id)) {
          try {
            const v = map.getPaintProperty(layer.id, "fill-color");
            if (v != null) colors[layer.id] = v;
          } catch (_) {}
        }
      });
    } catch (_) {}
    originalWaterColorsRef.current = colors;
  };

  // Restore the snapshotted native water colors via direct setPaintProperty.
  // This replaces the old reloadNativeStyle() approach — no setStyle() needed,
  // so custom sources/layers are never wiped and dots are never lost.
  const resetOcean = (map) => {
    try {
      Object.entries(originalWaterColorsRef.current).forEach(([id, color]) => {
        try { map.setPaintProperty(id, "fill-color", color); } catch (_) {}
      });
    } catch (_) {}
  };

  const rehydrateMapLayers = (map, light) => {
    // After map.setStyle(), Mapbox drops all custom sources/layers.
    // This puts every app overlay back using the *current* refs:
    // dots, choropleth, active metric, active colormap, and current ocean preset.
    applyBg(map, bgRef.current);
    addLayers(map, light);
    captureWaterColors(map); // snapshot native water colors before applyOcean mutates them
    applyOcean(map);
    setDots(map);
    setChoropleth(map);

    // One extra idle pass prevents race-y style/theme transitions where the base
    // style finishes a tick after our overlay data update.
    map.once("idle", () => {
      try {
        setDots(map);
        setChoropleth(map);
      } catch (_) {}
    });
  };

  const applyOcean = (map) => {
    // Custom presets mutate Mapbox's native water layers.
    // Default/Auto is handled by resetOcean() — no style reload required.
    if (!oceanRef.current || oceanRef.current === "auto") return;

    const color = resolveOceanColor(oceanRef.current, isLightRef.current);
    try {
      (map.getStyle()?.layers ?? []).forEach((layer) => {
        // Keep this narrow so labels/terrain/background layers are not affected.
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

    // NOTE: no custom-ocean layer here — we use Mapbox's own water layers via applyOcean.
    // Add each overlay idempotently because setStyle() can leave us in partial states.
    if (!map.getLayer("country-fill")) map.addLayer({ id: "country-fill", type: "fill", source: "countries", paint: { "fill-color": ["coalesce", ["get", "fillColor"], "transparent"], "fill-opacity": 0.35 } });
    if (!map.getLayer("country-line")) map.addLayer({ id: "country-line", type: "line", source: "countries", paint: { "line-color": ["coalesce", ["get", "fillColor"], "transparent"], "line-width": 0.8, "line-opacity": 0.6 } });
    if (!map.getLayer("cities-glow")) map.addLayer({ id: "cities-glow", type: "circle", source: "cities", paint: { "circle-radius": ["*", ["get", "radius"], 2], "circle-color": ["get", "color"], "circle-opacity": 0.15, "circle-blur": 1 } });
    if (!map.getLayer("cities-dots")) map.addLayer({ id: "cities-dots", type: "circle", source: "cities", paint: { "circle-radius": ["get", "radius"], "circle-color": ["get", "color"], "circle-opacity": 0.85, "circle-stroke-width": 1.5, "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.4 } });
    if (!map.getLayer("cities-hover")) map.addLayer({ id: "cities-hover", type: "circle", source: "cities", filter: ["==", "id", ""],
      paint: { "circle-radius": ["*", ["get", "radius"], 1.5], "circle-color": "transparent", "circle-stroke-width": 2, "circle-stroke-color": light ? "#333" : "#fff", "circle-stroke-opacity": 0 } });

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

  const setChoropleth = async (map) => {
    const src = map.getSource("countries");
    if (!src) return;
    if (choroRef.current !== "country") { src.setData({ type: "FeatureCollection", features: [] }); return; }
    try {
      const gj = await fetch(COUNTRY_URL).then((r) => r.json());
      const avgs = buildCountryAvg(dataRef.current, metricRef.current);
      src.setData({ ...gj, features: gj.features.map((f) => ({
        ...f,
        properties: { ...f.properties,
          fillColor: avgs[f.properties.iso_a2] != null
            ? getMetricColor(metricRef.current, avgs[f.properties.iso_a2], colormapRef.current)
            : null }
      })) });
    } catch (e) { console.error("choropleth", e); }
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

  // ── Switch map style when light/dark changes ───────────────────────────────
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

  // ── Update bg + ocean on theme/ocean change ────────────────────────────────
  useEffect(() => {
    const map = mapInst.current;
    if (!map) return;

    const previousOceanPreset = lastOceanPresetRef.current;
    const refreshRequested = oceanRefreshKey !== lastOceanRefreshKeyRef.current;
    lastOceanPresetRef.current = oceanPreset;
    lastOceanRefreshKeyRef.current = oceanRefreshKey;

    const apply = () => {
      applyBg(map, c.bg);

      // Switching back to Default (or manual refresh): restore native water colors
      // directly via resetOcean() — no setStyle() needed, so dots are never wiped.
      if ((!oceanPreset || oceanPreset === "auto") && (previousOceanPreset !== "auto" || refreshRequested)) {
        resetOcean(map);
      } else {
        applyOcean(map);
      }

      // Always repaint dots and choropleth — no early return.
      setDots(map);
      setChoropleth(map);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("style.load", apply);
  }, [c.bg, oceanPreset, oceanRefreshKey]);

  // ── Update dots / choropleth ───────────────────────────────────────────────
  useEffect(() => {
    dataRef.current = data; metricRef.current = filters.metric;
    choroRef.current = choropleth; colormapRef.current = colormap;
    const map = mapInst.current;
    if (!map) return;
    const update = () => { setDots(map); setChoropleth(map); };
    if (map.isStyleLoaded()) update();
    else map.once("style.load", update);
  }, [data, filters.metric, choropleth, colormap]);

  // Recharts and Mapbox both need clean container sizing when switching views.
  // This keeps the hidden map from visually competing with the chart layer, then
  // resizes the map when returning to map mode.
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
      />

      {loading && !data.length && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, background: `${c.bg}cc`, backdropFilter: "blur(4px)", pointerEvents: "none" }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", color: c.textSubtle }}>QUERYING SNOWFLAKE</div>
          <div style={{ fontFamily: mono, fontSize: 10, color: c.textSubtle }}>157 cities</div>
        </div>
      )}

      {viewMode === "map" && (
        <>
          {hover && !popup && <HoverTooltip info={hover} W={cSize.w} H={cSize.h} theme={theme} metric={filters.metric} colormap={colormap} />}
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
