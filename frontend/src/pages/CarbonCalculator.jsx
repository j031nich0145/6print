/**
 * CarbonCalculator — overlay component, no Mapbox instance.
 * Sits on top of AirQuality's shared map (which shows CO dots when this tab is active).
 * Root has pointer-events:none so map stays pannable in Map mode.
 */
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";
import axios from "axios";

// ── CO band colors ────────────────────────────────────────────────────────────
const CO_BANDS = [
  { min:0,     max:499,   color:"#22c55e", label:"Low"       },
  { min:500,   max:1499,  color:"#eab308", label:"Moderate"  },
  { min:1500,  max:3999,  color:"#f97316", label:"Elevated"  },
  { min:4000,  max:9999,  color:"#ef4444", label:"High"      },
  { min:10000, max:Infinity,color:"#a855f7",label:"Very High"},
];
const coBandFor  = (v) => CO_BANDS.find(b=>(v??0)>=b.min&&(v??0)<=b.max) ?? CO_BANDS[0];
const coColorFor = (v) => coBandFor(v).color;

// ── Personal footprint calculator ─────────────────────────────────────────────
const VEHICLE_FACTORS = { none:0,ev:0.05,hybrid:0.10,phev:0.07,gas:0.17,diesel:0.15,suv_gas:0.22 };
const DIET_BASE = { vegan:1.5,vegetarian:1.7,pescatarian:2.0,flexitarian:2.5,omnivore:3.0,high_meat:3.7 };
const FLIGHT_FACTORS = { short:0.26,medium:0.84,long:1.53 };
const PARIS_TARGET = 2.3;
const EARTH_CAPACITY = 4.7;

const DEFAULT_FORM = {
  home:      { electricity_kwh:300,gas_m3:50,renewable_pct:20,num_people:2 },
  transport: { vehicle_type:"gas",km_per_year:15000,short_flights:2,medium_flights:1,long_flights:0,business_pct:0,transit_hrs_wk:3 },
  food:      { diet_type:"omnivore",local_pct:20,waste_pct:20 },
  goods:     { spend_level:"average" },
  offsets:   { offset_tonnes:0 },
};

const CAT_COLORS = { home:"#0ea5e9",transport:"#f97316",food:"#22c55e",goods:"#a855f7",offsets:"#14b8a6" };

const riskColor = (t) => t<=PARIS_TARGET?"#22c55e":t<=EARTH_CAPACITY?"#eab308":t<=10?"#f97316":"#ef4444";

function calcEmissions(f) {
  const ppl     = Math.max(1, f.home.num_people);
  const home    = Math.max(0, ((f.home.electricity_kwh*12*0.0004)*(1-f.home.renewable_pct/100) + f.home.gas_m3*12*0.00202) / ppl);
  const bMult   = 1+(f.transport.business_pct/100)*2;
  const carKm   = f.transport.km_per_year*(VEHICLE_FACTORS[f.transport.vehicle_type]??0.17)/1000;
  const flights = (f.transport.short_flights*FLIGHT_FACTORS.short + f.transport.medium_flights*FLIGHT_FACTORS.medium + f.transport.long_flights*FLIGHT_FACTORS.long)*bMult;
  const transit = f.transport.transit_hrs_wk*52*0.003;
  const transport = Math.max(0, carKm+flights-transit);
  const dietBase = DIET_BASE[f.food.diet_type]??3.0;
  const food   = Math.max(0, dietBase*(1-(f.food.local_pct/100)*0.12-(f.food.waste_pct/100)*0.10));
  const goodsMap = {low:0.6,average:1.5,high:3.0,very_high:5.0};
  const goods  = goodsMap[f.goods.spend_level]??1.5;
  const offsets = Math.min(f.offsets.offset_tonnes, home+transport+food+goods);
  return { home, transport, food, goods, offsets, total:Math.max(0,home+transport+food+goods-offsets) };
}

const SECTIONS = [
  { id:"home",      label:"Home energy",  icon:"🏠" },
  { id:"transport", label:"Transport",    icon:"🚗" },
  { id:"food",      label:"Food & diet",  icon:"🥗" },
  { id:"goods",     label:"Goods",        icon:"🛍" },
  { id:"offsets",   label:"Offsets",      icon:"🌱" },
  { id:"results",   label:"Results",      icon:"📊" },
];

// ── Main component ─────────────────────────────────────────────────────────────
export default function CarbonCalculator({ data, theme }) {
  const c    = theme?.colors ?? {};
  const mono = theme?.typography?.fontFamilyMono ?? "monospace";
  const shape = theme?.shape ?? {};

  // "map" | "charts" | "calculator"
  const [viewMode, setViewMode] = useState("map");

  // CO chart state
  const coCities = [...(data||[])].filter(d=>d.carbon_monoxide!=null)
    .sort((a,b)=>(b.carbon_monoxide??0)-(a.carbon_monoxide??0));
  const barData = coCities.slice(0,30).map(d=>({
    name:d.location, value:+(d.carbon_monoxide??0).toFixed(0),
  }));
  const [trendCity,    setTrendCity]    = useState(null);
  const [trendData,    setTrendData]    = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    if (viewMode==="charts" && coCities.length>0 && !trendCity)
      setTrendCity(coCities[0].location);
  }, [viewMode, coCities.length]);

  useEffect(() => {
    if (!trendCity) return;
    setTrendLoading(true);
    axios.get("/api/trend",{ params:{ city:trendCity, metric:"carbon_monoxide" } })
      .then(r=>setTrendData(r.data)).catch(console.error).finally(()=>setTrendLoading(false));
  }, [trendCity]);

  // Personal footprint calculator state
  const [form,          setForm]          = useState(DEFAULT_FORM);
  const [activeSection, setActiveSection] = useState("home");
  const set = (section,field,value) => setForm(p=>({...p,[section]:{...p[section],[field]:value}}));
  const emissions = calcEmissions(form);
  const breakdownData = [
    {name:"Home",value:+emissions.home.toFixed(2),fill:CAT_COLORS.home},
    {name:"Transport",value:+emissions.transport.toFixed(2),fill:CAT_COLORS.transport},
    {name:"Food",value:+emissions.food.toFixed(2),fill:CAT_COLORS.food},
    {name:"Goods",value:+emissions.goods.toFixed(2),fill:CAT_COLORS.goods},
  ];
  const compareData = [
    {name:"You",value:+emissions.total.toFixed(1),fill:riskColor(emissions.total)},
    {name:"Global avg",value:4.7,fill:"#94a3b8"},
    {name:"Paris 2030",value:2.3,fill:"#22c55e"},
    {name:"US avg",value:16.0,fill:"#f87171"},
  ];
  const totalColor = riskColor(emissions.total);
  const earths = +(emissions.total/EARTH_CAPACITY).toFixed(1);

  // Shared input styles
  const selStyle = {
    padding:"5px 10px", background:c.inputBg??c.surface,
    border:`1px solid ${c.inputBorder??c.border}`,
    borderRadius:4, color:c.text, fontFamily:mono, fontSize:11,
    cursor:"pointer", outline:"none", width:"100%", boxSizing:"border-box",
  };
  const lbl = { fontFamily:mono,fontSize:9,letterSpacing:"0.14em",
    textTransform:"uppercase",color:c.textSubtle,display:"block",marginBottom:4 };
  const rowSt = { marginBottom:13 };

  const Slider = ({ label, section, field, min, max, step=1, unit="" }) => (
    <div style={rowSt}>
      <label style={lbl}>{label}</label>
      <div style={{ display:"flex",alignItems:"center",gap:10 }}>
        <input type="range" min={min} max={max} step={step}
          value={form[section][field]}
          onChange={e=>set(section,field,Number(e.target.value))}
          style={{ flex:1, accentColor:c.accent }}/>
        <span style={{ fontFamily:mono,fontSize:12,fontWeight:700,color:c.accent,minWidth:48,textAlign:"right" }}>
          {form[section][field].toLocaleString()}{unit}
        </span>
      </div>
    </div>
  );

  const PillGroup = ({ label, section, field, options }) => (
    <div style={rowSt}>
      <label style={lbl}>{label}</label>
      <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
        {options.map(o=>{
          const active = form[section][field]===o.value;
          return (
            <button key={o.value} onClick={()=>set(section,field,o.value)} style={{
              padding:"5px 10px",
              border:`1px solid ${active?c.accent:c.border}`,
              borderRadius:4, background:active?c.accentSubtle:c.surface,
              color:active?c.accent:c.textMuted, fontFamily:mono, fontSize:9,
              cursor:"pointer", transition:"all 0.15s",
            }}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );

  const sectionContent = {
    home: (
      <div>
        <Slider label="Monthly electricity (kWh)" section="home" field="electricity_kwh" min={50} max={2000} step={10} unit=" kWh"/>
        <Slider label="Monthly natural gas (m³)"  section="home" field="gas_m3"          min={0}  max={500}  step={5}  unit=" m³"/>
        <Slider label="Renewable energy mix"       section="home" field="renewable_pct"   min={0}  max={100}  step={5}  unit="%"/>
        <Slider label="People in household"        section="home" field="num_people"      min={1}  max={8}    step={1}/>
        <div style={{ fontFamily:mono,fontSize:10,color:c.textSubtle,marginTop:6,
          background:`${c.accent}18`,border:`1px solid ${c.accent}33`,borderRadius:4,padding:"7px 10px" }}>
          Home: <strong style={{color:c.accent}}>{emissions.home.toFixed(2)} t CO₂e/yr</strong>
        </div>
      </div>
    ),
    transport: (
      <div>
        <PillGroup label="Vehicle type" section="transport" field="vehicle_type" options={[
          {value:"none",label:"None"},{value:"ev",label:"EV"},{value:"hybrid",label:"Hybrid"},
          {value:"phev",label:"PHEV"},{value:"gas",label:"Gas"},{value:"diesel",label:"Diesel"},{value:"suv_gas",label:"SUV"},
        ]}/>
        {form.transport.vehicle_type!=="none" && (
          <Slider label="Annual km driven" section="transport" field="km_per_year" min={0} max={80000} step={500} unit=" km"/>
        )}
        <Slider label="Short-haul return flights (< 3h)" section="transport" field="short_flights"  min={0} max={20} step={1}/>
        <Slider label="Medium-haul return flights (3–6h)" section="transport" field="medium_flights" min={0} max={12} step={1}/>
        <Slider label="Long-haul return flights (> 6h)"   section="transport" field="long_flights"   min={0} max={8}  step={1}/>
        <Slider label="Business class (%)"                section="transport" field="business_pct"   min={0} max={100} step={5} unit="%"/>
        <Slider label="Transit use (hrs/week)"            section="transport" field="transit_hrs_wk" min={0} max={40} step={1} unit="h"/>
        <div style={{ fontFamily:mono,fontSize:10,color:c.textSubtle,marginTop:6,
          background:`${CAT_COLORS.transport}18`,border:`1px solid ${CAT_COLORS.transport}33`,borderRadius:4,padding:"7px 10px" }}>
          Transport: <strong style={{color:CAT_COLORS.transport}}>{emissions.transport.toFixed(2)} t CO₂e/yr</strong>
        </div>
      </div>
    ),
    food: (
      <div>
        <PillGroup label="Diet type" section="food" field="diet_type" options={[
          {value:"vegan",label:"Vegan"},{value:"vegetarian",label:"Vegetarian"},
          {value:"pescatarian",label:"Pescatarian"},{value:"flexitarian",label:"Flexitarian"},
          {value:"omnivore",label:"Omnivore"},{value:"high_meat",label:"High meat"},
        ]}/>
        <div style={{ fontFamily:mono,fontSize:9,color:c.textSubtle,marginBottom:10 }}>
          Base: {DIET_BASE[form.food.diet_type]} t CO₂e/yr
        </div>
        <Slider label="Local & seasonal food" section="food" field="local_pct" min={0} max={100} step={5} unit="%"/>
        <Slider label="Food waste"             section="food" field="waste_pct" min={0} max={50}  step={5} unit="%"/>
        <div style={{ fontFamily:mono,fontSize:10,color:c.textSubtle,marginTop:6,
          background:`${CAT_COLORS.food}18`,border:`1px solid ${CAT_COLORS.food}33`,borderRadius:4,padding:"7px 10px" }}>
          Food: <strong style={{color:CAT_COLORS.food}}>{emissions.food.toFixed(2)} t CO₂e/yr</strong>
        </div>
      </div>
    ),
    goods: (
      <div>
        <PillGroup label="Consumption level" section="goods" field="spend_level" options={[
          {value:"low",label:"Minimal"},{value:"average",label:"Average"},
          {value:"high",label:"High"},{value:"very_high",label:"Very high"},
        ]}/>
        <div style={{ fontFamily:mono,fontSize:9,color:c.textSubtle,marginBottom:10 }}>
          {{"low":"Secondhand focus, few new purchases","average":"Typical consumer",
            "high":"Frequent new purchases","very_high":"High-end, frequent upgrades"}[form.goods.spend_level]}
        </div>
        <div style={{ fontFamily:mono,fontSize:10,color:c.textSubtle,marginTop:6,
          background:`${CAT_COLORS.goods}18`,border:`1px solid ${CAT_COLORS.goods}33`,borderRadius:4,padding:"7px 10px" }}>
          Goods: <strong style={{color:CAT_COLORS.goods}}>{emissions.goods.toFixed(2)} t CO₂e/yr</strong>
        </div>
      </div>
    ),
    offsets: (
      <div>
        <Slider label="Carbon offsets purchased (t CO₂e/yr)" section="offsets" field="offset_tonnes" min={0} max={20} step={0.5} unit=" t"/>
        <div style={{ fontFamily:mono,fontSize:9,color:c.textSubtle,marginBottom:10 }}>
          1 tonne ≈ £12–40 via Gold Standard/VCS schemes
        </div>
        <div style={{ fontFamily:mono,fontSize:10,color:c.textSubtle,marginTop:6,
          background:`${c.accent}18`,border:`1px solid ${c.accent}33`,borderRadius:4,padding:"7px 10px" }}>
          Net total: <strong style={{color:c.accent}}>{emissions.total.toFixed(2)} t CO₂e/yr</strong>
        </div>
      </div>
    ),
    results: (
      <div>
        <div style={{ background:`${totalColor}15`,border:`2px solid ${totalColor}55`,
          borderRadius:8,padding:"14px 16px",marginBottom:14,textAlign:"center" }}>
          <div style={{ fontFamily:mono,fontSize:8,letterSpacing:"0.14em",
            color:totalColor,textTransform:"uppercase",marginBottom:4 }}>Annual footprint</div>
          <div style={{ fontFamily:mono,fontSize:36,fontWeight:700,color:totalColor,lineHeight:1 }}>
            {emissions.total.toFixed(1)}
          </div>
          <div style={{ fontFamily:mono,fontSize:12,color:totalColor,marginTop:3 }}>tonnes CO₂e / year</div>
          <div style={{ fontFamily:mono,fontSize:10,color:c.textMuted,marginTop:8 }}>
            {emissions.total<=PARIS_TARGET?"Below Paris 2030 target — well done!"
              :`${earths}× the sustainable per-person planetary budget`}
          </div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14 }}>
          {[
            {label:"Earths needed",value:`${earths}×`,sub:"if everyone like you"},
            {label:"vs global avg", value:`${emissions.total<4.7?"-":"+"}${Math.abs(emissions.total-4.7).toFixed(1)}t`,sub:"avg: 4.7 t"},
            {label:"vs Paris 2030", value:`${emissions.total<2.3?"-":"+"}${Math.abs(emissions.total-2.3).toFixed(1)}t`,sub:"target: 2.3 t"},
          ].map(({label,value,sub})=>(
            <div key={label} style={{ background:c.surface,border:`1px solid ${c.border}`,
              borderRadius:6,padding:"8px 10px",textAlign:"center" }}>
              <div style={{ fontFamily:mono,fontSize:8,color:c.textSubtle,
                letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:2 }}>{label}</div>
              <div style={{ fontFamily:mono,fontSize:18,fontWeight:700,color:c.text }}>{value}</div>
              <div style={{ fontFamily:mono,fontSize:8,color:c.textSubtle,marginTop:1 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ height:130,marginBottom:12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={breakdownData} layout="vertical" margin={{top:0,right:50,left:75,bottom:0}}>
              <XAxis type="number" tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                axisLine={{stroke:c.border}} tickLine={false} tickFormatter={v=>`${v}t`}/>
              <YAxis type="category" dataKey="name" width={75} axisLine={false} tickLine={false}
                tick={({x,y,payload})=>(
                  <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                    fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                )}/>
              <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,
                borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                formatter={v=>[`${v} t CO₂e`]}/>
              <Bar dataKey="value" radius={[0,3,3,0]}>
                {breakdownData.map((d,i)=><Cell key={i} fill={d.fill} opacity={0.85}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ height:100 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareData} layout="vertical" margin={{top:0,right:50,left:80,bottom:0}}>
              <XAxis type="number" tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                axisLine={{stroke:c.border}} tickLine={false} tickFormatter={v=>`${v}t`}/>
              <YAxis type="category" dataKey="name" width={80} axisLine={false} tickLine={false}
                tick={({x,y,payload})=>(
                  <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                    fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                )}/>
              <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,
                borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                formatter={v=>[`${v} t CO₂e`]}/>
              <Bar dataKey="value" radius={[0,3,3,0]}>
                {compareData.map((d,i)=><Cell key={i} fill={d.fill} opacity={0.85}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    ),
  };

  const Tab = ({ id, label }) => {
    const active = viewMode === id;
    return (
      <button onClick={()=>setViewMode(id)} style={{
        padding:"0 18px", height:"100%", background:"transparent", border:"none",
        borderBottom:`2px solid ${active?c.accent:"transparent"}`,
        color:active?c.accent:c.textMuted, fontFamily:mono, fontSize:10,
        letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer",
        pointerEvents:"auto",
      }}>{label}</button>
    );
  };

  return (
    /* Root: pointer-events:none — map is fully interactive in map mode */
    <div style={{
      position:"absolute", inset:0, display:"flex", flexDirection:"column",
      background: viewMode==="charts" ? c.bg : "transparent",
      pointerEvents:"none",
    }}>

      {/* ── Nav bar — always interactive ── */}
      <div style={{ height:40, display:"flex", alignItems:"stretch",
        background:c.panel, borderBottom:`1px solid ${c.border}`,
        flexShrink:0, pointerEvents:"auto" }}>
        <Tab id="map"        label="Map"         />
        <Tab id="charts"     label="Charts"      />
        <Tab id="calculator" label="Calculator"  />
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center",
          gap:10, padding:"0 16px", fontFamily:mono, fontSize:9, color:c.textSubtle,
          borderLeft:`1px solid ${c.border}` }}>
          {coCities.length} cities with CO data
        </div>
      </div>

      {/* ── Charts view ── */}
      {viewMode === "charts" && (
        <div style={{ flex:1, background:c.bg, display:"flex",
          overflow:"hidden", pointerEvents:"auto" }}>
          {/* Ranking */}
          <div style={{ flex:1, display:"flex", flexDirection:"column",
            borderRight:`1px solid ${c.border}` }}>
            <div style={{ padding:"12px 16px 6px", fontFamily:mono, fontSize:9,
              letterSpacing:"0.15em", color:c.textSubtle, textTransform:"uppercase" }}>
              Top 30 cities by Carbon Monoxide
            </div>
            <div style={{ padding:"0 4px 4px 8px", fontFamily:mono, fontSize:8,
              color:c.textSubtle }}>μg/m³ · WHO 24hr limit 4,000</div>
            <div style={{ flex:1, padding:"0 12px 12px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical"
                  margin={{top:0,right:60,left:120,bottom:0}}>
                  <XAxis type="number" tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                    axisLine={{stroke:c.border}} tickLine={false}
                    tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
                  <YAxis type="category" dataKey="name" width={120}
                    axisLine={false} tickLine={false} interval={0}
                    tick={({x,y,payload})=>(
                      <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                        fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                    )}/>
                  <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,
                    borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                    labelStyle={{color:c.text,fontWeight:700}} itemStyle={{color:c.text}}
                    formatter={v=>[`${v.toLocaleString()} μg/m³`,"CO"]}/>
                  <Bar dataKey="value" radius={[0,3,3,0]}
                    onClick={e=>setTrendCity(e.name)}>
                    {barData.map((d,i)=>(
                      <Cell key={i} fill={coColorFor(d.value)} opacity={0.85}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Trend */}
          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"10px 16px 6px",
              display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
              <span style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.12em",
                color:c.textSubtle, textTransform:"uppercase" }}>Trend</span>
              <select value={trendCity??""} onChange={e=>setTrendCity(e.target.value)}
                style={{...selStyle, width:"auto", minWidth:160}}>
                {coCities.slice(0,60).map(d=>(
                  <option key={d.location} value={d.location}>{d.location}</option>
                ))}
              </select>
            </div>
            <div style={{ flex:1, padding:"4px 16px 12px 4px" }}>
              {trendLoading ? (
                <div style={{ height:"100%", display:"flex", alignItems:"center",
                  justifyContent:"center", fontFamily:mono, fontSize:11,
                  color:c.textMuted }}>Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{top:8,right:16,left:4,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.border} opacity={0.4}/>
                    <XAxis dataKey="date" tickFormatter={d=>d?.slice(0,7)}
                      tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                      axisLine={{stroke:c.border}} tickLine={false} interval={45}/>
                    <YAxis tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                      axisLine={false} tickLine={false} width={40} domain={[0,"auto"]}
                      tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
                    <Tooltip contentStyle={{background:c.surface,border:`1px solid ${c.border}`,
                      borderRadius:6,fontFamily:mono,fontSize:11}}
                      labelStyle={{color:c.textMuted}}
                      formatter={v=>[typeof v==="number"?`${v.toFixed(0)} μg/m³`:v,"CO"]}
                      labelFormatter={d=>d?.slice(0,10)??""}/>
                    <Line type="monotone" dataKey="carbon_monoxide"
                      stroke={c.accent} strokeWidth={1.5} dot={false} activeDot={{r:3}}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Map mode — transparent (map shows through) ── */}
      {viewMode === "map" && (
        <div style={{ flex:1, background:"transparent", pointerEvents:"none" }}/>
      )}

      {/* ── Calculator modal — centered, like Settings ── */}
      {viewMode === "calculator" && (
        <>
          {/* Backdrop */}
          <div onClick={()=>setViewMode("map")} style={{
            position:"absolute", inset:0, zIndex:60,
            background:"rgba(0,0,0,0.45)", backdropFilter:"blur(3px)",
            pointerEvents:"auto",
          }}/>
          {/* Modal */}
          <div onClick={e=>e.stopPropagation()} style={{
            position:"absolute", zIndex:61,
            top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            width:"min(820px,96vw)", maxHeight:"88vh",
            background:c.panel, border:`1px solid ${c.border}`,
            borderRadius:shape.modalRadius??12,
            boxShadow:"0 24px 64px rgba(0,0,0,0.6)",
            display:"flex", flexDirection:"column", overflow:"hidden",
            pointerEvents:"auto",
          }}>
            {/* Modal header */}
            <div style={{ padding:"13px 20px", borderBottom:`1px solid ${c.border}`,
              display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
              <span style={{ fontFamily:mono, fontSize:12, fontWeight:700, color:c.accent }}>
                🌍 Personal Carbon Footprint Calculator
              </span>
              <button onClick={()=>setViewMode("map")} style={{
                marginLeft:"auto", background:"none", border:"none",
                color:c.textMuted, fontSize:20, cursor:"pointer", lineHeight:1 }}>×</button>
            </div>

            {/* Modal body: left nav + right content */}
            <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

              {/* Section nav */}
              <div style={{ width:160, flexShrink:0, background:c.surface,
                borderRight:`1px solid ${c.border}`,
                display:"flex", flexDirection:"column", padding:"12px 0",
                overflowY:"auto" }}>
                {SECTIONS.map(s=>{
                  const active = activeSection===s.id;
                  const catEmit = ["home","transport","food","goods"].includes(s.id)
                    ? emissions[s.id] : null;
                  return (
                    <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{
                      display:"flex", alignItems:"center", gap:8, padding:"8px 14px",
                      background:active?c.accentSubtle:"transparent", border:"none",
                      borderLeft:`2px solid ${active?c.accent:"transparent"}`,
                      cursor:"pointer", textAlign:"left", width:"100%",
                    }}>
                      <span style={{ fontSize:14 }}>{s.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:mono, fontSize:9,
                          color:active?c.accent:c.textMuted,
                          letterSpacing:"0.06em" }}>{s.label}</div>
                        {catEmit!==null && (
                          <div style={{ fontFamily:mono, fontSize:8,
                            color:CAT_COLORS[s.id]??c.textSubtle }}>
                            {catEmit.toFixed(1)} t
                          </div>
                        )}
                        {s.id==="results" && (
                          <div style={{ fontFamily:mono, fontSize:8,
                            color:totalColor, fontWeight:700 }}>
                            {emissions.total.toFixed(1)} t total
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
                <div style={{ marginTop:"auto", padding:"10px 12px",
                  borderTop:`1px solid ${c.border}` }}>
                  <button onClick={()=>setForm(DEFAULT_FORM)} style={{
                    width:"100%", padding:"5px 0",
                    background:c.surface, border:`1px solid ${c.border}`,
                    borderRadius:4, color:c.textMuted, fontFamily:mono,
                    fontSize:8, letterSpacing:"0.1em", textTransform:"uppercase",
                    cursor:"pointer" }}>↺ Reset</button>
                </div>
              </div>

              {/* Section content */}
              <div style={{ flex:1, overflow:"auto", padding:"18px 20px" }}>
                {/* Section header */}
                <div style={{ fontFamily:mono, fontSize:12, fontWeight:700,
                  color:c.text, marginBottom:14 }}>
                  {SECTIONS.find(s=>s.id===activeSection)?.icon}{" "}
                  {SECTIONS.find(s=>s.id===activeSection)?.label}
                </div>
                {/* Progress bar */}
                <div style={{ height:2, background:c.border, borderRadius:1, marginBottom:18 }}>
                  <div style={{ height:"100%", borderRadius:1, background:c.accent,
                    width:`${(SECTIONS.findIndex(s=>s.id===activeSection)+1)/SECTIONS.length*100}%`,
                    transition:"width 0.3s" }}/>
                </div>
                {sectionContent[activeSection]}
                {/* Next/Back */}
                {activeSection !== "results" && (
                  <div style={{ display:"flex", justifyContent:"space-between",
                    marginTop:20, paddingTop:14, borderTop:`1px solid ${c.border}` }}>
                    {SECTIONS.findIndex(s=>s.id===activeSection)>0 ? (
                      <button onClick={()=>{
                        const idx=SECTIONS.findIndex(s=>s.id===activeSection);
                        setActiveSection(SECTIONS[idx-1].id);
                      }} style={{
                        padding:"6px 16px", background:c.surface,
                        border:`1px solid ${c.border}`, borderRadius:4,
                        color:c.textMuted, fontFamily:mono, fontSize:9,
                        letterSpacing:"0.1em", cursor:"pointer" }}>← Back</button>
                    ) : <div/>}
                    <button onClick={()=>{
                      const idx=SECTIONS.findIndex(s=>s.id===activeSection);
                      setActiveSection(SECTIONS[idx+1].id);
                    }} style={{
                      padding:"6px 16px", background:c.accent,
                      border:`1px solid ${c.accent}`, borderRadius:4,
                      color:"#fff", fontFamily:mono, fontSize:9,
                      letterSpacing:"0.1em", cursor:"pointer" }}>
                      {SECTIONS.findIndex(s=>s.id===activeSection)===SECTIONS.length-2
                        ?"See results →":"Next →"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
