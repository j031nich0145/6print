import { useState, useEffect, useRef } from "react";
import { useTheme } from "./theme/ThemeProvider";
import { BUILT_IN_THEMES } from "./theme/themes";
import { COLORMAP_DEFS, OCEAN_PRESETS, resolveOceanColor } from "./utils/colormaps";

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
  "All Regions","North America","Canada","United States","Central America","South America",
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
  { id:"top5worst",      label:"5 Worst AQI",    defaultEdge:"top-right" },
  { id:"top5best",       label:"5 Best AQI",     defaultEdge:"top-right" },
  { id:"global_avg",     label:"Global Average", defaultEdge:"top-left"  },
  { id:"aqi_legend",     label:"AQI Legend",     defaultEdge:"bot-left"  },
  { id:"region_summary", label:"Region Summary", defaultEdge:"bot-right" },
];

const TEMPLATE_KEY = "cm_template_v1";

// ── Time windows ──────────────────────────────────────────────────────────────
export const TIME_WINDOWS = [
  { id:"live", label:"Live",  days: null },
  { id:"1d",   label:"1D",   days: 1    },
  { id:"3d",   label:"3D",   days: 3    },
  { id:"7d",   label:"7D",   days: 7    },
  { id:"30d",  label:"30D",  days: 30   },
  { id:"90d",  label:"90D",  days: 90   },
  { id:"6m",   label:"6M",   days: 180  },
  { id:"1y",   label:"1Y",   days: 365  },
  { id:"2y",   label:"2Y",   days: 730  },
  { id:"3y",   label:"3Y+",  days: 1095 },
];

// ── Metric plain-language explanations ───────────────────────────────────────
export const METRIC_INFO = {
  us_aqi: {
    name: "US Air Quality Index",
    desc: "A 0–500 score combining all measured pollutants. 0–50 is Good; above 100 affects sensitive groups; above 150 affects everyone; 300+ is Hazardous.",
  },
  european_aqi: {
    name: "European AQI",
    desc: "EU equivalent of the US AQI, using European pollutant thresholds. Scale 0–100+, where higher = worse.",
  },
  pm2_5: {
    name: "Fine Particles (PM2.5)",
    desc: "Particles ≤2.5 micrometers — small enough to enter the bloodstream. Main sources: wildfires, vehicle exhaust, industrial smoke. Most harmful long-term.",
  },
  pm10: {
    name: "Coarse Particles (PM10)",
    desc: "Larger airborne particles ≤10 micrometers including dust, pollen and mould. Irritate the nose, throat and upper airways.",
  },
  nitrogen_dioxide: {
    name: "Nitrogen Dioxide (NO₂)",
    desc: "Gas produced by burning fuel in cars and power plants. Contributes to smog, acid rain, and respiratory inflammation.",
  },
  ozone: {
    name: "Ground-level Ozone (O₃)",
    desc: "Not the protective stratospheric layer. Forms at ground level when sunlight reacts with vehicle and industrial emissions. Causes coughing and reduced lung function.",
  },
  dust: {
    name: "Mineral Dust",
    desc: "Soil and desert particles carried by wind. Reduces visibility and aggravates respiratory conditions — especially common in the Middle East and Central Asia.",
  },
  uv_index: {
    name: "UV Index",
    desc: "Intensity of ultraviolet radiation from the sun. 0–2: Low, 3–5: Moderate, 6–7: High, 8–10: Very High, 11+: Extreme. Higher values increase sunburn risk.",
  },
};

// ── Chart types ───────────────────────────────────────────────────────────────
export const CHART_TYPES = [
  { id:"bar",     icon:"▬▬", label:"Ranking"  },
  { id:"line",    icon:"∿",  label:"Trend"    },
  { id:"scatter", icon:"⬤⬤", label:"Compare"  },
  { id:"heatmap", icon:"▦",  label:"Heatmap"  },
];

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

function CompactThemePicker() {
  const ctx   = useTheme();
  const theme = ctx.theme;
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
              <div style={{ width:10, height:10, borderRadius:"50%", background:t.colors.accent, flexShrink:0 }} />
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
            <div style={{ fontFamily:mono, fontSize:9, fontWeight:active?700:500,
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
  onManageTemplates,
  themeSyncing, onRefreshThemeState }) {
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
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${c.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.18em",
            textTransform:"uppercase", color:c.text, fontWeight:700 }}>⚙ Settings</div>
          <button onClick={onClose} style={{
            background:"none", border:"none", color:c.textMuted, fontSize:20, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
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
                  rel="noopener" style={{ color:c.accent }}>github.com/j031nich0145/6print</a>
              </div>
            </div>
          </Accordion>

          <Accordion title="KPI Cards" theme={theme} defaultOpen={false}>
            <div style={{ marginBottom:12 }}>
              {KPI_DEFS.map(({ id, label }) => {
                const active = kpiState.find((k)=>k.id===id)?.visible ?? false;
                return (
                  <label key={id} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"7px 0", borderBottom:`1px solid ${c.border}`, cursor:"pointer" }}>
                    <input type="checkbox" checked={active} onChange={()=>onKpiToggle(id)}
                      style={{ width:14, height:14, cursor:"pointer", accentColor:c.accent }}/>
                    <span style={{ fontFamily:mono, fontSize:11, color:c.text, flex:1 }}>{label}</span>
                    {active && <span style={{ fontFamily:mono, fontSize:9,
                      color:c.accent, letterSpacing:"0.1em" }}>VISIBLE</span>}
                  </label>
                );
              })}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontFamily:mono, fontSize:10, color:c.textMuted }}>Auto-align:</span>
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

          <Accordion title="Display / Theme" theme={theme} defaultOpen>
            <CompactThemePicker />
            <div style={{ marginTop:14, marginBottom:6,
              fontSize:9, letterSpacing:"0.14em", color:c.textSubtle,
              textTransform:"uppercase", fontFamily:mono }}>Ocean Color</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {OCEAN_PRESETS.map(({ id, label }) => {
                const active = oceanPreset === id;
                const isLt   = theme.meta.tags?.includes("light");
                const previewColor = resolveOceanColor(id, isLt);
                return (
                  <button key={id} onClick={()=>onOcean(id)} style={{
                    background: c.surface,
                    border: `2px solid ${active ? c.accent : c.border}`,
                    borderRadius:8, padding:"8px", cursor:"pointer",
                    display:"flex", flexDirection:"column", gap:5, transition:"all 0.15s",
                    boxShadow: active ? `0 0 0 2px ${c.accent}44` : "none",
                  }}>
                    <div style={{ height:10, borderRadius:4, background: previewColor, border:`1px solid ${c.border}` }} />
                    <div style={{ fontFamily:mono, fontSize:9, fontWeight:active?700:500,
                      color: active ? c.accent : c.textMuted }}>{label}</div>
                  </button>
                );
              })}
            </div>
          </Accordion>

          <Accordion title="Plots & Colormaps" theme={theme} defaultOpen>
            <ColormapPicker value={colormap} onChange={onColormap} theme={theme} />
          </Accordion>
        </div>

        <div style={{ padding:"10px 20px", borderTop:`1px solid ${c.border}`,
          display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <span style={{ fontFamily:mono, fontSize:10, color:c.textSubtle, letterSpacing:"0.08em" }}>Templates:</span>
          <button onClick={onManageTemplates} style={{
            padding:"5px 16px",
            background:c.accentSubtle, border:`1px solid ${c.accent}`,
            borderRadius:theme.shape.buttonRadius,
            color:c.accent, fontFamily:mono, fontSize:10, cursor:"pointer",
          }}>Manage →</button>
          <span style={{ fontFamily:mono, fontSize:9, color:c.textSubtle }}>Save &amp; load full layouts</span>
          <div style={{
            marginLeft:"auto", display:"flex", alignItems:"center", gap:8,
            fontFamily:mono, fontSize:9,
            color: themeSyncing ? c.accent : c.textSubtle,
            opacity: themeSyncing ? 1 : 0.65,
          }}>
            <span>{themeSyncing ? "Loading theme…" : "Theme ready"}</span>
            <button onClick={onRefreshThemeState} title="Refresh theme/map state" style={{
              width:24, height:24, borderRadius:"50%",
              border:`1px solid ${c.border}`, background:c.surface,
              color:c.textMuted, cursor:"pointer",
              fontFamily:mono, fontSize:13, lineHeight:1,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>↻</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Template manager modal ────────────────────────────────────────────────────
function TemplateModal({ open, onClose, onLoad, currentState, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const [templates, setTemplates] = useState({});
  const [saveName,  setSaveName]  = useState("");
  const [kabob,     setKabob]     = useState(null);
  const [renaming,  setRenaming]  = useState(null);
  const [newName,   setNewName]   = useState("");

  useEffect(() => { if (open) reload(); }, [open]);

  const reload = () =>
    setTemplates(JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "{}"));

  const persist = (next) => {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    setTemplates(next);
  };

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    persist({ ...templates, [name]: currentState });
    setSaveName("");
  };

  const handleDelete = (key) => {
    const next = { ...templates };
    delete next[key];
    persist(next);
    setKabob(null);
  };

  const handleRenameConfirm = (oldKey) => {
    const name = newName.trim();
    if (!name || name === oldKey) { setRenaming(null); return; }
    const next = { ...templates };
    next[name] = next[oldKey];
    delete next[oldKey];
    persist(next);
    setRenaming(null); setNewName("");
  };

  if (!open) return null;

  const entries = Object.entries(templates);

  return (
    <>
      <div onClick={()=>{onClose();setKabob(null);}} style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)",
      }}/>
      <div onClick={(e)=>e.stopPropagation()} style={{
        position:"fixed", zIndex:1001,
        top:"50%", left:"50%", transform:"translate(-50%,-50%)",
        width:"min(680px,95vw)", maxHeight:"80vh",
        background:c.panel, border:`1px solid ${c.border}`,
        borderRadius:theme.shape.modalRadius,
        boxShadow:"0 24px 64px rgba(0,0,0,0.7)",
        display:"flex", flexDirection:"column", overflow:"hidden",
      }}>
        <div style={{ padding:"14px 20px", borderBottom:`1px solid ${c.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <span style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.18em",
            textTransform:"uppercase", fontWeight:700, color:c.text }}>Manage Templates</span>
          <button onClick={onClose} style={{
            background:"none", border:"none", color:c.textMuted, fontSize:20, cursor:"pointer" }}>×</button>
        </div>

        <div style={{ padding:"12px 20px", borderBottom:`1px solid ${c.border}`,
          display:"flex", gap:8, alignItems:"center", flexShrink:0 }}>
          <input value={saveName} onChange={(e)=>setSaveName(e.target.value)}
            onKeyDown={(e)=>e.key==="Enter"&&handleSave()}
            placeholder="New template name…"
            style={{ flex:1, padding:"7px 12px",
              background:c.inputBg??c.surface, border:`1px solid ${c.inputBorder??c.border}`,
              borderRadius:theme.shape.inputRadius??6, color:c.text,
              fontFamily:mono, fontSize:11, outline:"none" }}/>
          <button onClick={handleSave} style={{
            padding:"7px 18px", background:c.accentSubtle,
            border:`1px solid ${c.accent}`, borderRadius:theme.shape.buttonRadius,
            color:c.accent, fontFamily:mono, fontSize:10, cursor:"pointer",
            opacity: saveName.trim() ? 1 : 0.4,
          }}>Save Current</button>
        </div>

        <div style={{ overflowY:"auto", flex:1, padding:"16px 20px" }}>
          {entries.length === 0 && (
            <div style={{ fontFamily:mono, fontSize:11, color:c.textSubtle,
              textAlign:"center", padding:"32px 0" }}>No saved templates yet</div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
            {entries.map(([key, tmpl]) => {
              const savedTheme = BUILT_IN_THEMES.find(t=>t.meta.id===tmpl.themeId) ?? BUILT_IN_THEMES[0];
              const cmStops    = COLORMAP_DEFS[tmpl.colormap ?? "aqi"]?.stops ?? [];
              const oceanColor = resolveOceanColor(tmpl.oceanPreset, savedTheme.meta.tags?.includes("light"));
              const isKabob    = kabob === key;
              return (
                <div key={key} style={{ position:"relative", borderRadius:8, overflow:"visible" }}>
                  <div onClick={()=>{onLoad(tmpl);onClose();}}
                    style={{
                      background: savedTheme.colors.bg,
                      border: `2px solid ${savedTheme.colors.border}`,
                      borderRadius:8, overflow:"hidden",
                      cursor:"pointer", transition:"border-color 0.15s",
                    }}
                    onMouseEnter={(e)=>e.currentTarget.style.borderColor=savedTheme.colors.accent}
                    onMouseLeave={(e)=>e.currentTarget.style.borderColor=savedTheme.colors.border}>
                    <div style={{ height:5, background:savedTheme.colors.accent }} />
                    <div style={{ height:8, background:cmStops.length
                      ? `linear-gradient(to right,${cmStops.join(",")})`
                      : savedTheme.colors.surface }} />
                    <div style={{ display:"flex", gap:4, padding:"6px 8px", background:savedTheme.colors.surface }}>
                      <div style={{ width:14, height:14, borderRadius:"50%", background:savedTheme.colors.accent }} />
                      <div style={{ flex:1, height:14, borderRadius:3, background:oceanColor }} />
                    </div>
                    {renaming === key ? (
                      <div style={{ padding:"4px 8px 8px" }} onClick={(e)=>e.stopPropagation()}>
                        <input autoFocus value={newName}
                          onChange={(e)=>setNewName(e.target.value)}
                          onKeyDown={(e)=>{
                            if (e.key==="Enter") handleRenameConfirm(key);
                            if (e.key==="Escape") { setRenaming(null); setNewName(""); }
                          }}
                          style={{ width:"100%", padding:"4px 6px",
                            background:savedTheme.colors.bg,
                            border:`1px solid ${savedTheme.colors.accent}`,
                            borderRadius:4, color:savedTheme.colors.text,
                            fontFamily:mono, fontSize:10, outline:"none", boxSizing:"border-box" }}/>
                      </div>
                    ) : (
                      <div style={{ padding:"6px 8px 8px",
                        fontFamily:mono, fontSize:10, fontWeight:600,
                        color:savedTheme.colors.text,
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {key}
                      </div>
                    )}
                  </div>
                  <button onClick={(e)=>{e.stopPropagation();setKabob(isKabob?null:key);}}
                    style={{
                      position:"absolute", top:4, right:4,
                      background:`${c.panel}cc`, border:`1px solid ${c.border}`,
                      borderRadius:4, color:c.textMuted, fontSize:14,
                      cursor:"pointer", width:22, height:22,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      lineHeight:1, zIndex:10,
                    }}>⋮</button>
                  {isKabob && (
                    <div onClick={(e)=>e.stopPropagation()} style={{
                      position:"absolute", top:28, right:0, zIndex:200,
                      background:c.panel, border:`1px solid ${c.border}`,
                      borderRadius:6, boxShadow:"0 4px 16px rgba(0,0,0,0.4)",
                      overflow:"hidden", minWidth:110,
                    }}>
                      {[
                        { label:"Rename", action:()=>{ setRenaming(key); setNewName(key); setKabob(null); } },
                        { label:"Delete", action:()=>handleDelete(key), danger:true },
                      ].map(({label,action,danger})=>(
                        <button key={label} onClick={action} style={{
                          display:"block", width:"100%", padding:"8px 14px",
                          background:"none", border:"none", textAlign:"left",
                          fontFamily:mono, fontSize:10, letterSpacing:"0.08em",
                          color: danger ? "#ef4444" : c.textMuted, cursor:"pointer",
                        }}
                        onMouseEnter={(e)=>e.currentTarget.style.background=c.surface}
                        onMouseLeave={(e)=>e.currentTarget.style.background="none"}
                        >{label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Side Panel ────────────────────────────────────────────────────────────────
// Replaces FilterPanel. Context-aware: Maps filters vs Charts controls.
function SidePanel({
  open, filters, onFilter, onRefresh, loading, histLoading,
  viewMode, onViewMode,
  choroplethOn, onChoroplethOn,
  showCities, onShowCities,
  satellite, onSatellite,
  timeWindow, onTimeWindow,
  chartType, onChartType,
  theme,
}) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const [metricInfoOpen, setMetricInfoOpen] = useState(false);

  const selStyle = {
    width:"100%", padding:"7px 10px",
    background: c.inputBg ?? c.surface,
    border:`1px solid ${c.inputBorder ?? c.border}`,
    borderRadius: theme.shape.inputRadius ?? theme.shape.buttonRadius,
    color:c.text, fontFamily:mono, fontSize:11, cursor:"pointer", outline:"none",
    marginBottom:12,
  };

  const SecLabel = ({ children }) => (
    <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.2em",
      textTransform:"uppercase", color:c.textSubtle,
      borderBottom:`1px solid ${c.border}`, paddingBottom:5,
      marginBottom:10, marginTop:4 }}>{children}</div>
  );

  const Toggle = ({ label, value, onChange }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"7px 0", borderBottom:`1px solid ${c.border}` }}>
      <span style={{ fontFamily:mono, fontSize:10, color:c.textMuted }}>{label}</span>
      <button onClick={()=>onChange(!value)} style={{
        width:38, height:22, borderRadius:11,
        background: value ? c.accent : c.surface,
        border:`1px solid ${value ? c.accent : c.border}`,
        cursor:"pointer", position:"relative", transition:"all 0.18s", flexShrink:0,
        padding:0,
      }}>
        <div style={{
          position:"absolute", top:3, left: value ? 18 : 3,
          width:14, height:14, borderRadius:"50%",
          background: value ? (c.accentFg ?? "#fff") : c.textSubtle,
          transition:"left 0.18s",
        }}/>
      </button>
    </div>
  );

  const metricInfo = METRIC_INFO[filters.metric];

  return (
    <div style={{
      position:"fixed", top:TAB_H, left:0, bottom:0, width:244,
      background: c.sidebar ?? c.panel,
      borderRight:`1px solid ${c.border}`,
      boxShadow:"4px 0 24px rgba(0,0,0,0.4)", zIndex:200,
      display:"flex", flexDirection:"column",
      transform: open ? "translateX(0)" : "translateX(-100%)",
      transition:"transform 0.2s cubic-bezier(0.4,0,0.2,1)",
    }}>
      {/* View mode toggle */}
      <div style={{ padding:"12px 14px 10px", borderBottom:`1px solid ${c.border}`, flexShrink:0 }}>
        <ModePill value={viewMode} onChange={onViewMode}
          options={[{id:"map",label:"Map"},{id:"charts",label:"Charts"}]} theme={theme} />
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px 16px" }}>

        {/* Charts mode: chart type selector */}
        {viewMode === "charts" && (
          <>
            <SecLabel>Chart Type</SecLabel>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6, marginBottom:16 }}>
              {CHART_TYPES.map(ct => {
                const active = chartType === ct.id;
                return (
                  <button key={ct.id} onClick={()=>onChartType(ct.id)} style={{
                    padding:"9px 6px",
                    background: active ? c.accentSubtle : c.surface,
                    border:`1px solid ${active ? c.accent : c.border}`,
                    borderRadius:theme.shape.buttonRadius,
                    color: active ? c.accent : c.textMuted,
                    fontFamily:mono, fontSize:9, cursor:"pointer",
                    display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                    transition:"all 0.15s",
                  }}>
                    <span style={{ fontSize:16, lineHeight:1 }}>{ct.icon}</span>
                    <span style={{ letterSpacing:"0.08em", textTransform:"uppercase",
                      fontWeight: active ? 700 : 400 }}>{ct.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Time window */}
        <SecLabel>Time Window</SecLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:3, marginBottom: timeWindow !== "live" ? 8 : 14 }}>
          {TIME_WINDOWS.map(tw => {
            const active = timeWindow === tw.id;
            return (
              <button key={tw.id} onClick={()=>onTimeWindow(tw.id)} style={{
                padding:"5px 2px",
                background: active ? c.accent : c.surface,
                border:`1px solid ${active ? c.accent : c.border}`,
                borderRadius:theme.shape.buttonRadius,
                color: active ? (c.accentFg ?? "#fff") : c.textMuted,
                fontFamily:mono, fontSize:9, cursor:"pointer",
                textAlign:"center", letterSpacing:"0.03em",
                transition:"all 0.12s", fontWeight: active ? 700 : 400,
              }}>{tw.label}</button>
            );
          })}
        </div>
        {timeWindow !== "live" && (
          <div style={{ fontFamily:mono, fontSize:9, color:c.accent, marginBottom:12,
            background:`${c.accent}18`, border:`1px solid ${c.accent}44`,
            borderRadius:4, padding:"5px 8px", letterSpacing:"0.06em" }}>
            {histLoading ? "⟳ Fetching historical…" : "↩ Historical averages"}
          </div>
        )}

        {/* Metric + info */}
        <SecLabel>Metric</SecLabel>
        <div style={{ display:"flex", gap:6, alignItems:"center",
          marginBottom: metricInfoOpen ? 8 : 12 }}>
          <select
            style={{ ...selStyle, flex:1, marginBottom:0 }}
            value={filters.metric}
            onChange={(e) => onFilter({ ...filters, metric: e.target.value })}>
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}{m.unit ? ` (${m.unit})` : ""}</option>
            ))}
          </select>
          <button
            onClick={() => setMetricInfoOpen(v => !v)}
            title="What does this measure?"
            style={{
              width:30, height:30, flexShrink:0,
              background: metricInfoOpen ? c.accentSubtle : c.surface,
              border:`1px solid ${metricInfoOpen ? c.accent : c.border}`,
              borderRadius:theme.shape.buttonRadius,
              color: metricInfoOpen ? c.accent : c.textMuted,
              fontSize:14, cursor:"pointer", transition:"all 0.15s",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>📋</button>
        </div>
        {metricInfoOpen && metricInfo && (
          <div style={{
            background: c.surface,
            border:`1px solid ${c.accent}55`,
            borderLeft:`3px solid ${c.accent}`,
            borderRadius:theme.shape.cardRadius ?? 6,
            padding:"8px 10px", marginBottom:12,
          }}>
            <div style={{ fontFamily:mono, fontSize:10, fontWeight:700,
              color:c.accent, marginBottom:4 }}>{metricInfo.name}</div>
            <div style={{ fontFamily:mono, fontSize:10, color:c.textMuted, lineHeight:1.75 }}>
              {metricInfo.desc}
            </div>
          </div>
        )}

        {/* Region */}
        <SecLabel>Region</SecLabel>
        <select style={selStyle} value={filters.region}
          onChange={(e) => onFilter({ ...filters, region: e.target.value })}>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>

        {/* Map-only controls */}
        {viewMode === "map" && (
          <>
            <SecLabel>Layers</SecLabel>
            <Toggle label="City Circles"       value={showCities}   onChange={onShowCities}   />
            <Toggle label="Satellite"          value={satellite}    onChange={onSatellite}    />
            <Toggle label="Choropleth Borders" value={choroplethOn} onChange={onChoroplethOn} />
          </>
        )}

        {/* Refresh */}
        <div style={{ marginTop:18 }}>
          <button onClick={onRefresh} disabled={loading || histLoading} style={{
            width:"100%", padding:8,
            background: c.accentSubtle, border:`1px solid ${c.accent}`,
            borderRadius:theme.shape.buttonRadius, color:c.accent,
            fontFamily:mono, fontSize:11, letterSpacing:"0.1em",
            cursor:(loading||histLoading)?"wait":"pointer",
            opacity:(loading||histLoading)?0.6:1,
          }}>{loading ? "Loading…" : histLoading ? "Fetching…" : "↺  Refresh"}</button>
        </div>
      </div>
    </div>
  );
}

// ── KPI cards layer ───────────────────────────────────────────────────────────
function KpiCardsLayer({ kpiState, data, filters, metricMeta, theme, onPositionSave, colormap }) {
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
          <KpiTop5 data={data} mode="worst" theme={theme} colormap={colormap}/>
        </DraggableCard>
      )}
      {isOn("top5best") && (
        <DraggableCard id="top5best" {...getPos("top5best")}
          onPositionSave={onPositionSave} theme={theme} title="5 Best AQI">
          <KpiTop5 data={data} mode="best" theme={theme} colormap={colormap}/>
        </DraggableCard>
      )}
      {isOn("global_avg") && (
        <DraggableCard id="global_avg" {...getPos("global_avg")}
          onPositionSave={onPositionSave} theme={theme} title="Global Average">
          <KpiGlobalAvg data={data} metric={filters.metric} metricMeta={metricMeta}
            theme={theme} colormap={colormap}/>
        </DraggableCard>
      )}
      {isOn("aqi_legend") && (
        <DraggableCard id="aqi_legend" {...getPos("aqi_legend")}
          onPositionSave={onPositionSave} theme={theme} title="AQI Legend">
          <KpiLegend theme={theme} colormap={colormap}/>
        </DraggableCard>
      )}
      {isOn("region_summary") && (
        <DraggableCard id="region_summary" {...getPos("region_summary")}
          onPositionSave={onPositionSave} theme={theme} title="Region Summary">
          <KpiRegionSummary data={data} theme={theme} colormap={colormap}/>
        </DraggableCard>
      )}
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { theme, switchTheme } = useTheme();
  const c = theme.colors, mono = theme.typography.fontFamilyMono;

  const [activeTab,       setActiveTab]       = useState("aqi");
  const [filtersOpen,     setFiltersOpen]     = useState(false);
  const [settingsOpen,    setSettingsOpen]    = useState(false);
  const [templateOpen,    setTemplateOpen]    = useState(false);
  const downloadRef = useRef(null); // populated by AirQuality
  const [filters,         setFilters]         = useState({ region:"All Regions", metric:"us_aqi" });
  const [viewMode,        setViewMode]        = useState("map");
  const [choroplethOn,    setChoroplethOn]    = useState(false);
  const [showCities,      setShowCities]      = useState(true);
  const [satellite,       setSatellite]       = useState(false);
  const [colormap,        setColormap]        = useState("aqi");
  const [oceanPreset,     setOceanPreset]     = useState("auto");
  const [themeSyncing,    setThemeSyncing]    = useState(false);
  const [oceanRefreshKey, setOceanRefreshKey] = useState(0);
  const [chartType,       setChartType]       = useState("bar");
  const [timeWindow,      setTimeWindow]      = useState("live");
  const [aqiData,         setAqiData]         = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [historicalData,  setHistoricalData]  = useState([]);
  const [histLoading,     setHistLoading]     = useState(false);

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

  // "North America" is a client-side meta-region — fetched as 3 sub-regions in parallel
  const NA_SUB_REGIONS = ["Canada", "United States", "Central America"];
  const isNorthAmerica  = (r) => r === "North America";

  const fetchRegion = async (endpoint, params, region) => {
    if (isNorthAmerica(region)) {
      const results = await Promise.all(
        NA_SUB_REGIONS.map((r) => axios.get(endpoint, { params: { ...params, region: r } }).then((x) => x.data))
      );
      const seen = new Set();
      return results.flat().filter((d) => { if (seen.has(d.location)) return false; seen.add(d.location); return true; });
    }
    if (region !== "All Regions") params.region = region;
    const { data: d } = await axios.get(endpoint, { params });
    return d;
  };

  // Live data fetch
  const fetchAQI = async () => {
    setLoading(true);
    try {
      const cities = await fetchRegion("/api/aqi", {}, filters.region);
      setAqiData(Array.isArray(cities) ? cities : []);
    } catch (e) { console.error("AQI fetch failed", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAQI(); }, [filters.region]);

  // Historical data fetch — triggered by timeWindow or region change
  useEffect(() => {
    if (timeWindow === "live") { setHistoricalData([]); return; }
    const win = TIME_WINDOWS.find(w => w.id === timeWindow);
    if (!win?.days) return;
    setHistLoading(true);
    fetchRegion("/api/snapshot", { days: win.days }, filters.region)
      .then((d) => {
        if (Array.isArray(d)) {
          // Deduplicate by location — snapshot can return multiple rows per city
          const seen = new Set();
          setHistoricalData(d.filter((c) => { if (seen.has(c.location)) return false; seen.add(c.location); return true; }));
        } else { setHistoricalData([]); }
      })
      .catch((e) => { console.error("Historical fetch failed", e); setHistoricalData([]); })
      .finally(() => setHistLoading(false));
  }, [timeWindow, filters.region]);

  // Displayed data — historical averages override live when active
  const displayData = (timeWindow !== "live" && historicalData.length > 0)
    ? historicalData
    : aqiData;

  const markThemeSyncing = (ms = 1100) => {
    setThemeSyncing(true);
    window.setTimeout(() => setThemeSyncing(false), ms);
  };

  useEffect(() => { markThemeSyncing(900); }, [theme.meta.id]);

  const handleOceanChange = (next) => {
    markThemeSyncing(1200);
    setOceanPreset(next);
  };

  const handleRefreshThemeState = () => {
    markThemeSyncing(1300);
    setOceanRefreshKey((v) => v + 1);
  };

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
    const PAD = 12, CW = 210, CH = 190, GAP = 8;
    const newPositions = visible.map((k, idx) => {
      let x, y;
      if (edge === "top" || edge === "bottom") {
        const perRow = Math.max(1, Math.floor((W - PAD * 2 + GAP) / (CW + GAP)));
        const row = Math.floor(idx / perRow);
        const col = idx % perRow;
        x = PAD + col * (CW + GAP);
        y = edge === "top"
          ? TAB_H + PAD + row * (CH + GAP)
          : H - PAD - CH - row * (CH + GAP);
      } else {
        const perCol = Math.max(1, Math.floor((H - TAB_H - PAD * 2 + GAP) / (CH + GAP)));
        const col = Math.floor(idx / perCol);
        const row = idx % perCol;
        y = TAB_H + PAD + row * (CH + GAP);
        x = edge === "left"
          ? PAD + col * (CW + GAP)
          : W - PAD - CW - col * (CW + GAP);
      }
      x = Math.max(0, Math.min(x, W - CW));
      y = Math.max(TAB_H, Math.min(y, H - CH));
      return { id: k.id, x, y };
    });
    setKpiState((prev) => prev.map((k) => {
      const np = newPositions.find((p) => p.id === k.id);
      return np ? { ...k, x: np.x, y: np.y } : k;
    }));
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

  const isDataLoading = loading || histLoading;

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
          {timeWindow !== "live" && (
            <div style={{ fontFamily:mono, fontSize:9, color:c.accent,
              letterSpacing:"0.08em", padding:"0 10px", height:"100%",
              background:`${c.accent}18`, borderLeft:`1px solid ${c.border}`,
              display:"flex", alignItems:"center" }}>
              ↩ {TIME_WINDOWS.find(t=>t.id===timeWindow)?.label}
            </div>
          )}
          <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle,
            letterSpacing:"0.1em", padding:"0 14px", borderLeft:`1px solid ${c.border}` }}>
            {isDataLoading
              ? <span style={{color:c.warning}}>● {histLoading?"Historical…":"Loading"}</span>
              : <span>{displayData.length} cities</span>}
          </div>
          {/* Download buttons */}
          {[
            { id:"csv", label:"⬇ CSV", title:"Download data as CSV" },
            { id:"png", label:"⬇ PNG", title:"Download view as PNG" },
          ].map(({ id, label, title }) => (
            <button key={id} onClick={() => downloadRef.current?.[id]?.()}
              title={title} style={{
                height:TAB_H, padding:"0 12px",
                background:"transparent", border:"none",
                borderLeft:`1px solid ${c.border}`,
                color:c.textMuted, fontFamily:mono, fontSize:9,
                letterSpacing:"0.1em", textTransform:"uppercase",
                cursor:"pointer", transition:"all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = c.accent; e.currentTarget.style.background = c.accentSubtle; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = c.textMuted; e.currentTarget.style.background = "transparent"; }}
            >{label}</button>
          ))}
          <div style={{ width:1, height:22, background:c.border }}/>
          <ICON_BTN onClick={()=>setSettingsOpen(v=>!v)} title="Settings" active={settingsOpen}>
            ⚙
          </ICON_BTN>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, position:"relative", overflow:"hidden" }}
        onClick={()=>{ if(filtersOpen)setFiltersOpen(false); }}>

        {/* AirQuality — always mounted so Mapbox WebGL context is never destroyed.
            Hidden via visibility (not display:none) on non-map tabs so the context survives. */}
        <div style={{
          position:"absolute", inset:0, zIndex:0,
          visibility:(activeTab==="aqi"||activeTab==="uv")?"visible":"hidden",
          pointerEvents:(activeTab==="aqi"||activeTab==="uv")?"auto":"none",
        }}>
          <AirQuality
            data={displayData} loading={isDataLoading} filters={filters}
            metricMeta={METRIC_META} theme={theme}
            viewMode={viewMode} choroplethOn={choroplethOn} colormap={colormap}
            oceanPreset={oceanPreset} oceanRefreshKey={oceanRefreshKey}
            showCities={showCities} satellite={satellite}
            chartType={chartType} onChartType={setChartType}
            timeWindow={timeWindow} activeTab={activeTab}
            downloadRef={downloadRef}
          />
        </div>

        {/* UV overlay — renders over the shared map, no own Mapbox instance.
            pointerEvents:none lets map interactions pass through in map mode. */}
        {activeTab==="uv" && (
          <div style={{ position:"absolute", inset:0, zIndex:2, pointerEvents:"none" }}>
            <UVIndex data={displayData} loading={isDataLoading} theme={theme}/>
          </div>
        )}

        {activeTab==="carbon" && (
          <div style={{ position:"absolute", inset:0, zIndex:2, background:c.bg }}>
            <CarbonCalculator theme={theme}/>
          </div>
        )}
        {activeTab==="chat" && (
          <div style={{ position:"absolute", inset:0, zIndex:2, background:c.bg }}>
            <QueryChat data={displayData} theme={theme}/>
          </div>
        )}
      </div>

      <SidePanel
        open={filtersOpen}
        filters={filters} onFilter={setFilters}
        onRefresh={fetchAQI} loading={loading} histLoading={histLoading}
        viewMode={viewMode} onViewMode={setViewMode}
        choroplethOn={choroplethOn} onChoroplethOn={setChoroplethOn}
        showCities={showCities} onShowCities={setShowCities}
        satellite={satellite} onSatellite={setSatellite}
        timeWindow={timeWindow} onTimeWindow={setTimeWindow}
        chartType={chartType} onChartType={setChartType}
        theme={theme}
      />

      <SettingsModal open={settingsOpen} onClose={()=>setSettingsOpen(false)}
        theme={theme}
        kpiState={kpiState} onKpiToggle={handleKpiToggle}
        onAlignCards={handleAlignCards}
        colormap={colormap} onColormap={setColormap}
        oceanPreset={oceanPreset} onOcean={handleOceanChange}
        themeSyncing={themeSyncing} onRefreshThemeState={handleRefreshThemeState}
        onManageTemplates={()=>{setSettingsOpen(false);setTemplateOpen(true);}}/>

      <TemplateModal
        open={templateOpen}
        onClose={()=>setTemplateOpen(false)}
        theme={theme}
        currentState={{ themeId:theme.meta.id, colormap, oceanPreset, kpiState }}
        onLoad={(tmpl)=>{
          if (tmpl.themeId && switchTheme) switchTheme(tmpl.themeId);
          if (tmpl.colormap)    setColormap(tmpl.colormap);
          if (tmpl.oceanPreset) handleOceanChange(tmpl.oceanPreset);
          if (tmpl.kpiState)    setKpiState(tmpl.kpiState);
        }}/>

      {activeTab==="aqi" && (
        <KpiCardsLayer kpiState={kpiState} data={displayData}
          filters={filters} metricMeta={METRIC_META}
          theme={theme} colormap={colormap}
          onPositionSave={handlePositionSave}/>
      )}
    </div>
  );
}
