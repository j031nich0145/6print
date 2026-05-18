// ── Colormap definitions ──────────────────────────────────────────────────────
// stops: [low → high] used for gradient preview and interpolation
export const COLORMAP_DEFS = {
  aqi: {
    name: "AQI Standard",
    stops: ["#22c55e","#eab308","#f97316","#ef4444","#a855f7","#7f1d1d"],
  },
  viridis: {
    name: "Viridis",
    stops: ["#440154","#3b528b","#21908c","#5dc963","#fde725"],
  },
  plasma: {
    name: "Plasma",
    stops: ["#0d0887","#7e03a8","#cc4778","#f89540","#f0f921"],
  },
  turbo: {
    name: "Turbo",
    stops: ["#30123b","#4777ef","#1be4b6","#a4fc3c","#fb7f07","#7a0403"],
  },
  rdylgn: {
    name: "RdYlGn",
    stops: ["#1a9850","#91cf60","#fee08b","#fc8d59","#d73027"],
  },
  earth: {
    name: "Earth",
    stops: ["#1a472a","#4a7c59","#9b7653","#c4a882","#e8d5b7"],
  },
};

// ── Hex color interpolation ───────────────────────────────────────────────────
const lerpHex = (a, b, t) => {
  const h = (s) => [
    parseInt(s.slice(1,3),16),
    parseInt(s.slice(3,5),16),
    parseInt(s.slice(5,7),16),
  ];
  const [ar,ag,ab] = h(a), [br,bg,bb] = h(b);
  return "#" + [ar+(br-ar)*t, ag+(bg-ag)*t, ab+(bb-ab)*t]
    .map((v) => Math.round(v).toString(16).padStart(2,"0")).join("");
};

export const interpolateColormap = (id, t) => {
  const stops = COLORMAP_DEFS[id]?.stops;
  if (!stops) return "#666";
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  return lerpHex(stops[i], stops[i + 1], t * n - i);
};

// ── Per-metric value max for normalization ─────────────────────────────────────
const METRIC_MAX = {
  us_aqi: 500, european_aqi: 500,
  pm2_5: 150,  pm10: 300,
  nitrogen_dioxide: 400, ozone: 400,
  dust: 1000,  uv_index: 11,
  carbon_monoxide: 15000, sulphur_dioxide: 600,
};

const AQI_BANDS = [
  { min:0,   max:50,  color:"#22c55e" },
  { min:51,  max:100, color:"#eab308" },
  { min:101, max:150, color:"#f97316" },
  { min:151, max:200, color:"#ef4444" },
  { min:201, max:300, color:"#a855f7" },
  { min:301, max:999, color:"#7f1d1d" },
];

export const aqiStandardColor = (v) => {
  if (v == null) return "#3a3a3a";
  return AQI_BANDS.find((b) => v >= b.min && v <= b.max)?.color ?? "#7f1d1d";
};

// Main color resolver — used by AirQuality map + choropleth
export const getMetricColor = (metric, value, colormapId = "aqi") => {
  if (value == null) return "#3a3a3a";
  if (colormapId === "aqi") {
    if (metric === "us_aqi" || metric === "european_aqi") return aqiStandardColor(value);
    return value > 200 ? "#ef4444" : value > 100 ? "#f97316" : value > 50 ? "#eab308" : "#22c55e";
  }
  const t = Math.min(1, Math.max(0, value / (METRIC_MAX[metric] ?? 500)));
  return interpolateColormap(colormapId, t);
};
