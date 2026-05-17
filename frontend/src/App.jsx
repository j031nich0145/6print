import { useState, useEffect } from "react";
import { useTheme } from "./theme/ThemeProvider";
import { ThemeEditor } from "./theme/ThemeEditor";
import AirQuality from "./pages/AirQuality";
import UVIndex from "./pages/UVIndex";
import CarbonCalculator from "./pages/CarbonCalculator";
import QueryChat from "./pages/QueryChat";
import axios from "axios";

const TABS = [
  { id: "aqi",    label: "Air Quality"       },
  { id: "uv",     label: "UV Index"          },
  { id: "carbon", label: "Carbon Calculator" },
  { id: "chat",   label: "Query Chat"        },
];

const REGIONS = [
  "All Regions","Canada","United States","Central America",
  "South America","Europe","Africa","Middle East",
  "Asia","Central Asia","Oceania",
];

const METRICS = [
  { id: "us_aqi",           label: "US AQI",   unit: ""      },
  { id: "european_aqi",     label: "EU AQI",   unit: ""      },
  { id: "pm2_5",            label: "PM2.5",    unit: "μg/m³" },
  { id: "pm10",             label: "PM10",     unit: "μg/m³" },
  { id: "nitrogen_dioxide", label: "NO₂",      unit: "μg/m³" },
  { id: "ozone",            label: "Ozone",    unit: "μg/m³" },
  { id: "dust",             label: "Dust",     unit: "μg/m³" },
  { id: "uv_index",         label: "UV Index", unit: ""      },
];

export const METRIC_META = Object.fromEntries(METRICS.map((m) => [m.id, m]));

const TAB_H = 44;

function FilterPanel({ open, filters, onFilter, onRefresh, loading, cityCount, lastUpdate, theme }) {
  const c = theme.colors;
  const mono = theme.typography.fontFamilyMono;

  const selectStyle = {
    width: "100%", padding: "7px 10px", marginBottom: "14px",
    background: c.inputBg, border: `1px solid ${c.inputBorder}`,
    borderRadius: theme.shape.inputRadius, color: c.text,
    fontFamily: mono, fontSize: "12px", cursor: "pointer", outline: "none",
  };

  const labelStyle = {
    fontFamily: mono, fontSize: "10px", letterSpacing: "0.14em",
    textTransform: "uppercase", color: c.textSubtle, marginBottom: "5px", display: "block",
  };

  return (
    <div style={{
      position: "fixed", top: TAB_H, left: 0, bottom: 0, width: "240px",
      background: c.sidebar, borderRight: `1px solid ${c.border}`,
      boxShadow: "4px 0 24px rgba(0,0,0,0.4)", zIndex: 200,
      display: "flex", flexDirection: "column",
      transform: open ? "translateX(0)" : "translateX(-100%)",
      transition: `transform 0.2s cubic-bezier(0.4,0,0.2,1)`,
    }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: mono, fontSize: "9px", letterSpacing: "0.22em",
          color: c.accent, fontWeight: 700, textTransform: "uppercase" }}>Carbon Monitor</div>
        {lastUpdate && (
          <div style={{ fontFamily: mono, fontSize: "9px", color: c.textSubtle,
            letterSpacing: "0.08em", marginTop: "3px" }}>
            {lastUpdate.slice(0, 16).replace("T", " ")} UTC
          </div>
        )}
        <div style={{ fontFamily: mono, fontSize: "9px", color: c.textSubtle, marginTop: "2px" }}>
          {cityCount} cities loaded
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
        <div style={{ fontFamily: mono, fontSize: "9px", letterSpacing: "0.2em",
          textTransform: "uppercase", color: c.textSubtle,
          borderBottom: `1px solid ${c.border}`, paddingBottom: "6px", marginBottom: "14px" }}>
          Filters
        </div>

        <label style={labelStyle}>Region</label>
        <select style={selectStyle} value={filters.region}
          onChange={(e) => onFilter({ ...filters, region: e.target.value })}>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>

        <label style={labelStyle}>Metric</label>
        <select style={selectStyle} value={filters.metric}
          onChange={(e) => onFilter({ ...filters, metric: e.target.value })}>
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}{m.unit ? ` (${m.unit})` : ""}</option>
          ))}
        </select>

        <label style={labelStyle}>Min Population</label>
        <select style={selectStyle} value={String(filters.minPop)}
          onChange={(e) => onFilter({ ...filters, minPop: Number(e.target.value) })}>
          {[["0","Any"],["500000","500k+"],["1000000","1M+"],["5000000","5M+"],["10000000","10M+"]].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <button onClick={onRefresh} disabled={loading} style={{
          width: "100%", padding: "8px", marginTop: "4px",
          background: c.accentSubtle, border: `1px solid ${c.accent}`,
          borderRadius: theme.shape.buttonRadius, color: c.accent,
          fontFamily: mono, fontSize: "11px", letterSpacing: "0.1em",
          cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "Loading..." : "↺  Refresh"}
        </button>

        <div style={{ fontFamily: mono, fontSize: "9px", color: c.textSubtle,
          marginTop: "16px", lineHeight: 1.8, letterSpacing: "0.06em" }}>
          Open-Meteo → Lambda<br />→ S3 → Snowflake · 30 min
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ open, theme }) {
  const c = theme.colors;
  return (
    <div style={{
      position: "fixed", top: TAB_H, right: 0, bottom: 0, width: "320px",
      background: c.panel, borderLeft: `1px solid ${c.border}`,
      boxShadow: "-4px 0 24px rgba(0,0,0,0.4)", zIndex: 200,
      overflowY: "auto",
      transform: open ? "translateX(0)" : "translateX(100%)",
      transition: `transform 0.2s cubic-bezier(0.4,0,0.2,1)`,
    }}>
      <ThemeEditor />
    </div>
  );
}

export default function App() {
  const { theme } = useTheme();
  const c = theme.colors;
  const mono = theme.typography.fontFamilyMono;

  const [activeTab,    setActiveTab]    = useState("aqi");
  const [filtersOpen,  setFiltersOpen]  = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters,      setFilters]      = useState({ region: "All Regions", metric: "us_aqi", minPop: 0 });
  const [aqiData,      setAqiData]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdate,   setLastUpdate]   = useState(null);

  const fetchAQI = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.region !== "All Regions") params.region = filters.region;
      if (filters.minPop > 0) params.min_pop = filters.minPop;
      const { data } = await axios.get("/api/aqi", { params });
      setAqiData(data);
      if (data.length > 0) setLastUpdate(data[0].measured_at || null);
    } catch (e) {
      console.error("AQI fetch failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAQI(); }, [filters.region, filters.minPop]);

  const TAB_BTN = (tab) => {
    const active = activeTab === tab.id;
    return (
      <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
        padding: "0 22px", height: "100%",
        background: "transparent", border: "none",
        borderBottom: `2px solid ${active ? c.accent : "transparent"}`,
        color: active ? c.accent : c.textMuted,
        fontFamily: mono, fontSize: "11px",
        fontWeight: active ? 600 : 400,
        letterSpacing: "0.12em", textTransform: "uppercase",
        cursor: "pointer", flexShrink: 0,
        transition: `all 0.15s`,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = c.text; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = c.textMuted; }}
      >{tab.label}</button>
    );
  };

  const ICON_BTN = ({ onClick, title, active, children }) => (
    <button onClick={onClick} title={title} style={{
      width: TAB_H, height: TAB_H,
      background: active ? c.accentSubtle : "transparent",
      border: "none",
      borderBottom: `2px solid ${active ? c.accent : "transparent"}`,
      color: active ? c.accent : c.textMuted,
      fontSize: "17px", cursor: "pointer", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: `all 0.15s`,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.color = c.accent; }}
    onMouseLeave={(e) => { e.currentTarget.style.color = active ? c.accent : c.textMuted; }}
    >{children}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh",
      background: c.bg, overflow: "hidden" }}>

      {/* Tab bar */}
      <div style={{
        height: TAB_H, display: "flex", alignItems: "stretch",
        background: c.panel, borderBottom: `1px solid ${c.border}`,
        flexShrink: 0, zIndex: 300,
      }}>
        <ICON_BTN
          onClick={() => { setFiltersOpen((v) => !v); setSettingsOpen(false); }}
          title="Filters"
          active={filtersOpen}
        >{filtersOpen ? "‹" : "›"}</ICON_BTN>

        <div style={{ width: "1px", background: c.border }} />

        {TABS.map(TAB_BTN)}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <div style={{ fontFamily: mono, fontSize: "10px", color: c.textSubtle,
            letterSpacing: "0.1em", padding: "0 14px" }}>
            {loading
              ? <span style={{ color: c.warning }}>● Loading</span>
              : <span>{aqiData.length} cities</span>}
          </div>
          <div style={{ width: "1px", height: "22px", background: c.border }} />
          <ICON_BTN
            onClick={() => { setSettingsOpen((v) => !v); setFiltersOpen(false); }}
            title="Settings & Themes"
            active={settingsOpen}
          >⚙</ICON_BTN>
        </div>
      </div>

      {/* Full-width content */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}
        onClick={() => { if (filtersOpen) setFiltersOpen(false); if (settingsOpen) setSettingsOpen(false); }}>
        {activeTab === "aqi"    && <AirQuality data={aqiData} loading={loading} filters={filters} metricMeta={METRIC_META} theme={theme} />}
        {activeTab === "uv"     && <UVIndex data={aqiData} loading={loading} theme={theme} />}
        {activeTab === "carbon" && <CarbonCalculator theme={theme} />}
        {activeTab === "chat"   && <QueryChat data={aqiData} theme={theme} />}
      </div>

      {/* Overlay panels */}
      <FilterPanel open={filtersOpen} filters={filters} onFilter={setFilters}
        onRefresh={fetchAQI} loading={loading} cityCount={aqiData.length}
        lastUpdate={lastUpdate} theme={theme} />
      <SettingsPanel open={settingsOpen} theme={theme} />
    </div>
  );
}
