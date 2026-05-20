/**
 * UVIndex — overlay, no Mapbox instance.
 * Sits on top of AirQuality's shared map (which shows UV dots when this tab is active).
 * Root has pointer-events:none so map stays pannable/zoomable in Map mode.
 * Interactive children (nav bar, charts, modal) set pointer-events:auto explicitly.
 */
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";
import axios from "axios";

const UV_BANDS = [
  { min:0,  max:2,  color:"#22c55e", label:"Low",       advice:"No protection needed for most." },
  { min:3,  max:5,  color:"#eab308", label:"Moderate",  advice:"SPF 15+ and a hat recommended." },
  { min:6,  max:7,  color:"#f97316", label:"High",      advice:"SPF 30+, protective clothing." },
  { min:8,  max:10, color:"#ef4444", label:"Very High", advice:"Minimize exposure 10am–4pm. SPF 50+." },
  { min:11, max:99, color:"#a855f7", label:"Extreme",   advice:"Avoid outdoor activity at peak hours." },
];
const uvBandFor  = (v) => UV_BANDS.find(b => (v ?? 0) >= b.min && (v ?? 0) <= b.max) ?? UV_BANDS[0];
const uvColorFor = (v) => uvBandFor(v).color;

const SKIN_TYPES = [
  { id:"I",   desc:"Very fair — always burns",  factor:0.5 },
  { id:"II",  desc:"Fair — usually burns",       factor:1.0 },
  { id:"III", desc:"Medium — sometimes burns",   factor:1.4 },
  { id:"IV",  desc:"Olive — rarely burns",       factor:2.0 },
  { id:"V",   desc:"Brown — very rarely burns",  factor:3.0 },
  { id:"VI",  desc:"Dark — never burns",         factor:5.0 },
];
const SPF_OPTIONS = [
  { value:0,   label:"None"    },
  { value:15,  label:"SPF 15"  },
  { value:30,  label:"SPF 30"  },
  { value:50,  label:"SPF 50"  },
  { value:100, label:"SPF 100" },
];

const calcBurnTime = (uv, skinF, spf) => {
  if (!uv || uv <= 0) return 999;
  return Math.max(1, Math.round((60 / uv) * skinF * (spf > 0 ? spf * 0.7 : 1)));
};
const calcVitDTime = (uv, skinF) => {
  if (!uv || uv < 3) return null;
  return Math.max(1, Math.round((8 / uv) * (1 / skinF) + 1));
};

export default function UVIndex({ data, loading, theme }) {
  const c    = theme?.colors ?? {};
  const mono = theme?.typography?.fontFamilyMono ?? "monospace";
  const shape = theme?.shape ?? {};

  // "map" | "charts" | "calculator"
  const [viewMode, setViewMode] = useState("map");

  // Calculator inputs
  const [selectedCity,  setSelectedCity]  = useState(null);
  const [skinType,      setSkinType]      = useState("II");
  const [spf,           setSpf]           = useState(30);
  const [activityMins,  setActivityMins]  = useState(60);
  const [manualUV,      setManualUV]      = useState(5);

  // Charts
  const uvCities = [...(data || [])].filter(d => d.uv_index != null)
    .sort((a, b) => (b.uv_index ?? 0) - (a.uv_index ?? 0));
  const barData  = uvCities.slice(0, 30).map(d => ({ name: d.location, value: d.uv_index }));
  const [trendCity,    setTrendCity]    = useState(null);
  const [trendData,    setTrendData]    = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    if (viewMode === "charts" && uvCities.length > 0 && !trendCity)
      setTrendCity(uvCities[0].location);
  }, [viewMode, uvCities.length]);

  useEffect(() => {
    if (!trendCity) return;
    setTrendLoading(true);
    axios.get("/api/trend", { params: { city: trendCity, metric: "uv_index" } })
      .then(r => setTrendData(r.data)).catch(console.error).finally(() => setTrendLoading(false));
  }, [trendCity]);

  // Calculator computed values
  const calcUV    = selectedCity?.uv_index ?? manualUV;
  const skinFactor = SKIN_TYPES.find(s => s.id === skinType)?.factor ?? 1.0;
  const burnTime   = calcBurnTime(calcUV, skinFactor, spf);
  const vitDTime   = calcVitDTime(calcUV, skinFactor);
  const ratio      = activityMins / burnTime;
  const riskLevel  = ratio >= 1 ? "extreme" : ratio >= 0.7 ? "high" : ratio >= 0.4 ? "moderate" : "low";
  const riskColor  = { extreme:"#ef4444", high:"#f97316", moderate:"#eab308", low:"#22c55e" }[riskLevel];
  const recoSPF    = Math.min(50, Math.max(15,
    Math.ceil((activityMins / (60 / Math.max(calcUV, 0.1))) / skinFactor / 0.7 / 5) * 5));

  const selStyle = {
    padding:"5px 10px", background:c.inputBg ?? c.surface,
    border:`1px solid ${c.inputBorder ?? c.border}`,
    borderRadius:4, color:c.text, fontFamily:mono, fontSize:11,
    cursor:"pointer", outline:"none",
  };

  const isMap     = viewMode === "map";
  const isCharts  = viewMode === "charts";
  const isCalc    = viewMode === "calculator";

  const Tab = ({ id, label }) => {
    const active = viewMode === id;
    return (
      <button onClick={() => setViewMode(id)} style={{
        padding:"0 18px", height:"100%", background:"transparent", border:"none",
        borderBottom:`2px solid ${active ? c.accent : "transparent"}`,
        color: active ? c.accent : c.textMuted, fontFamily:mono, fontSize:10,
        letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer",
        pointerEvents:"auto",
      }}>{label}</button>
    );
  };

  return (
    /* Root: pointer-events:none — allows map drag/pan/zoom in map mode.
       Interactive children override this with pointer-events:auto. */
    <div style={{
      position:"absolute", inset:0, display:"flex", flexDirection:"column",
      background: isCharts ? c.bg : "transparent",
      pointerEvents:"none",
    }}>

      {/* ── Nav bar — always interactive ── */}
      <div style={{
        height:40, display:"flex", alignItems:"stretch",
        background:c.panel, borderBottom:`1px solid ${c.border}`,
        flexShrink:0, pointerEvents:"auto",
      }}>
        <Tab id="map"        label="Map"           />
        <Tab id="charts"     label="Charts"        />
        <Tab id="calculator" label="UV Calculator" />
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center",
          gap:10, padding:"0 16px", fontFamily:mono, fontSize:9, color:c.textSubtle,
          borderLeft:`1px solid ${c.border}` }}>
          {uvCities.length} cities
        </div>
      </div>

      {/* ── Charts view — opaque, full pointer events ── */}
      {isCharts && (
        <div style={{ flex:1, background:c.bg, display:"flex", overflow:"hidden", pointerEvents:"auto" }}>
          {/* Ranking */}
          <div style={{ flex:1, display:"flex", flexDirection:"column",
            borderRight:`1px solid ${c.border}` }}>
            <div style={{ padding:"12px 16px 6px", fontFamily:mono, fontSize:9,
              letterSpacing:"0.15em", color:c.textSubtle, textTransform:"uppercase" }}>
              Top 30 cities by UV Index
            </div>
            <div style={{ flex:1, padding:"0 12px 12px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{top:0,right:50,left:120,bottom:0}}>
                  <XAxis type="number" tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                    axisLine={{stroke:c.border}} tickLine={false} domain={[0,14]}/>
                  <YAxis type="category" dataKey="name" width={120}
                    axisLine={false} tickLine={false} interval={0}
                    tick={({x,y,payload})=>(
                      <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                        fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                    )}/>
                  <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,
                    borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                    labelStyle={{color:c.text,fontWeight:700}} itemStyle={{color:c.text}}
                    formatter={v=>[v?.toFixed(1),"UV Index"]}/>
                  <Bar dataKey="value" radius={[0,3,3,0]} onClick={e=>setTrendCity(e.name)}>
                    {barData.map((d,i)=><Cell key={i} fill={uvColorFor(d.value)} opacity={0.85}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Trend */}
          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"10px 16px 6px", display:"flex", alignItems:"center",
              gap:8, flexShrink:0 }}>
              <span style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.12em",
                color:c.textSubtle, textTransform:"uppercase" }}>Trend</span>
              <select value={trendCity ?? ""} onChange={e=>setTrendCity(e.target.value)}
                style={selStyle}>
                {uvCities.slice(0,60).map(d=>(
                  <option key={d.location} value={d.location}>{d.location}</option>
                ))}
              </select>
            </div>
            <div style={{ flex:1, padding:"4px 16px 12px 4px" }}>
              {trendLoading ? (
                <div style={{ height:"100%", display:"flex", alignItems:"center",
                  justifyContent:"center", fontFamily:mono, fontSize:11, color:c.textMuted }}>
                  Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{top:8,right:16,left:4,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.border} opacity={0.4}/>
                    <XAxis dataKey="date" tickFormatter={d=>d?.slice(0,7)}
                      tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                      axisLine={{stroke:c.border}} tickLine={false} interval={45}/>
                    <YAxis tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                      axisLine={false} tickLine={false} width={30} domain={[0,"auto"]}/>
                    <Tooltip contentStyle={{background:c.surface,border:`1px solid ${c.border}`,
                      borderRadius:6,fontFamily:mono,fontSize:11}}
                      labelStyle={{color:c.textMuted}}
                      formatter={v=>[typeof v==="number"?v.toFixed(1):v,"UV Index"]}
                      labelFormatter={d=>d?.slice(0,10)??""}/>
                    <Line type="monotone" dataKey="uv_index" stroke={c.accent}
                      strokeWidth={1.5} dot={false} activeDot={{r:3}}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Map mode — transparent spacer (map shows through, no pointer capture) ── */}
      {isMap && <div style={{ flex:1, background:"transparent", pointerEvents:"none" }}/>}

      {/* ── Calculator modal (centered, like Settings) ── */}
      {isCalc && (
        <>
          {/* Backdrop — clicking it returns to map */}
          <div onClick={() => setViewMode("map")} style={{
            position:"absolute", inset:0, zIndex:60,
            background:"rgba(0,0,0,0.45)", backdropFilter:"blur(3px)",
            pointerEvents:"auto",
          }}/>
          {/* Modal */}
          <div style={{
            position:"absolute", zIndex:61,
            top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            width:"min(760px,95vw)", maxHeight:"82vh",
            background:c.panel, border:`1px solid ${c.border}`,
            borderRadius:shape.modalRadius ?? 12,
            boxShadow:"0 24px 64px rgba(0,0,0,0.6)",
            display:"flex", flexDirection:"column", overflow:"hidden",
            pointerEvents:"auto",
          }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ padding:"14px 20px", borderBottom:`1px solid ${c.border}`,
              display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
              <span style={{ fontFamily:mono, fontSize:12, fontWeight:700, color:c.accent }}>
                ☀ UV Exposure Calculator
              </span>
              {selectedCity && (
                <div style={{ display:"inline-flex", alignItems:"center", gap:6,
                  background:`${uvColorFor(calcUV)}18`, border:`1px solid ${uvColorFor(calcUV)}44`,
                  borderRadius:4, padding:"3px 8px" }}>
                  <span style={{ fontFamily:mono, fontSize:10, color:uvColorFor(calcUV) }}>
                    {selectedCity.location} · UV {calcUV.toFixed(1)}
                  </span>
                  <button onClick={() => setSelectedCity(null)} style={{
                    background:"none", border:"none", color:c.textSubtle,
                    fontSize:12, cursor:"pointer", padding:0, lineHeight:1 }}>×</button>
                </div>
              )}
              <button onClick={() => setViewMode("map")} style={{
                marginLeft:"auto", background:"none", border:"none",
                color:c.textMuted, fontSize:20, cursor:"pointer", lineHeight:1,
              }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ overflow:"auto", padding:"20px",
              display:"flex", gap:28, flexWrap:"wrap" }}>

              {/* ── Inputs ── */}
              <div style={{ flex:"0 0 300px", display:"flex", flexDirection:"column", gap:16 }}>

                {/* UV value */}
                <div>
                  <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                    color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>
                    UV Index {selectedCity ? `— ${selectedCity.location}` : "— manual"}
                  </div>
                  {!selectedCity ? (
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <input type="range" min={0} max={14} step={0.1} value={manualUV}
                        onChange={e => setManualUV(Number(e.target.value))}
                        style={{ flex:1, accentColor:uvColorFor(manualUV) }}/>
                      <span style={{ fontFamily:mono, fontSize:18, fontWeight:700,
                        color:uvColorFor(manualUV), minWidth:36, textAlign:"right" }}>
                        {manualUV.toFixed(1)}
                      </span>
                      <span style={{ fontFamily:mono, fontSize:9, color:uvColorFor(manualUV),
                        background:`${uvColorFor(manualUV)}18`,
                        border:`1px solid ${uvColorFor(manualUV)}44`,
                        borderRadius:4, padding:"3px 7px" }}>
                        {uvBandFor(manualUV).label}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontFamily:mono, fontSize:24, fontWeight:700,
                        color:uvColorFor(calcUV) }}>{calcUV.toFixed(1)}</span>
                      <span style={{ fontFamily:mono, fontSize:9, color:uvColorFor(calcUV),
                        background:`${uvColorFor(calcUV)}18`,
                        border:`1px solid ${uvColorFor(calcUV)}44`,
                        borderRadius:4, padding:"4px 9px" }}>
                        {uvBandFor(calcUV).label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Skin type */}
                <div>
                  <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                    color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>
                    Skin Type (Fitzpatrick)
                  </div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:5 }}>
                    {SKIN_TYPES.map(s => (
                      <button key={s.id} onClick={() => setSkinType(s.id)} style={{
                        padding:"5px 11px",
                        border:`1px solid ${skinType === s.id ? c.accent : c.border}`,
                        borderRadius:4,
                        background: skinType === s.id ? c.accentSubtle : c.surface,
                        color: skinType === s.id ? c.accent : c.textMuted,
                        fontFamily:mono, fontSize:9, cursor:"pointer",
                      }}>{s.id}</button>
                    ))}
                  </div>
                  <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle }}>
                    {SKIN_TYPES.find(s => s.id === skinType)?.desc}
                  </div>
                </div>

                {/* SPF */}
                <div>
                  <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                    color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>
                    Sunscreen SPF
                  </div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {SPF_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setSpf(opt.value)} style={{
                        padding:"5px 11px",
                        border:`1px solid ${spf === opt.value ? c.accent : c.border}`,
                        borderRadius:4,
                        background: spf === opt.value ? c.accentSubtle : c.surface,
                        color: spf === opt.value ? c.accent : c.textMuted,
                        fontFamily:mono, fontSize:9, cursor:"pointer",
                      }}>{opt.label}</button>
                    ))}
                  </div>
                </div>

                {/* Planned time */}
                <div>
                  <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                    color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>
                    Planned outdoor time —{" "}
                    {activityMins < 60 ? `${activityMins}min` : `${(activityMins / 60).toFixed(1)}h`}
                  </div>
                  <input type="range" min={5} max={480} step={5} value={activityMins}
                    onChange={e => setActivityMins(Number(e.target.value))}
                    style={{ width:"100%", accentColor:c.accent }}/>
                  <div style={{ display:"flex", justifyContent:"space-between",
                    fontFamily:mono, fontSize:8, color:c.textSubtle, marginTop:2 }}>
                    <span>5m</span><span>1h</span><span>2h</span><span>4h</span><span>8h</span>
                  </div>
                </div>
              </div>

              {/* ── Results ── */}
              <div style={{ flex:"1 1 260px", display:"flex", flexDirection:"column", gap:10 }}>

                {/* Risk card */}
                <div style={{ background:`${riskColor}15`, border:`2px solid ${riskColor}55`,
                  borderRadius:8, padding:"14px 16px" }}>
                  <div style={{ fontFamily:mono, fontSize:8, letterSpacing:"0.14em",
                    color:riskColor, textTransform:"uppercase", marginBottom:4 }}>
                    {activityMins < 60 ? `${activityMins}min` : `${(activityMins/60).toFixed(1)}h`}{" "}
                    at UV {calcUV.toFixed(1)}
                  </div>
                  <div style={{ fontFamily:mono, fontSize:22, fontWeight:700,
                    color:riskColor, marginBottom:5 }}>
                    {riskLevel.toUpperCase()} RISK
                  </div>
                  <div style={{ fontFamily:mono, fontSize:10, color:c.textMuted, lineHeight:1.7 }}>
                    {riskLevel === "extreme" &&
                      `Your plan is ${Math.round((activityMins/burnTime)*100)}% of your safe limit. Reduce time or raise SPF.`}
                    {riskLevel === "high" &&
                      "Approaching your safe limit. Reapply SPF regularly and take shade breaks."}
                    {riskLevel === "moderate" &&
                      "Moderate usage. Reapply sunscreen every 2 hours."}
                    {riskLevel === "low" &&
                      "Well within safe limits for these conditions. Enjoy!"}
                  </div>
                </div>

                {/* Metric cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                  {[
                    { label:"Without SPF",     value:calcBurnTime(calcUV,skinFactor,0), unit:"min" },
                    { label:`With SPF ${spf}`, value:burnTime,                          unit:"min" },
                    { label:"Recommended SPF", value:recoSPF,                           unit:""    },
                    { label:"Vitamin D",       value:vitDTime ?? "N/A",                 unit:vitDTime ? "min" : "" },
                  ].map(({ label, value, unit }) => (
                    <div key={label} style={{ background:c.surface, border:`1px solid ${c.border}`,
                      borderRadius:6, padding:"9px 12px" }}>
                      <div style={{ fontFamily:mono, fontSize:8, color:c.textSubtle,
                        letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3 }}>
                        {label}
                      </div>
                      <div style={{ fontFamily:mono, fontSize:20, fontWeight:700, color:c.text }}>
                        {value}
                        {unit && (
                          <span style={{ fontSize:10, fontWeight:400, marginLeft:3 }}>{unit}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* WHO guidance */}
                <div style={{ background:c.surface, border:`1px solid ${c.border}`,
                  borderRadius:6, padding:"10px 14px" }}>
                  <div style={{ fontFamily:mono, fontSize:8, letterSpacing:"0.12em",
                    color:c.textSubtle, textTransform:"uppercase", marginBottom:5 }}>
                    WHO guidance · UV {calcUV.toFixed(1)} · {uvBandFor(calcUV).label}
                  </div>
                  <div style={{ fontFamily:mono, fontSize:10, color:c.textMuted, lineHeight:1.75 }}>
                    {uvBandFor(calcUV).advice}
                    {vitDTime
                      ? ` ~${vitDTime} min unprotected synthesises your daily vitamin D.`
                      : " UV too low for efficient vitamin D synthesis today."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
