import { useState, useEffect } from "react";
import { useTheme } from "./theme/ThemeProvider";
import { BUILT_IN_THEMES } from "./theme/themes";
import { COLORMAP_DEFS, OCEAN_PRESETS } from "./utils/colormaps";
import AirQuality from "./pages/AirQuality";
import UVIndex from "./pages/UVIndex";
import CarbonCalculator from "./pages/CarbonCalculator";
import QueryChat from "./pages/QueryChat";
import { DraggableCard, KpiTop5, KpiLegend, KpiGlobalAvg, KpiRegionSummary } from "./components/KpiCards";
import axios from "axios";

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = [
  { id:"aqi",    label:"Air Quality"       },
  { id:"uv",     label:"UV Index"          },
  { id:"carbon", label:"Carbon Calculator" },
  { id:"chat",   label:"Query Chat"        },
];
const REGIONS = [
  "All Regions","Canada","United States","Central America","South America",
  "Europe","Africa","Middle East","Asia","Central Asia","Oceania",
];
const METRICS = [
  { id:"us_aqi",           label:"US AQI",   unit:""      },
  { id:"european_aqi",     label:"EU AQI",   unit:""      },
  { id:"pm2_5",            label:"PM2.5",    unit:"μg/m³" },
  { id:"pm10",             label:"PM10",     unit:"μg/m³" },
  { id:"nitrogen_dioxide", label:"NO₂",      unit:"μg/m³" },
  { id:"ozone",            label:"Ozone",    unit:"μg/m³" },
  { id:"dust",             label:"Dust",     unit:"μg/m³" },
  { id:"uv_index",         label:"UV Index", unit:""      },
];
export const METRIC_META = Object.fromEntries(METRICS.map((m) => [m.id, m]));
const TAB_H = 44;

const KPI_DEFS = [
  { id:"top5worst",      label:"5 Worst AQI",         defaultEdge:"top-right" },
  { id:"top5best",       label:"5 Best AQI",          defaultEdge:"top-right" },
  { id:"global_avg",     label:"Global Average",       defaultEdge:"top-left"  },
  { id:"aqi_legend",     label:"AQI Legend",           defaultEdge:"bot-left"  },
  { id:"region_summary", label:"Region Summary",       defaultEdge:"bot-right" },
];

const TEMPLATE_KEY = "cm_template_v1";

// ── Shared UI ─────────────────────────────────────────────────────────────────
function ModePill({ value, onChange, options, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  return (
    <div style={{ display:"flex", background:c.surface, border:`1px solid ${c.border}`,
      borderRadius:theme.shape.buttonRadius, padding:3, gap:3 }}>
      {options.map(({ id, label }) => {
        const active = value === id;
        return (
          <button key={id} onClick={()=>onChange(id)} style={{
            flex:1, padding:"6px 8px",
            background: active ? c.accent : "transparent",
            color: active ? c.accentFg : c.textMuted,
            border:"none", borderRadius:theme.shape.buttonRadius,
            fontFamily:mono, fontSize:10, letterSpacing:"0.1em",
            textTransform:"uppercase", cursor:"pointer",
            transition:"all 0.15s", fontWeight: active?600:400,
          }}>{label}</button>
        );
      })}
    </div>
  );
}

function Accordion({ title, children, theme, defaultOpen=false }) {
  const [open, setOpen] = useState(defaultOpen);
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  return (
    <div style={{ borderBottom:`1px solid ${c.border}` }}>
      <button onClick={()=>setOpen(v=>!v)} style={{
        width:"100%", padding:"12px 20px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        background:"none", border:"none", cursor:"pointer",
        fontFamily:mono, fontSize:10, letterSpacing:"0.15em",
        textTransform:"uppercase", color:c.textMuted,
      }}>
        <span>{title}</span>
        <span style={{ fontSize:14, color:c.textSubtle, transition:"transform 0.2s",
          transform: open?"rotate(90deg)":"rotate(0deg)" }}>›</span>
      </button>
      {open && <div style={{ padding:"0 20px 16px" }}>{children}</div>}
    </div>
  );
}

// ── Compact theme picker (self-contained) ─────────────────────────────────────
function CompactThemePicker() {
  const ctx   = useTheme();
  const theme = ctx.theme;
  const c     = theme.colors;
  const mono  = theme.typography.fontFamilyMono;
  const apply = ctx.switchTheme ?? ctx.setTheme ?? ctx.setActiveTheme ?? (() => {});

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
      {BUILT_IN_THEMES.map((t) => {
        const active = theme.meta.id === t.meta.id;
        return (
          <button key={t.meta.id} onClick={()=>apply(t.meta.id)} style={{
            background: t.colors.bg,
            border: `2px solid ${active ? t.colors.accent : t.colors.border}`,
            borderRadius:8, padding:"8px", cursor:"pointer",
            display:"flex", flexDirection:"column", gap:5, transition:"all 0.15s",
            boxShadow: active ? `0 0 0 2px ${t.colors.accent}44` : "none",
          }}>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <div style={{ width:10, height:10, borderRadius:"50%",
                background:t.colors.accent, flexShrink:0 }} />
              <div style={{ flex:1, height:4, borderRadius:2, background:t.colors.border }} />
              <div style={{ width:14, height:4, borderRadius:2, background:t.colors.surface }} />
            </div>
            <div style={{ fontFamily:t.typography.fontFamilyMono, fontSize:9,
              fontWeight:active?700:500, color:t.colors.text, textAlign:"left" }}>
              {t.meta.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Colormap picker ───────────────────────────────────────────────────────────
function ColormapPicker({ value, onChange, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
      {Object.entries(COLORMAP_DEFS).map(([id, { name, stops }]) => {
        const active = value === id;
        const grad = `linear-gradient(to right, ${stops.join(", ")})`;
        return (
          <button key={id} onClick={()=>onChange(id)} style={{
            background: c.surface,
            border: `2px solid ${active ? c.accent : c.border}`,
            borderRadius:8, padding:"8px", cursor:"pointer",
            display:"flex", flexDirection:"column", gap:5, transition:"all 0.15s",
            boxShadow: active ? `0 0 0 2px ${c.accent}44` : "none",
          }}>
            <div style={{ height:10, borderRadius:4, background:grad }} />
            <div style={{ fontFamily:mono, fontSize:9,
              fontWeight:active?700:500,
              color: active ? c.accent : c.textMuted, textAlign:"left" }}>
              {name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Settings modal ────────────────────────────────────────────────────────────
function SettingsModal({ open, onClose, theme,
  kpiState, onKpiToggle, onAlignCards,
  colormap, onColormap,
  oceanPreset, onOcean,
  onSaveTemplate, onLoadTemplate }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{
        position:"fixed", inset:0, zIndex:900,
        background:"rgba(0,0,0,0.45)", backdropFilter:"blur(3px)",
      }}/>
      <div style={{
        position:"fixed", zIndex:901,
        top:"50%", left:"50%", transform:"translate(-50%,-50%)",
        width:"min(600px,95vw)", maxHeight:"82vh",
        background:c.panel, border:`1px solid ${c.border}`,
        borderRadius:theme.shape.modalRadius,
        boxShadow:"0 24px 64px rgba(0,0,0,0.6)",
        display:"flex", flexDirection:"column", overflow:"hidden",
      }}>

        {/* Header */}
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${c.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.18em",
            textTransform:"uppercase", color:c.text, fontWeight:700 }}>⚙ Settings</div>
          <button onClick={onClose} style={{
            background:"none", border:"none", color:c.textMuted,
            fontSize:20, cursor:"pointer", lineHeight:1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY:"auto", flex:1 }}>

          {/* ABOUT — top, collapsed */}
          <Accordion title="About" theme={theme} defaultOpen={false}>
            <div style={{ fontFamily:mono, fontSize:10, color:c.textMuted, lineHeight:1.9 }}>
              <div style={{ color:c.textSubtle, fontSize:9, letterSpacing:"0.14em",
                textTransform:"uppercase", marginBottom:6 }}>Data Pipeline</div>
              <div>Open-Meteo → AWS Lambda (Python 3.12)</div>
              <div>→ S3 Data Lake → Snowflake Analytics</div>
              <div>→ FastAPI → React</div>
              <div style={{ color:c.textSubtle, fontSize:9, letterSpacing:"0.14em",
                textTransform:"uppercase", margin:"12px 0 6px" }}>Coverage</div>
              <div>157 cities · 30 min refresh · 2023–present</div>
              <div>Historical: 178,687 rows</div>
              <div style={{ marginTop:10 }}>
                <a href="https://github.com/j031nich0145/6print" target="_blank"
                  rel="noopener" style={{ color:c.accent }}>
                  github.com/j031nich0145/6print
                </a>
              </div>
            </div>
          </Accordion>

          {/* KPI CARDS — top, collapsed */}
          <Accordion title="KPI Cards" theme={theme} defaultOpen={false}>
            {/* Checkboxes */}
            <div style={{ marginBottom:12 }}>
              {KPI_DEFS.map(({ id, label }) => {
                const active = kpiState.find((k)=>k.id===id)?.visible ?? false;
                return (
                  <label key={id} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"7px 0", borderBottom:`1px solid ${c.border}`, cursor:"pointer" }}>
                    <input type="checkbox" checked={active}
                      onChange={()=>onKpiToggle(id)}
                      style={{ width:14, height:14, cursor:"pointer", accentColor:c.accent }}/>
                    <span style={{ fontFamily:mono, fontSize:11, color:c.text, flex:1 }}>{label}</span>
                    {active && <span style={{ fontFamily:mono, fontSize:9,
                      color:c.accent, letterSpacing:"0.1em" }}>VISIBLE</span>}
                  </label>
                );
              })}
            </div>
            {/* Auto-align + Hide All */}
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontFamily:mono, fontSize:10, color:c.textMuted }}>
                Auto-align:
              </span>
              {["top","bottom","left","right"].map((edge) => (
                <button key={edge} onClick={()=>onAlignCards(edge)} style={{
                  padding:"4px 12px",
                  background:c.surface, border:`1px solid ${c.border}`,
                  borderRadius:theme.shape.buttonRadius,
                  color:c.textMuted, fontFamily:mono, fontSize:9,
                  letterSpacing:"0.1em", textTransform:"uppercase",
                  cursor:"pointer", transition:"all 0.15s",
                }}
                onMouseEnter={(e)=>{e.currentTarget.style.borderColor=c.accent;e.currentTarget.style.color=c.accent;}}
                onMouseLeave={(e)=>{e.currentTarget.style.borderColor=c.border;e.currentTarget.style.color=c.textMuted;}}
                >{edge}</button>
              ))}
              <button onClick={()=>{KPI_DEFS.forEach(d=>kpiState.find(k=>k.id===d.id)?.visible&&onKpiToggle(d.id));}} style={{
                marginLeft:"auto", padding:"4px 12px",
                background:"transparent", border:`1px solid ${c.danger ?? "#ef4444"}`,
                borderRadius:theme.shape.buttonRadius,
                color:c.danger ?? "#ef4444", fontFamily:mono, fontSize:9,
                letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer",
              }}>Hide All</button>
            </div>
          </Accordion>

          {/* DISPLAY / THEME — open */}
          <Accordion title="Display / Theme" theme={theme} defaultOpen>
            <CompactThemePicker />
            <div style={{ marginTop:14, marginBottom:6,
              fontSize:9, letterSpacing:"0.14em", color:c.textSubtle,
              textTransform:"uppercase", fontFamily:mono }}>
              Ocean Color
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {OCEAN_PRESETS.map(({ id, label, color }) => {
                const active = oceanPreset === id;
                // Actual preview: contrast uses computed color based on current isLight
                const previewColor = id === "contrast"
                  ? (theme.meta.tags?.includes("light") ? "#0a1628" : "#c8ddf0")
                  : (color ?? "#4a8fcf");   // auto shows mid-blue as hint
                return (
                  <button key={id} onClick={()=>onOcean(id)} style={{
                    background: c.surface,
                    border: `2px solid ${active ? c.accent : c.border}`,
                    borderRadius:8, padding:"8px", cursor:"pointer",
                    display:"flex", flexDirection:"column", gap:5, transition:"all 0.15s",
                    boxShadow: active ? `0 0 0 2px ${c.accent}44` : "none",
                  }}>
                    <div style={{ height:10, borderRadius:4,
                      background: previewColor,
                      border: `1px solid ${c.border}` }} />
                    <div style={{ fontFamily:mono, fontSize:9,
                      fontWeight:active?700:500,
                      color: active ? c.accent : c.textMuted }}>
                      {label}
                    </div>
                  </button>
                );
              })}
            </div>
          </Accordion>

          {/* PLOTS & COLORMAPS — open */}
          <Accordion title="Plots & Colormaps" theme={theme} defaultOpen>
            <ColormapPicker value={colormap} onChange={onColormap} theme={theme} />
          </Accordion>

        </div>

        {/* Save/Load template — bottom of modal */}
        <div style={{ padding:"10px 20px", borderTop:`1px solid ${c.border}`,
          display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <span style={{ fontFamily:mono, fontSize:10, color:c.textSubtle, letterSpacing:"0.08em" }}>
            Template:
          </span>
          <button onClick={onSaveTemplate} style={{
            padding:"5px 14px",
            background:c.accentSubtle, border:`1px solid ${c.accent}`,
            borderRadius:theme.shape.buttonRadius,
            color:c.accent, fontFamily:mono, fontSize:10, cursor:"pointer",
          }}>Save</button>
          <button onClick={onLoadTemplate} style={{
            padding:"5px 14px",
            background:c.surface, border:`1px solid ${c.border}`,
            borderRadius:theme.shape.buttonRadius,
            color:c.textMuted, fontFamily:mono, fontSize:10, cursor:"pointer",
          }}>Load</button>
          <span style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginLeft:4 }}>
            Saves theme, colormap &amp; KPI layout
          </span>
        </div>
      </div>
    </>
  );
}

// ── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({ open, filters, onFilter, onRefresh, loading, cityCount,
  lastUpdate, viewMode, onViewMode, choropleth, onChoropleth, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const sel = { width:"100%", padding:"7px 10px", marginBottom:14,
    background:c.inputBg, border:`1px solid ${c.inputBorder}`,
    borderRadius:theme.shape.inputRadius, color:c.text,
    fontFamily:mono, fontSize:12, cursor:"pointer", outline:"none" };
  const lbl = { fontFamily:mono, fontSize:10, letterSpacing:"0.14em",
    textTransform:"uppercase", color:c.textSubtle, marginBottom:5, display:"block" };
  const sec = (t) => (
    <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.2em",
      textTransform:"uppercase", color:c.textSubtle,
      borderBottom:`1px solid ${c.border}`, paddingBottom:6,
      marginBottom:14, marginTop:4 }}>{t}</div>
  );
  return (
    <div style={{
      position:"fixed", top:TAB_H, left:0, bottom:0, width:240,
      background:c.sidebar, borderRight:`1px solid ${c.border}`,
      boxShadow:"4px 0 24px rgba(0,0,0,0.4)", zIndex:200,
      display:"flex", flexDirection:"column",
      transform: open?"translateX(0)":"translateX(-100%)",
      transition:"transform 0.2s cubic-bezier(0.4,0,0.2,1)",
    }}>
      <div style={{ padding:"14px 16px 12px", borderBottom:`1px solid ${c.border}`, flexShrink:0 }}>
        <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.22em",
          color:c.accent, fontWeight:700, textTransform:"uppercase", marginBottom:10 }}>
          Carbon Monitor
        </div>
        <ModePill value={viewMode} onChange={onViewMode}
          options={[{id:"map",label:"Map"},{id:"charts",label:"Charts"}]} theme={theme} />
        {lastUpdate && (
          <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle,
            letterSpacing:"0.08em", marginTop:8 }}>
            {lastUpdate.slice(0,16).replace("T"," ")} UTC
          </div>
        )}
        <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginTop:2 }}>
          {cityCount} cities loaded
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:14 }}>
        {sec("Filters")}
        <label style={lbl}>Region</label>
        <select style={sel} value={filters.region}
          onChange={(e)=>onFilter({...filters,region:e.target.value})}>
          {REGIONS.map((r)=><option key={r}>{r}</option>)}
        </select>
        <label style={lbl}>Metric</label>
        <select style={sel} value={filters.metric}
          onChange={(e)=>onFilter({...filters,metric:e.target.value})}>
          {METRICS.map((m)=>(
            <option key={m.id} value={m.id}>{m.label}{m.unit?` (${m.unit})`:""}</option>
          ))}
        </select>
        <label style={lbl}>Min Population</label>
        <select style={sel} value={String(filters.minPop)}
          onChange={(e)=>onFilter({...filters,minPop:Number(e.target.value)})}>
          {[["0","Any"],["500000","500k+"],["1000000","1M+"],["5000000","5M+"],["10000000","10M+"]].map(([v,l])=>(
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {viewMode==="map" && (
          <>
            {sec("Overlay")}
            <ModePill value={choropleth} onChange={onChoropleth}
              options={[{id:"none",label:"Dots"},{id:"country",label:"Country"}]} theme={theme} />
          </>
        )}
        <div style={{ marginTop:16 }}>
          <button onClick={onRefresh} disabled={loading} style={{
            width:"100%", padding:8,
            background:c.accentSubtle, border:`1px solid ${c.accent}`,
            borderRadius:theme.shape.buttonRadius, color:c.accent,
            fontFamily:mono, fontSize:11, letterSpacing:"0.1em",
            cursor:loading?"wait":"pointer", opacity:loading?0.6:1,
          }}>{loading?"Loading...":"↺  Refresh"}</button>
        </div>
        <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle,
          marginTop:14, lineHeight:1.8 }}>
          Open-Meteo → Lambda → S3 → Snowflake · 30 min
        </div>
      </div>
    </div>
  );
}

// ── KPI cards layer ───────────────────────────────────────────────────────────
function KpiCardsLayer({ kpiState, data, filters, metricMeta, theme, onPositionSave }) {
  const visibleIds = kpiState.filter((k)=>k.visible).map((k)=>k.id);
  const edgeCounts = {};

  const getPos = (id) => {
    const k = kpiState.find((c)=>c.id===id);
    if (k?.x != null && k?.y != null) return { x:k.x, y:k.y };
    const def  = KPI_DEFS.find((d)=>d.id===id);
    const edge = def?.defaultEdge ?? "top-right";
    const idx  = edgeCounts[edge] ?? 0;
    edgeCounts[edge] = idx + 1;
    const W = window.innerWidth, H = window.innerHeight;
    const PAD=12, CW=210, CH=200, ST=195;
    return {
      x: edge.includes("right") ? W-CW-PAD : PAD,
      y: edge.startsWith("top") ? TAB_H+PAD+idx*ST : H-CH-PAD-idx*ST,
    };
  };

  const isOn = (id) => kpiState.find((k)=>k.id===id)?.visible;

  return (
    <>
      {isOn("top5worst") && (
        <DraggableCard id="top5worst" {...getPos("top5worst")}
          onPositionSave={onPositionSave} theme={theme} title="5 Worst AQI">
          <KpiTop5 data={data} mode="worst" theme={theme}/>
        </DraggableCard>
      )}
      {isOn("top5best") && (
        <DraggableCard id="top5best" {...getPos("top5best")}
          onPositionSave={onPositionSave} theme={theme} title="5 Best AQI">
          <KpiTop5 data={data} mode="best" theme={theme}/>
        </DraggableCard>
      )}
      {isOn("global_avg") && (
        <DraggableCard id="global_avg" {...getPos("global_avg")}
          onPositionSave={onPositionSave} theme={theme} title="Global Average">
          <KpiGlobalAvg data={data} metric={filters.metric} metricMeta={metricMeta} theme={theme}/>
        </DraggableCard>
      )}
      {isOn("aqi_legend") && (
        <DraggableCard id="aqi_legend" {...getPos("aqi_legend")}
          onPositionSave={onPositionSave} theme={theme} title="AQI Legend">
          <KpiLegend theme={theme}/>
        </DraggableCard>
      )}
      {isOn("region_summary") && (
        <DraggableCard id="region_summary" {...getPos("region_summary")}
          onPositionSave={onPositionSave} theme={theme} title="Region Summary">
          <KpiRegionSummary data={data} theme={theme}/>
        </DraggableCard>
      )}
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { theme, switchTheme } = useTheme();
  const c = theme.colors, mono = theme.typography.fontFamilyMono;

  const [activeTab,    setActiveTab]    = useState("aqi");
  const [filtersOpen,  setFiltersOpen]  = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters,      setFilters]      = useState({ region:"All Regions", metric:"us_aqi", minPop:0 });
  const [viewMode,     setViewMode]     = useState("map");
  const [choropleth,   setChoropleth]   = useState("none");
  const [colormap,     setColormap]     = useState("aqi");
  const [oceanPreset,  setOceanPreset]  = useState("auto");
  const [aqiData,      setAqiData]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdate,   setLastUpdate]   = useState(null);

  const [kpiState, setKpiState] = useState(() => {
    const saved = JSON.parse(localStorage.getItem("kpi_state") || "null");
    if (saved) return saved;
    return KPI_DEFS.map((d) => ({
      id:d.id, visible:d.id==="top5worst"||d.id==="aqi_legend", x:null, y:null,
    }));
  });

  useEffect(() => {
    localStorage.setItem("kpi_state", JSON.stringify(kpiState));
  }, [kpiState]);

  const fetchAQI = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.region !== "All Regions") params.region = filters.region;
      if (filters.minPop > 0) params.min_pop = filters.minPop;
      const { data } = await axios.get("/api/aqi", { params });
      setAqiData(data);
      if (data.length > 0) setLastUpdate(data[0].measured_at || null);
    } catch (e) { console.error("AQI fetch failed", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAQI(); }, [filters.region, filters.minPop]);

  const handleKpiToggle = (id) =>
    setKpiState((prev) => prev.map((k) => k.id===id ? {...k,visible:!k.visible} : k));

  const handlePositionSave = (id, x, y) => {
    if (x === -9999) {
      setKpiState((prev) => prev.map((k) => k.id===id ? {...k,visible:false} : k));
      return;
    }
    setKpiState((prev) => prev.map((k) => k.id===id ? {...k,x,y} : k));
  };

  const handleAlignCards = (edge) => {
    const visible = kpiState.filter((k) => k.visible);
    const W = window.innerWidth, H = window.innerHeight;
    const PAD=12, CW=210, CH=180, ST=12;
    const newPositions = visible.map((k, idx) => {
      let x, y;
      if (edge === "top")    { x = PAD + idx*(CW+ST); y = TAB_H+PAD; }
      if (edge === "bottom") { x = PAD + idx*(CW+ST); y = H-CH-PAD; }
      if (edge === "left")   { x = PAD; y = TAB_H+PAD + idx*(CH+ST); }
      if (edge === "right")  { x = W-CW-PAD; y = TAB_H+PAD + idx*(CH+ST); }
      return { id:k.id, x, y };
    });
    setKpiState((prev) => prev.map((k) => {
      const np = newPositions.find((p) => p.id===k.id);
      return np ? {...k, x:np.x, y:np.y} : k;
    }));
  };

  const handleSaveTemplate = () => {
    const name = prompt("Save layout as:");
    if (!name) return;
    const templates = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "{}");
    templates[name] = { themeId: theme.meta.id, colormap, oceanPreset, kpiState };
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
    alert(`Saved as "${name}"`);
  };

  const handleLoadTemplate = () => {
    const templates = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "{}");
    const keys = Object.keys(templates);
    if (!keys.length) { alert("No saved layouts yet."); return; }
    const name = prompt(`Load layout:\n${keys.join(", ")}`);
    if (!name || !templates[name]) return;
    const t = templates[name];
    if (t.themeId && switchTheme) switchTheme(t.themeId);   // directly apply theme
    if (t.colormap) setColormap(t.colormap);
    if (t.oceanPreset) setOceanPreset(t.oceanPreset);
    if (t.kpiState) setKpiState(t.kpiState);
  };

  const ICON_BTN = ({ onClick, title, active, children }) => (
    <button onClick={onClick} title={title} style={{
      width:TAB_H, height:TAB_H,
      background: active ? c.accentSubtle : "transparent",
      border:"none", borderBottom:`2px solid ${active?c.accent:"transparent"}`,
      color: active ? c.accent : c.textMuted,
      fontSize:17, cursor:"pointer", flexShrink:0,
      display:"flex", alignItems:"center", justifyContent:"center",
      transition:"all 0.15s",
    }}
    onMouseEnter={(e)=>{e.currentTarget.style.color=c.accent;}}
    onMouseLeave={(e)=>{e.currentTarget.style.color=active?c.accent:c.textMuted;}}
    >{children}</button>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh",
      background:c.bg, overflow:"hidden" }}>

      {/* Tab bar */}
      <div style={{ height:TAB_H, display:"flex", alignItems:"stretch",
        background:c.panel, borderBottom:`1px solid ${c.border}`,
        flexShrink:0, zIndex:300 }}>
        <ICON_BTN onClick={()=>setFiltersOpen(v=>!v)} title="Filters" active={filtersOpen}>
          {filtersOpen?"‹":"›"}
        </ICON_BTN>
        <div style={{ width:1, background:c.border }}/>
        {TABS.map((tab) => {
          const active = activeTab===tab.id;
          return (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
              padding:"0 22px", height:"100%",
              background:"transparent", border:"none",
              borderBottom:`2px solid ${active?c.accent:"transparent"}`,
              color: active?c.accent:c.textMuted,
              fontFamily:mono, fontSize:11, fontWeight:active?600:400,
              letterSpacing:"0.12em", textTransform:"uppercase",
              cursor:"pointer", flexShrink:0, transition:"all 0.15s",
            }}
            onMouseEnter={(e)=>{if(!active)e.currentTarget.style.color=c.text;}}
            onMouseLeave={(e)=>{if(!active)e.currentTarget.style.color=c.textMuted;}}
            >{tab.label}</button>
          );
        })}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center" }}>
          <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle,
            letterSpacing:"0.1em", padding:"0 14px" }}>
            {loading
              ? <span style={{color:c.warning}}>● Loading</span>
              : <span>{aqiData.length} cities</span>}
          </div>
          <div style={{ width:1, height:22, background:c.border }}/>
          <ICON_BTN onClick={()=>setSettingsOpen(v=>!v)} title="Settings" active={settingsOpen}>
            ⚙
          </ICON_BTN>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, position:"relative", overflow:"hidden" }}
        onClick={()=>{ if(filtersOpen)setFiltersOpen(false); }}>
        {activeTab==="aqi" && (
          <AirQuality data={aqiData} loading={loading} filters={filters}
            metricMeta={METRIC_META} theme={theme}
            viewMode={viewMode} choropleth={choropleth} colormap={colormap} oceanPreset={oceanPreset}/>
        )}
        {activeTab==="uv"     && <UVIndex data={aqiData} loading={loading} theme={theme}/>}
        {activeTab==="carbon" && <CarbonCalculator theme={theme}/>}
        {activeTab==="chat"   && <QueryChat data={aqiData} theme={theme}/>}
      </div>

      <FilterPanel open={filtersOpen} filters={filters} onFilter={setFilters}
        onRefresh={fetchAQI} loading={loading} cityCount={aqiData.length}
        lastUpdate={lastUpdate} viewMode={viewMode} onViewMode={setViewMode}
        choropleth={choropleth} onChoropleth={setChoropleth} theme={theme}/>

      <SettingsModal open={settingsOpen} onClose={()=>setSettingsOpen(false)}
        theme={theme}
        kpiState={kpiState} onKpiToggle={handleKpiToggle}
        onAlignCards={handleAlignCards}
        colormap={colormap} onColormap={setColormap}
        oceanPreset={oceanPreset} onOcean={setOceanPreset}
        onSaveTemplate={handleSaveTemplate}
        onLoadTemplate={handleLoadTemplate}/>

      <KpiCardsLayer kpiState={kpiState} data={aqiData}
        filters={filters} metricMeta={METRIC_META}
        theme={theme} onPositionSave={handlePositionSave}/>
    </div>
  );
}
