import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";
import axios from "axios";

// ── UV index scale (WHO standard) ─────────────────────────────────────────────
const UV_BANDS = [
  { label: "Low",       min: 0,  max: 2,  color: "#22c55e", advice: "No protection needed for most. Safe to be outside." },
  { label: "Moderate",  min: 3,  max: 5,  color: "#eab308", advice: "Wear sunscreen SPF 15+. Hat recommended. Seek shade midday." },
  { label: "High",      min: 6,  max: 7,  color: "#f97316", advice: "SPF 30+, protective clothing and hat. Reduce midday exposure." },
  { label: "Very High", min: 8,  max: 10, color: "#ef4444", advice: "Minimize sun exposure 10am–4pm. SPF 50+, full coverage." },
  { label: "Extreme",   min: 11, max: 99, color: "#a855f7", advice: "Avoid outdoor activities during peak hours. SPF 50+ essential." },
];

const uvBandFor = (v) => UV_BANDS.find((b) => (v ?? 0) >= b.min && (v ?? 0) <= b.max) ?? UV_BANDS[0];
const uvColor   = (v) => uvBandFor(v)?.color ?? "#22c55e";

// ── Fitzpatrick skin types ────────────────────────────────────────────────────
const SKIN_TYPES = [
  { id:"I",   label:"Type I",   desc:"Very fair — always burns, never tans",         factor:0.5  },
  { id:"II",  label:"Type II",  desc:"Fair — usually burns, sometimes tans",          factor:1.0  },
  { id:"III", label:"Type III", desc:"Medium — sometimes burns, always tans",         factor:1.4  },
  { id:"IV",  label:"Type IV",  desc:"Olive — rarely burns, tans easily",             factor:2.0  },
  { id:"V",   label:"Type V",   desc:"Brown — very rarely burns, tans very easily",   factor:3.0  },
  { id:"VI",  label:"Type VI",  desc:"Dark brown/black — never burns",                factor:5.0  },
];

const SPF_OPTIONS = [
  { value:0,   label:"None"    },
  { value:15,  label:"SPF 15"  },
  { value:30,  label:"SPF 30"  },
  { value:50,  label:"SPF 50"  },
  { value:100, label:"SPF 100" },
];

// Burns at UV=1 after ~60 min for Type II. Formula: (60/UV) × skinFactor × spfEffect
const calcBurnTime = (uv, skinFactor, spfValue) => {
  if (!uv || uv <= 0) return 999;
  const base    = 60 / uv;
  const spfMult = spfValue > 0 ? spfValue * 0.7 : 1;
  return Math.max(1, Math.round(base * skinFactor * spfMult));
};

// Vitamin D: ~10 min at UV=3 for Type II; scales inversely with UV and skin darkness
const calcVitDTime = (uv, skinFactor) => {
  if (!uv || uv < 3) return null;
  return Math.max(1, Math.round((8 / uv) * (1.0 / skinFactor) + 1));
};

// ── GeoJSON for UV dots ────────────────────────────────────────────────────────
const buildUVGeoJSON = (data) => ({
  type: "FeatureCollection",
  features: (data || []).map((city) => {
    const uv = city.uv_index ?? 0;
    return {
      type: "Feature",
      geometry: { type:"Point", coordinates:[city.lon, city.lat] },
      properties: {
        id:       city.location,
        color:    uvColor(uv),
        radius:   Math.max(5, Math.min(22, 5 + uv * 1.3)),
        uv,
        cityJson: JSON.stringify(city),
      },
    };
  }),
});

// ── Hover tooltip ─────────────────────────────────────────────────────────────
function UVHoverTooltip({ city, pos, W, H, theme }) {
  const c = theme.colors, mono = theme.typography.fontFamilyMono;
  const uv   = city.uv_index ?? 0;
  const band = uvBandFor(uv);
  const left = pos.x + 260 > W ? Math.max(4, pos.x - 260) : pos.x + 14;
  let   top  = pos.y - 80;
  if (top < 44) top = pos.y + 14;
  if (top + 160 > H - 8) top = H - 168;
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
        <span style={{ fontSize:10, color:c.textSubtle }}>{city.country}</span>
      </div>
      <div style={{ display:"inline-flex", alignItems:"center", gap:7, marginBottom:7,
        background:`${band.color}22`, border:`1px solid ${band.color}55`,
        borderRadius:4, padding:"4px 9px" }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:band.color }}/>
        <span style={{ fontSize:12, fontWeight:700, color:band.color }}>UV {uv?.toFixed(1)}</span>
        <span style={{ fontSize:9, color:band.color, opacity:0.85 }}>· {band.label}</span>
      </div>
      <div style={{ fontSize:10, color:c.textMuted, lineHeight:1.65 }}>{band.advice}</div>
      <div style={{ fontSize:9, color:c.textSubtle, marginTop:5 }}>Click to open calculator</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function UVIndex({ data, loading, theme }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const isLight  = !!(theme.meta.tags?.includes("light"));
  const mapStyle = isLight ? "mapbox://styles/mapbox/light-v11" : "mapbox://styles/mapbox/dark-v11";

  const mapRef      = useRef(null);
  const mapInst     = useRef(null);
  const dataRef     = useRef(data);
  const styleRef    = useRef(mapStyle);
  const eventsBound = useRef(false);
  const containerRef = useRef(null);

  const [viewMode,     setViewMode]     = useState("map");
  const [hover,        setHover]        = useState(null);
  const [cSize,        setCSize]        = useState({ w:1200, h:700 });
  const [calcOpen,     setCalcOpen]     = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);

  // Calculator inputs
  const [skinType,     setSkinType]     = useState("II");
  const [spf,          setSpf]          = useState(30);
  const [activityMins, setActivityMins] = useState(60);
  const [manualUV,     setManualUV]     = useState(5);

  const calcUV = selectedCity?.uv_index ?? manualUV;
  const skinFactor = SKIN_TYPES.find(s=>s.id===skinType)?.factor ?? 1.0;
  const burnTime   = calcBurnTime(calcUV, skinFactor, spf);
  const vitDTime   = calcVitDTime(calcUV, skinFactor);
  const ratio      = activityMins / burnTime;
  const riskLevel  = ratio >= 1 ? "extreme" : ratio >= 0.7 ? "high" : ratio >= 0.4 ? "moderate" : "low";
  const riskColor  = { extreme:"#ef4444", high:"#f97316", moderate:"#eab308", low:"#22c55e" }[riskLevel];
  const recoSPF    = Math.min(50, Math.max(15, Math.ceil((activityMins / (60/Math.max(calcUV,0.1))) / skinFactor / 0.7 / 5) * 5));

  // Chart state
  const uvCities  = [...(data||[])].filter(d=>d.uv_index!=null).sort((a,b)=>(b.uv_index??0)-(a.uv_index??0));
  const barData   = uvCities.slice(0,30).map(d=>({ name:d.location, value:d.uv_index }));
  const [trendCity,    setTrendCity]    = useState(null);
  const [trendData,    setTrendData]    = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    if (viewMode==="charts" && uvCities.length>0 && !trendCity)
      setTrendCity(uvCities[0].location);
  }, [viewMode, uvCities.length]);

  useEffect(() => {
    if (!trendCity) return;
    setTrendLoading(true);
    axios.get("/api/trend", { params:{ city:trendCity, metric:"uv_index" } })
      .then(r=>setTrendData(r.data)).catch(console.error).finally(()=>setTrendLoading(false));
  }, [trendCity]);

  // Container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e])=>setCSize({w:e.contentRect.width,h:e.contentRect.height}));
    obs.observe(containerRef.current);
    return ()=>obs.disconnect();
  }, []);

  // Map helpers
  const setDots = (map) => map.getSource("uv-cities")?.setData(buildUVGeoJSON(dataRef.current));

  const addLayers = (map, light) => {
    if (!map.getSource("uv-cities"))
      map.addSource("uv-cities", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
    if (!map.getLayer("uv-glow"))
      map.addLayer({ id:"uv-glow", type:"circle", source:"uv-cities",
        paint:{ "circle-radius":["*",["get","radius"],2.2], "circle-color":["get","color"],
          "circle-opacity":0.12, "circle-blur":1 } });
    if (!map.getLayer("uv-dots"))
      map.addLayer({ id:"uv-dots", type:"circle", source:"uv-cities",
        paint:{ "circle-radius":["get","radius"], "circle-color":["get","color"],
          "circle-opacity":0.88, "circle-stroke-width":1.5,
          "circle-stroke-color":["get","color"], "circle-stroke-opacity":0.4 } });
    if (eventsBound.current) return;
    eventsBound.current = true;
    map.on("mouseenter", "uv-dots", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const city = JSON.parse(e.features[0].properties.cityJson);
      const pt   = map.project([city.lon, city.lat]);
      setHover({ city, x:pt.x, y:pt.y });
    });
    map.on("mouseleave", "uv-dots", () => { map.getCanvas().style.cursor=""; setHover(null); });
    map.on("click", "uv-dots", (e) => {
      const city = JSON.parse(e.features[0].properties.cityJson);
      setSelectedCity(city);
      setManualUV(city.uv_index ?? 5);
      setCalcOpen(true);
    });
    map.on("move", () => {
      setHover(p => { if(!p) return null; const pt=map.project([p.city.lon,p.city.lat]); return{...p,x:pt.x,y:pt.y}; });
    });
  };

  const rehydrate = (map, light) => {
    map.getContainer().style.background = c.bg;
    addLayers(map, light);
    setDots(map);
    map.once("idle", () => { try { setDots(map); } catch(_){} });
  };

  // Init map
  useEffect(() => {
    if (mapInst.current || !mapRef.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container:mapRef.current, style:styleRef.current,
      center:[10,22], zoom:2, minZoom:1.2,
      projection:"mercator", renderWorldCopies:true,
      attributionControl:false, preserveDrawingBuffer:true,
    });
    map.addControl(new mapboxgl.NavigationControl({showCompass:false}), "bottom-right");
    map.addControl(new mapboxgl.AttributionControl({compact:true}), "bottom-right");
    map.on("load", () => { map.resize(); rehydrate(map, styleRef.current.includes("light")); });
    mapInst.current = map;
    return () => { map.remove(); mapInst.current=null; };
  }, []);

  // Theme switch
  useEffect(() => {
    if (mapStyle===styleRef.current) return;
    styleRef.current = mapStyle;
    const map = mapInst.current; if(!map) return;
    const go = () => { map.setStyle(mapStyle); map.once("style.load",()=>rehydrate(map,mapStyle.includes("light"))); };
    if (map.isStyleLoaded()) go(); else map.once("style.load",go);
  }, [mapStyle]);

  // Data update
  useEffect(() => {
    dataRef.current = data;
    const map = mapInst.current; if(!map) return;
    if (map.isStyleLoaded()) setDots(map); else map.once("style.load",()=>setDots(map));
  }, [data]);

  useEffect(() => {
    if (viewMode==="map" && mapInst.current)
      window.requestAnimationFrame(()=>mapInst.current?.resize());
  }, [viewMode]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const selStyle = {
    padding:"5px 10px", background:c.inputBg??c.surface,
    border:`1px solid ${c.inputBorder??c.border}`,
    borderRadius:4, color:c.text, fontFamily:mono, fontSize:11,
    cursor:"pointer", outline:"none",
  };

  const pillBtn = (active, onClick, label) => (
    <button onClick={onClick} style={{
      padding:"5px 12px", border:`1px solid ${active?c.accent:c.border}`,
      borderRadius:4, background:active?c.accentSubtle:c.surface,
      color:active?c.accent:c.textMuted, fontFamily:mono, fontSize:9,
      cursor:"pointer", letterSpacing:"0.08em", textTransform:"uppercase",
      transition:"all 0.15s",
    }}>{label}</button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ position:"absolute", inset:0, background:c.bg, display:"flex", flexDirection:"column" }}>

      {/* Sub-tab bar */}
      <div style={{ height:40, display:"flex", alignItems:"stretch",
        background:c.panel, borderBottom:`1px solid ${c.border}`, flexShrink:0 }}>
        {[{id:"map",label:"Map"},{id:"charts",label:"Charts"}].map(t => {
          const active = viewMode===t.id;
          return (
            <button key={t.id} onClick={()=>setViewMode(t.id)} style={{
              padding:"0 18px", background:"transparent", border:"none",
              borderBottom:`2px solid ${active?c.accent:"transparent"}`,
              color:active?c.accent:c.textMuted, fontFamily:mono, fontSize:10,
              letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer",
            }}>{t.label}</button>
          );
        })}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10, padding:"0 16px" }}>
          <button onClick={()=>{ setSelectedCity(null); setCalcOpen(v=>!v); }} style={{
            padding:"5px 14px", border:`1px solid ${calcOpen?c.accent:c.border}`,
            borderRadius:4, background:calcOpen?c.accentSubtle:c.surface,
            color:calcOpen?c.accent:c.textMuted, fontFamily:mono, fontSize:9,
            cursor:"pointer", letterSpacing:"0.1em", textTransform:"uppercase",
          }}>☀ UV Calculator</button>
          <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, borderLeft:`1px solid ${c.border}`, paddingLeft:10 }}>
            {uvCities.length} cities
          </div>
        </div>
      </div>

      <div style={{ flex:1, position:"relative", overflow:"hidden" }}>

        {/* ── MAP ── */}
        <div style={{ position:"absolute", inset:0,
          opacity:viewMode==="map"?1:0, visibility:viewMode==="map"?"visible":"hidden",
          pointerEvents:viewMode==="map"?"auto":"none", transition:"opacity 0.18s" }}>
          <div ref={mapRef} style={{ position:"absolute", inset:0 }}/>
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:1,
            outline:`6px solid ${c.bg}`, outlineOffset:"-6px" }}/>
          {/* UV Legend */}
          <div style={{ position:"absolute", bottom:52, left:12, zIndex:10,
            background:`${c.panel}ee`, border:`1px solid ${c.border}`,
            borderRadius:6, padding:"10px 12px", backdropFilter:"blur(8px)", pointerEvents:"none" }}>
            <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.18em",
              color:c.textSubtle, textTransform:"uppercase", marginBottom:7 }}>UV Index</div>
            {UV_BANDS.map(b=>(
              <div key={b.label} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:b.color, flexShrink:0 }}/>
                <span style={{ fontFamily:mono, fontSize:10, color:c.textMuted }}>
                  {b.label} ({b.min}–{b.max===99?"11+":b.max})
                </span>
              </div>
            ))}
          </div>
          {hover && <UVHoverTooltip city={hover.city} pos={hover} W={cSize.w} H={cSize.h} theme={theme}/>}
        </div>

        {/* ── CHARTS ── */}
        {viewMode==="charts" && (
          <div style={{ position:"absolute", inset:0, background:c.bg,
            display:"flex", gap:0, overflow:"hidden" }}>
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
                    <YAxis type="category" dataKey="name" width={120} axisLine={false} tickLine={false} interval={0}
                      tick={({x,y,payload})=>(
                        <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                          fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                      )}/>
                    <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                      labelStyle={{color:c.text,fontWeight:700}} itemStyle={{color:c.text}}
                      formatter={v=>[v?.toFixed(1),"UV Index"]}/>
                    <Bar dataKey="value" radius={[0,3,3,0]} onClick={e=>{ setTrendCity(e.name); }}>
                      {barData.map((d,i)=><Cell key={i} fill={uvColor(d.value)} opacity={0.85}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Trend */}
            <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"10px 16px 6px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.12em",
                  color:c.textSubtle, textTransform:"uppercase" }}>Trend</div>
                <select value={trendCity??""} onChange={e=>setTrendCity(e.target.value)} style={selStyle}>
                  {uvCities.slice(0,60).map(d=>(
                    <option key={d.location} value={d.location}>{d.location}</option>
                  ))}
                </select>
                {trendData.length>0 && !trendLoading && (
                  <span style={{ fontFamily:mono, fontSize:9, color:c.textSubtle }}>
                    {trendData.length} pts
                  </span>
                )}
              </div>
              <div style={{ flex:1, padding:"4px 16px 12px 4px" }}>
                {trendLoading ? (
                  <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
                    fontFamily:mono, fontSize:11, color:c.textMuted }}>Loading…</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{top:8,right:16,left:4,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.border} opacity={0.4}/>
                      <XAxis dataKey="date" tickFormatter={d=>d?.slice(0,7)}
                        tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                        axisLine={{stroke:c.border}} tickLine={false} interval={45}/>
                      <YAxis tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                        axisLine={false} tickLine={false} width={30} domain={[0,"auto"]}/>
                      <Tooltip contentStyle={{background:c.surface,border:`1px solid ${c.border}`,borderRadius:6,fontFamily:mono,fontSize:11}}
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

        {/* ── UV EXPOSURE CALCULATOR ── */}
        {calcOpen && (
          <>
            <div onClick={()=>setCalcOpen(false)} style={{
              position:"absolute", inset:0, zIndex:40,
              background:"rgba(0,0,0,0.38)", backdropFilter:"blur(3px)" }}/>
            <div style={{
              position:"absolute", bottom:0, left:0, right:0, zIndex:50,
              background:c.panel, borderTop:`2px solid ${c.accent}`,
              boxShadow:"0 -8px 40px rgba(0,0,0,0.5)",
              maxHeight:"72%", display:"flex", flexDirection:"column",
            }}>
              {/* Calc header */}
              <div style={{ padding:"13px 20px 11px", borderBottom:`1px solid ${c.border}`,
                display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
                <span style={{ fontFamily:mono, fontSize:12, fontWeight:700, color:c.accent }}>
                  ☀ UV Exposure Calculator
                </span>
                {selectedCity && (
                  <div style={{ display:"inline-flex", alignItems:"center", gap:6,
                    background:`${uvColor(calcUV)}18`, border:`1px solid ${uvColor(calcUV)}44`,
                    borderRadius:4, padding:"3px 8px" }}>
                    <span style={{ fontFamily:mono, fontSize:10, color:uvColor(calcUV) }}>
                      {selectedCity.location} · UV {calcUV.toFixed(1)}
                    </span>
                    <button onClick={()=>setSelectedCity(null)} style={{
                      background:"none", border:"none", color:c.textSubtle,
                      fontSize:12, cursor:"pointer", padding:0, lineHeight:1 }}>×</button>
                  </div>
                )}
                <button onClick={()=>setCalcOpen(false)} style={{
                  marginLeft:"auto", background:"none", border:"none",
                  color:c.textMuted, fontSize:20, cursor:"pointer" }}>×</button>
              </div>

              {/* Calc body */}
              <div style={{ overflow:"auto", padding:"18px 20px",
                display:"flex", gap:32, flexWrap:"wrap" }}>

                {/* Inputs */}
                <div style={{ flex:"0 0 300px", display:"flex", flexDirection:"column", gap:16 }}>

                  {/* UV Index */}
                  <div>
                    <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                      color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>
                      UV Index {selectedCity ? `— ${selectedCity.location}` : "— manual"}
                    </div>
                    {!selectedCity ? (
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <input type="range" min={0} max={14} step={0.1} value={manualUV}
                          onChange={e=>setManualUV(Number(e.target.value))}
                          style={{ flex:1, accentColor:uvColor(manualUV) }}/>
                        <span style={{ fontFamily:mono, fontSize:18, fontWeight:700,
                          color:uvColor(manualUV), minWidth:36, textAlign:"right" }}>
                          {manualUV.toFixed(1)}
                        </span>
                        <span style={{ fontFamily:mono, fontSize:9, color:uvColor(manualUV),
                          background:`${uvColor(manualUV)}18`, border:`1px solid ${uvColor(manualUV)}44`,
                          borderRadius:4, padding:"3px 7px" }}>
                          {uvBandFor(manualUV).label}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ fontFamily:mono, fontSize:24, fontWeight:700, color:uvColor(calcUV) }}>
                          {calcUV.toFixed(1)}
                        </div>
                        <div style={{ fontFamily:mono, fontSize:10, color:uvColor(calcUV),
                          background:`${uvColor(calcUV)}18`, border:`1px solid ${uvColor(calcUV)}44`,
                          borderRadius:4, padding:"4px 9px" }}>
                          {uvBandFor(calcUV).label}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Skin type */}
                  <div>
                    <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                      color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>Skin Type (Fitzpatrick)</div>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:6 }}>
                      {SKIN_TYPES.map(s => (
                        <button key={s.id} onClick={()=>setSkinType(s.id)} style={{
                          padding:"5px 11px", border:`1px solid ${skinType===s.id?c.accent:c.border}`,
                          borderRadius:4, background:skinType===s.id?c.accentSubtle:c.surface,
                          color:skinType===s.id?c.accent:c.textMuted,
                          fontFamily:mono, fontSize:9, cursor:"pointer",
                        }}>{s.id}</button>
                      ))}
                    </div>
                    <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle }}>
                      {SKIN_TYPES.find(s=>s.id===skinType)?.desc}
                    </div>
                  </div>

                  {/* SPF */}
                  <div>
                    <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                      color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>Sunscreen SPF</div>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {SPF_OPTIONS.map(opt=>(
                        <button key={opt.value} onClick={()=>setSpf(opt.value)} style={{
                          padding:"5px 11px", border:`1px solid ${spf===opt.value?c.accent:c.border}`,
                          borderRadius:4, background:spf===opt.value?c.accentSubtle:c.surface,
                          color:spf===opt.value?c.accent:c.textMuted,
                          fontFamily:mono, fontSize:9, cursor:"pointer",
                        }}>{opt.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Planned time */}
                  <div>
                    <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
                      color:c.textSubtle, textTransform:"uppercase", marginBottom:6 }}>
                      Planned outdoor time — {activityMins < 60 ? `${activityMins}min` : `${(activityMins/60).toFixed(1)}h`}
                    </div>
                    <input type="range" min={5} max={480} step={5} value={activityMins}
                      onChange={e=>setActivityMins(Number(e.target.value))}
                      style={{ width:"100%", accentColor:c.accent }}/>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      fontFamily:mono, fontSize:8, color:c.textSubtle, marginTop:2 }}>
                      <span>5m</span><span>1h</span><span>2h</span><span>4h</span><span>8h</span>
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div style={{ flex:"1 1 260px", display:"flex", flexDirection:"column", gap:10 }}>
                  {/* Risk card */}
                  <div style={{ background:`${riskColor}15`, border:`2px solid ${riskColor}55`,
                    borderRadius:8, padding:"14px 16px" }}>
                    <div style={{ fontFamily:mono, fontSize:8, letterSpacing:"0.14em",
                      color:riskColor, textTransform:"uppercase", marginBottom:4 }}>
                      {activityMins < 60 ? `${activityMins}min` : `${(activityMins/60).toFixed(1)}h`} at UV {calcUV.toFixed(1)}
                    </div>
                    <div style={{ fontFamily:mono, fontSize:22, fontWeight:700, color:riskColor, marginBottom:6 }}>
                      {riskLevel.toUpperCase()} RISK
                    </div>
                    <div style={{ fontFamily:mono, fontSize:10, color:c.textMuted, lineHeight:1.7 }}>
                      {riskLevel==="extreme" && `Your planned time is ${Math.round((activityMins/burnTime)*100)}% of your safe limit. Reduce time, seek shade, or use higher SPF.`}
                      {riskLevel==="high"    && `You're approaching your safe limit. Reapply SPF regularly and take shade breaks.`}
                      {riskLevel==="moderate"&& `Moderate usage. You have some buffer — reapply sunscreen every 2 hours.`}
                      {riskLevel==="low"     && `You're well within safe limits for these conditions. Enjoy!`}
                    </div>
                  </div>

                  {/* Metric cards */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                    {[
                      { label:"Without protection", value:calcBurnTime(calcUV,skinFactor,0), unit:"min", sub:"until redness" },
                      { label:"With SPF "+spf,       value:burnTime,                          unit:"min", sub:"until redness" },
                      { label:"Recommended SPF",     value:recoSPF,                           unit:"",    sub:"for your plan" },
                      { label:"Vitamin D time",      value:vitDTime??"N/A",                   unit:vitDTime?"min":"", sub:"unprotected" },
                    ].map(({ label, value, unit, sub }) => (
                      <div key={label} style={{ background:c.surface, border:`1px solid ${c.border}`,
                        borderRadius:6, padding:"10px 12px" }}>
                        <div style={{ fontFamily:mono, fontSize:8, color:c.textSubtle,
                          letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                        <div style={{ fontFamily:mono, fontSize:20, fontWeight:700, color:c.text }}>
                          {value}
                          {unit && <span style={{ fontSize:10, fontWeight:400, marginLeft:3 }}>{unit}</span>}
                        </div>
                        <div style={{ fontFamily:mono, fontSize:8, color:c.textSubtle, marginTop:2 }}>{sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* WHO guidance */}
                  <div style={{ background:c.surface, border:`1px solid ${c.border}`,
                    borderRadius:6, padding:"10px 14px" }}>
                    <div style={{ fontFamily:mono, fontSize:8, letterSpacing:"0.12em",
                      color:c.textSubtle, textTransform:"uppercase", marginBottom:5 }}>
                      WHO Guidance · UV {calcUV.toFixed(1)} · {uvBandFor(calcUV).label}
                    </div>
                    <div style={{ fontFamily:mono, fontSize:10, color:c.textMuted, lineHeight:1.75 }}>
                      {uvBandFor(calcUV).advice}
                      {vitDTime ? ` Approximately ${vitDTime} min of unprotected exposure synthesises your daily vitamin D.` : " UV too low for efficient vitamin D synthesis today."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Loading overlay */}
        {loading && !uvCities.length && (
          <div style={{ position:"absolute", inset:0, zIndex:20, display:"flex", alignItems:"center",
            justifyContent:"center", flexDirection:"column", gap:10,
            background:`${c.bg}cc`, backdropFilter:"blur(4px)", pointerEvents:"none" }}>
            <div style={{ fontFamily:mono, fontSize:11, letterSpacing:"0.2em", color:c.textSubtle }}>
              LOADING UV DATA
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
