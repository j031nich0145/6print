import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PieChart, Pie,
} from "recharts";

// ── Emission factors ───────────────────────────────────────────────────────────
const VEHICLE_FACTORS = {
  none:    0,
  ev:      0.05,
  hybrid:  0.10,
  phev:    0.07,
  gas:     0.17,
  diesel:  0.15,
  suv_gas: 0.22,
};

const DIET_BASE = {
  vegan:        1.5,
  vegetarian:   1.7,
  pescatarian:  2.0,
  flexitarian:  2.5,
  omnivore:     3.0,
  high_meat:    3.7,
};

const FLIGHT_FACTORS = {
  short:  0.26,  // < 3h return
  medium: 0.84,  // 3–6h return
  long:   1.53,  // > 6h return
};

const COUNTRY_AVGS = {
  "Global average": 4.7,
  "United States": 16.0,
  "Canada": 15.0,
  "Australia": 14.0,
  "UAE": 22.0,
  "Germany": 9.0,
  "United Kingdom": 7.0,
  "France": 7.5,
  "Brazil": 5.0,
  "China": 7.7,
  "India": 2.1,
  "Japan": 9.0,
};

const PARIS_TARGET = 2.3;
const EARTH_CAPACITY = 4.7; // tonnes CO2e that one "Earth" supports per person

// ── Color helpers ──────────────────────────────────────────────────────────────
const CAT_COLORS = {
  home:      "#0ea5e9",
  transport: "#f97316",
  food:      "#22c55e",
  goods:     "#a855f7",
  offsets:   "#14b8a6",
};

const riskColor = (tonnes) => {
  if (tonnes <= PARIS_TARGET) return "#22c55e";
  if (tonnes <= EARTH_CAPACITY) return "#eab308";
  if (tonnes <= 10) return "#f97316";
  return "#ef4444";
};

// ── Default form state ─────────────────────────────────────────────────────────
const DEFAULT = {
  home: {
    electricity_kwh: 300,
    gas_m3: 50,
    renewable_pct: 20,
    home_size: "medium",
    num_people: 2,
  },
  transport: {
    vehicle_type: "gas",
    km_per_year: 15000,
    short_flights: 2,
    medium_flights: 1,
    long_flights: 0,
    business_pct: 0,
    transit_hrs_wk: 3,
  },
  food: {
    diet_type: "omnivore",
    local_pct: 20,
    waste_pct: 20,
  },
  goods: {
    spend_level: "average",
  },
  offsets: {
    offset_tonnes: 0,
  },
};

// ── Calculations ───────────────────────────────────────────────────────────────
function calcEmissions(f) {
  const people = Math.max(1, f.home.num_people);

  const elecRaw = (f.home.electricity_kwh * 12 * 0.0004);
  const elecNet = elecRaw * (1 - f.home.renewable_pct / 100);
  const gasEmit = f.home.gas_m3 * 12 * 0.00202;
  const home = Math.max(0, (elecNet + gasEmit) / people);

  const carKm   = f.transport.km_per_year * (VEHICLE_FACTORS[f.transport.vehicle_type] ?? 0.17) / 1000;
  const bMult   = 1 + (f.transport.business_pct / 100) * 2;
  const flightsT = (
    f.transport.short_flights  * FLIGHT_FACTORS.short  * bMult +
    f.transport.medium_flights * FLIGHT_FACTORS.medium * bMult +
    f.transport.long_flights   * FLIGHT_FACTORS.long   * bMult
  );
  const transitSaving = f.transport.transit_hrs_wk * 52 * 0.003;
  const transport = Math.max(0, carKm + flightsT - transitSaving);

  const dietBase = DIET_BASE[f.food.diet_type] ?? 3.0;
  const localSaving  = dietBase * (f.food.local_pct / 100) * 0.12;
  const wasteSaving  = dietBase * (f.food.waste_pct / 100) * 0.10;
  const food = Math.max(0, dietBase - localSaving - wasteSaving);

  const goodsMap = { low: 0.6, average: 1.5, high: 3.0, very_high: 5.0 };
  const goods = goodsMap[f.goods.spend_level] ?? 1.5;

  const offsets = Math.min(f.offsets.offset_tonnes, home + transport + food + goods);

  const total = Math.max(0, home + transport + food + goods - offsets);

  return { home, transport, food, goods, offsets, total };
}

// ── Section nav ───────────────────────────────────────────────────────────────
const SECTIONS = [
  { id:"home",      label:"Home energy",  icon:"ti-home"          },
  { id:"transport", label:"Transport",    icon:"ti-car"           },
  { id:"food",      label:"Food & diet",  icon:"ti-salad"         },
  { id:"goods",     label:"Goods",        icon:"ti-shopping-cart" },
  { id:"offsets",   label:"Offsets",      icon:"ti-trees"         },
  { id:"results",   label:"Your results", icon:"ti-chart-pie"     },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function CarbonCalculator({ theme }) {
  const c    = theme?.colors ?? {};
  const mono = theme?.typography?.fontFamilyMono ?? "monospace";

  const [activeSection, setActiveSection] = useState("home");
  const [form, setForm] = useState(DEFAULT);

  const set = (section, field, value) =>
    setForm(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));

  const emissions = useMemo(() => calcEmissions(form), [form]);

  const breakdownData = [
    { name:"Home",      value:+emissions.home.toFixed(2),      fill:CAT_COLORS.home      },
    { name:"Transport", value:+emissions.transport.toFixed(2), fill:CAT_COLORS.transport },
    { name:"Food",      value:+emissions.food.toFixed(2),      fill:CAT_COLORS.food      },
    { name:"Goods",     value:+emissions.goods.toFixed(2),     fill:CAT_COLORS.goods     },
  ];

  const compareData = [
    { name:"You",          value:+emissions.total.toFixed(1), fill:riskColor(emissions.total) },
    { name:"Global avg",   value:4.7,  fill:"#94a3b8" },
    { name:"Paris 2030",   value:2.3,  fill:"#22c55e" },
    { name:"US avg",       value:16.0, fill:"#f87171" },
  ];

  const totalColor = riskColor(emissions.total);
  const earths     = +(emissions.total / EARTH_CAPACITY).toFixed(1);

  // Shared input styles using theme
  const inp = {
    padding:"6px 10px", background:c.inputBg??c.surface,
    border:`1px solid ${c.border}`, borderRadius:4,
    color:c.text, fontFamily:mono, fontSize:11, outline:"none",
    width:"100%", boxSizing:"border-box",
  };
  const lbl = {
    fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
    textTransform:"uppercase", color:c.textSubtle, display:"block", marginBottom:4,
  };
  const row = { marginBottom:14 };

  const Slider = ({ label, section, field, min, max, step=1, unit="" }) => (
    <div style={row}>
      <label style={lbl}>{label}</label>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <input type="range" min={min} max={max} step={step}
          value={form[section][field]}
          onChange={e => set(section, field, Number(e.target.value))}
          style={{ flex:1, accentColor:c.accent }}/>
        <span style={{ fontFamily:mono, fontSize:12, fontWeight:700, color:c.accent, minWidth:48, textAlign:"right" }}>
          {form[section][field].toLocaleString()}{unit}
        </span>
      </div>
    </div>
  );

  const Select = ({ label, section, field, options }) => (
    <div style={row}>
      <label style={lbl}>{label}</label>
      <select value={form[section][field]}
        onChange={e => set(section, field, e.target.value)}
        style={inp}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const PillGroup = ({ label, section, field, options }) => (
    <div style={row}>
      <label style={lbl}>{label}</label>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {options.map(o=>{
          const active = form[section][field] === o.value;
          return (
            <button key={o.value}
              onClick={()=>set(section, field, o.value)}
              style={{
                padding:"5px 12px", border:`1px solid ${active?c.accent:c.border}`,
                borderRadius:4, background:active?c.accentSubtle:c.surface,
                color:active?c.accent:c.textMuted, fontFamily:mono, fontSize:9,
                cursor:"pointer", letterSpacing:"0.06em", transition:"all 0.15s",
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Section content ─────────────────────────────────────────────────────────
  const sectionContent = {
    home: (
      <div>
        <div style={{ fontFamily:mono, fontSize:11, color:c.textMuted, marginBottom:18, lineHeight:1.7 }}>
          Home energy is typically 20–40% of a household footprint. Renewable energy and efficiency make the biggest difference.
        </div>
        <Slider label="Monthly electricity (kWh)" section="home" field="electricity_kwh" min={50} max={2000} step={10} unit=" kWh"/>
        <Slider label="Monthly natural gas (m³)"  section="home" field="gas_m3"          min={0} max={500} step={5}  unit=" m³"/>
        <Slider label="Renewable energy mix"       section="home" field="renewable_pct"   min={0} max={100} step={5}  unit="%"/>
        <Slider label="People in household"        section="home" field="num_people"      min={1} max={8}   step={1}/>
        <PillGroup label="Home size" section="home" field="home_size" options={[
          {value:"apartment",label:"Apartment"},{value:"small",label:"Small house"},
          {value:"medium",label:"Med. house"},{value:"large",label:"Large house"},
        ]}/>
        <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle, marginTop:8,
          background:`${c.accent}18`, border:`1px solid ${c.accent}33`, borderRadius:4, padding:"8px 10px" }}>
          Estimated home emissions: <strong style={{color:c.accent}}>{emissions.home.toFixed(2)} t CO₂e / year</strong> (your share)
        </div>
      </div>
    ),
    transport: (
      <div>
        <div style={{ fontFamily:mono, fontSize:11, color:c.textMuted, marginBottom:18, lineHeight:1.7 }}>
          Transport is often the single largest category. Flights carry a heavy per-trip cost.
        </div>
        <PillGroup label="Primary vehicle" section="transport" field="vehicle_type" options={[
          {value:"none",label:"None"},{value:"ev",label:"EV"},{value:"hybrid",label:"Hybrid"},
          {value:"phev",label:"PHEV"},{value:"gas",label:"Gas"},{value:"diesel",label:"Diesel"},{value:"suv_gas",label:"SUV"},
        ]}/>
        {form.transport.vehicle_type !== "none" && (
          <Slider label="Annual km driven" section="transport" field="km_per_year" min={0} max={80000} step={500} unit=" km"/>
        )}
        <Slider label="Short-haul return flights / year (< 3h)" section="transport" field="short_flights"  min={0} max={20} step={1}/>
        <Slider label="Medium-haul return flights (3–6h)"        section="transport" field="medium_flights" min={0} max={12} step={1}/>
        <Slider label="Long-haul return flights (> 6h)"           section="transport" field="long_flights"  min={0} max={8}  step={1}/>
        <Slider label="Business class flights (%)"                section="transport" field="business_pct"  min={0} max={100} step={5} unit="%"/>
        <Slider label="Public transit use (hrs/week)"             section="transport" field="transit_hrs_wk" min={0} max={40} step={1} unit="h"/>
        <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle, marginTop:8,
          background:`${CAT_COLORS.transport}18`, border:`1px solid ${CAT_COLORS.transport}44`, borderRadius:4, padding:"8px 10px" }}>
          Estimated transport: <strong style={{color:CAT_COLORS.transport}}>{emissions.transport.toFixed(2)} t CO₂e / year</strong>
        </div>
      </div>
    ),
    food: (
      <div>
        <div style={{ fontFamily:mono, fontSize:11, color:c.textMuted, marginBottom:18, lineHeight:1.7 }}>
          Diet is surprisingly impactful. Meat, especially beef, has the highest emission intensity of any food.
        </div>
        <PillGroup label="Diet type" section="food" field="diet_type" options={[
          {value:"vegan",label:"Vegan"},{value:"vegetarian",label:"Vegetarian"},
          {value:"pescatarian",label:"Pescatarian"},{value:"flexitarian",label:"Flexitarian"},
          {value:"omnivore",label:"Omnivore"},{value:"high_meat",label:"High meat"},
        ]}/>
        <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginBottom:14 }}>
          Base footprint: {DIET_BASE[form.food.diet_type]} t CO₂e / year
        </div>
        <Slider label="Local & seasonal food" section="food" field="local_pct" min={0} max={100} step={5} unit="%"/>
        <Slider label="Food waste"             section="food" field="waste_pct" min={0} max={50}  step={5} unit="%"/>
        <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginBottom:14 }}>
          Local food saves ~12%, reducing waste saves ~10% of diet base
        </div>
        <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle, marginTop:8,
          background:`${CAT_COLORS.food}18`, border:`1px solid ${CAT_COLORS.food}44`, borderRadius:4, padding:"8px 10px" }}>
          Estimated food: <strong style={{color:CAT_COLORS.food}}>{emissions.food.toFixed(2)} t CO₂e / year</strong>
        </div>
      </div>
    ),
    goods: (
      <div>
        <div style={{ fontFamily:mono, fontSize:11, color:c.textMuted, marginBottom:18, lineHeight:1.7 }}>
          Consumer goods cover clothing, electronics, furniture, and services. Buying less and choosing secondhand makes a meaningful difference.
        </div>
        <PillGroup label="Overall consumption level" section="goods" field="spend_level" options={[
          {value:"low",label:"Minimal"},{value:"average",label:"Average"},
          {value:"high",label:"High"},{value:"very_high",label:"Very high"},
        ]}/>
        <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginBottom:14 }}>
          {{"low":"Secondhand/repair focus, few new items","average":"Typical consumer — occasional new electronics, seasonal clothing",
            "high":"Frequent new purchases, regular upgrades","very_high":"High-end goods, frequent replacements"}[form.goods.spend_level]}
        </div>
        <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle, marginTop:8,
          background:`${CAT_COLORS.goods}18`, border:`1px solid ${CAT_COLORS.goods}44`, borderRadius:4, padding:"8px 10px" }}>
          Estimated goods: <strong style={{color:CAT_COLORS.goods}}>{emissions.goods.toFixed(2)} t CO₂e / year</strong>
        </div>
      </div>
    ),
    offsets: (
      <div>
        <div style={{ fontFamily:mono, fontSize:11, color:c.textMuted, marginBottom:18, lineHeight:1.7 }}>
          Carbon offsets fund projects that reduce or remove CO₂ — reforestation, clean energy, methane capture. They reduce your net footprint but don't replace reducing emissions at source.
        </div>
        <Slider label="Carbon offsets purchased (t CO₂e / year)" section="offsets" field="offset_tonnes" min={0} max={20} step={0.5} unit=" t"/>
        <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle, marginBottom:14 }}>
          1 tonne ≈ £12–40 through verified schemes (Gold Standard, VCS). One mature tree sequesters ~0.02 t/year — you'd need 50 trees per tonne.
        </div>
        <div style={{ fontFamily:mono, fontSize:10, color:c.textSubtle, marginTop:8,
          background:`${CAT_COLORS.offsets}18`, border:`1px solid ${CAT_COLORS.offsets}44`, borderRadius:4, padding:"8px 10px" }}>
          Net footprint after offsets: <strong style={{color:c.accent}}>{emissions.total.toFixed(2)} t CO₂e / year</strong>
        </div>
      </div>
    ),
    results: (
      <div>
        {/* Total hero card */}
        <div style={{ background:`${totalColor}15`, border:`2px solid ${totalColor}55`,
          borderRadius:8, padding:"18px 20px", marginBottom:18, textAlign:"center" }}>
          <div style={{ fontFamily:mono, fontSize:10, letterSpacing:"0.14em",
            color:totalColor, textTransform:"uppercase", marginBottom:6 }}>
            Your estimated annual footprint
          </div>
          <div style={{ fontFamily:mono, fontSize:40, fontWeight:700, color:totalColor, lineHeight:1 }}>
            {emissions.total.toFixed(1)}
          </div>
          <div style={{ fontFamily:mono, fontSize:14, color:totalColor, marginTop:4 }}>
            tonnes CO₂e / year
          </div>
          <div style={{ fontFamily:mono, fontSize:11, color:c.textMuted, marginTop:10 }}>
            {emissions.total <= PARIS_TARGET
              ? "Below the 2030 Paris Agreement target — well done!"
              : emissions.total <= EARTH_CAPACITY
              ? `${((emissions.total/PARIS_TARGET)*100-100).toFixed(0)}% above the Paris 2030 target of 2.3 t`
              : `${earths}× the sustainable per-person planetary budget`}
          </div>
        </div>

        {/* Metric row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:18 }}>
          {[
            { label:"Earths needed",   value:`${earths}×`,                          sub:"if everyone lived like you" },
            { label:"vs. global avg",  value:`${emissions.total < 4.7 ? "-" : "+"}${Math.abs(emissions.total-4.7).toFixed(1)}t`, sub:"global average: 4.7 t" },
            { label:"vs. Paris 2030",  value:`${emissions.total < 2.3 ? "-" : "+"}${Math.abs(emissions.total-2.3).toFixed(1)}t`, sub:"target: 2.3 t / person" },
          ].map(({label,value,sub})=>(
            <div key={label} style={{ background:c.surface, border:`1px solid ${c.border}`,
              borderRadius:6, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontFamily:mono, fontSize:8, color:c.textSubtle,
                letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
              <div style={{ fontFamily:mono, fontSize:20, fontWeight:700, color:c.text }}>{value}</div>
              <div style={{ fontFamily:mono, fontSize:8, color:c.textSubtle, marginTop:2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Breakdown bar chart */}
        <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
          color:c.textSubtle, textTransform:"uppercase", marginBottom:8 }}>
          Breakdown by category
        </div>
        <div style={{ height:160, marginBottom:18 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={breakdownData} layout="vertical" margin={{top:0,right:60,left:80,bottom:0}}>
              <XAxis type="number" tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                axisLine={{stroke:c.border}} tickLine={false}
                tickFormatter={v=>`${v}t`}/>
              <YAxis type="category" dataKey="name" width={80} axisLine={false} tickLine={false}
                tick={({x,y,payload})=>(
                  <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                    fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                )}/>
              <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,
                borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                labelStyle={{color:c.text,fontWeight:700}} itemStyle={{color:c.text}}
                formatter={v=>[`${v} t CO₂e`,"Emissions"]}/>
              <Bar dataKey="value" radius={[0,3,3,0]}>
                {breakdownData.map((d,i)=><Cell key={i} fill={d.fill} opacity={0.85}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Comparison chart */}
        <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
          color:c.textSubtle, textTransform:"uppercase", marginBottom:8 }}>
          How you compare
        </div>
        <div style={{ height:130, marginBottom:18 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareData} layout="vertical" margin={{top:0,right:60,left:90,bottom:0}}>
              <XAxis type="number" tick={{fill:c.textSubtle,fontSize:9,fontFamily:mono}}
                axisLine={{stroke:c.border}} tickLine={false} tickFormatter={v=>`${v}t`}/>
              <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false}
                tick={({x,y,payload})=>(
                  <text x={x-6} y={y} textAnchor="end" dominantBaseline="central"
                    fill={c.textMuted} fontSize={10} fontFamily={mono}>{payload.value}</text>
                )}/>
              <Tooltip contentStyle={{background:c.panel,border:`1px solid ${c.border}`,
                borderRadius:6,fontFamily:mono,fontSize:11,color:c.text}}
                labelStyle={{color:c.text,fontWeight:700}} itemStyle={{color:c.text}}
                formatter={v=>[`${v} t CO₂e`]}/>
              <Bar dataKey="value" radius={[0,3,3,0]}>
                {compareData.map((d,i)=><Cell key={i} fill={d.fill} opacity={0.85}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top reduction actions */}
        <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.14em",
          color:c.textSubtle, textTransform:"uppercase", marginBottom:8 }}>
          Top reduction opportunities
        </div>
        {[
          emissions.transport > 3 && { cat:"transport", msg:"Switch from gas car to EV or reduce annual km — could save 1–3 t" },
          form.transport.long_flights > 1 && { cat:"transport", msg:`Replace 1 long-haul flight with video/train — saves ~${FLIGHT_FACTORS.long.toFixed(1)} t` },
          form.food.diet_type === "high_meat" && { cat:"food", msg:"Going flexitarian (meat 2×/week) saves ~1.2 t vs. high-meat diet" },
          form.food.diet_type === "omnivore" && { cat:"food", msg:"Cutting red meat by half saves ~0.5 t vs. standard omnivore" },
          form.home.renewable_pct < 30 && { cat:"home", msg:"Switching to 100% renewable electricity could save up to 1 t/year" },
          form.goods.spend_level === "very_high" && { cat:"goods", msg:"Extending electronics life by 2 years saves ~0.4 t per device" },
        ].filter(Boolean).slice(0,4).map((tip,i)=>(
          <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
            padding:"8px 10px", borderRadius:4, marginBottom:6,
            background:`${CAT_COLORS[tip.cat]}15`, border:`1px solid ${CAT_COLORS[tip.cat]}33` }}>
            <div style={{ width:8, height:8, borderRadius:"50%",
              background:CAT_COLORS[tip.cat], flexShrink:0, marginTop:2 }}/>
            <div style={{ fontFamily:mono, fontSize:10, color:c.textMuted, lineHeight:1.6 }}>
              {tip.msg}
            </div>
          </div>
        ))}
      </div>
    ),
  };

  // ── Layout ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"absolute", inset:0, display:"flex",
      background:c.bg, overflow:"hidden" }}>

      {/* Left nav */}
      <div style={{ width:190, flexShrink:0, background:c.panel,
        borderRight:`1px solid ${c.border}`, display:"flex",
        flexDirection:"column", padding:"16px 0" }}>
        <div style={{ fontFamily:mono, fontSize:9, letterSpacing:"0.2em",
          color:c.accent, textTransform:"uppercase", padding:"0 16px 14px",
          borderBottom:`1px solid ${c.border}`, marginBottom:8 }}>
          Carbon Calculator
        </div>
        {SECTIONS.map(s=>{
          const active = activeSection === s.id;
          const catEmit = s.id !== "offsets" && s.id !== "results"
            ? emissions[s.id] : null;
          return (
            <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{
              display:"flex", alignItems:"center", gap:10, padding:"9px 16px",
              background:active?c.accentSubtle:"transparent", border:"none",
              borderLeft:`3px solid ${active?c.accent:"transparent"}`,
              cursor:"pointer", textAlign:"left", width:"100%",
              transition:"all 0.15s",
            }}>
              <i className={`ti ${s.icon}`} style={{
                fontSize:16, color:active?c.accent:c.textMuted, flexShrink:0 }}
                aria-hidden="true"/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:mono, fontSize:10,
                  color:active?c.accent:c.textMuted,
                  letterSpacing:"0.06em" }}>
                  {s.label}
                </div>
                {catEmit !== null && (
                  <div style={{ fontFamily:mono, fontSize:9,
                    color:CAT_COLORS[s.id]??c.textSubtle }}>
                    {catEmit.toFixed(1)} t
                  </div>
                )}
                {s.id === "results" && (
                  <div style={{ fontFamily:mono, fontSize:9, color:totalColor, fontWeight:700 }}>
                    {emissions.total.toFixed(1)} t total
                  </div>
                )}
              </div>
            </button>
          );
        })}

        {/* Nav footer */}
        <div style={{ marginTop:"auto", padding:"12px 16px",
          borderTop:`1px solid ${c.border}` }}>
          <button onClick={()=>setForm(DEFAULT)} style={{
            width:"100%", padding:"6px 0",
            background:c.surface, border:`1px solid ${c.border}`,
            borderRadius:4, color:c.textMuted, fontFamily:mono,
            fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer",
          }}>
            <i className="ti ti-refresh" aria-hidden="true" style={{marginRight:5}}/> Reset
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, overflow:"auto", padding:"24px 28px" }}>
        {/* Section header */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <i className={`ti ${SECTIONS.find(s=>s.id===activeSection)?.icon}`}
              style={{ fontSize:18, color:c.accent }} aria-hidden="true"/>
            <div style={{ fontFamily:mono, fontSize:14, fontWeight:700, color:c.text }}>
              {SECTIONS.find(s=>s.id===activeSection)?.label}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height:2, background:c.border, borderRadius:1, marginTop:12 }}>
            <div style={{ height:"100%", borderRadius:1, background:c.accent,
              width:`${(SECTIONS.findIndex(s=>s.id===activeSection)+1)/SECTIONS.length*100}%`,
              transition:"width 0.3s" }}/>
          </div>
        </div>

        {/* Content */}
        {sectionContent[activeSection]}

        {/* Next / Back */}
        {activeSection !== "results" && (
          <div style={{ display:"flex", justifyContent:"space-between",
            marginTop:24, paddingTop:16, borderTop:`1px solid ${c.border}` }}>
            {SECTIONS.findIndex(s=>s.id===activeSection) > 0 ? (
              <button onClick={()=>{
                const idx = SECTIONS.findIndex(s=>s.id===activeSection);
                setActiveSection(SECTIONS[idx-1].id);
              }} style={{
                padding:"7px 18px", background:c.surface,
                border:`1px solid ${c.border}`, borderRadius:4,
                color:c.textMuted, fontFamily:mono, fontSize:10,
                letterSpacing:"0.1em", cursor:"pointer",
              }}>
                <i className="ti ti-arrow-left" aria-hidden="true" style={{marginRight:6}}/>Back
              </button>
            ) : <div/>}
            <button onClick={()=>{
              const idx = SECTIONS.findIndex(s=>s.id===activeSection);
              setActiveSection(SECTIONS[idx+1].id);
            }} style={{
              padding:"7px 18px", background:c.accent,
              border:`1px solid ${c.accent}`, borderRadius:4,
              color:"#fff", fontFamily:mono, fontSize:10,
              letterSpacing:"0.1em", cursor:"pointer",
            }}>
              {SECTIONS.findIndex(s=>s.id===activeSection) === SECTIONS.length-2
                ? "See results" : "Next"}
              <i className="ti ti-arrow-right" aria-hidden="true" style={{marginLeft:6}}/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
