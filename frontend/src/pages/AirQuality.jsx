export default function AirQuality({ theme }) {
  const c = theme.colors;
  return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:c.bg, fontFamily:theme.typography.fontFamilyMono, flexDirection:"column", gap:8 }}>
      <div style={{ color:c.accent, fontSize:"1.2rem", fontWeight:700 }}>AirQuality</div>
      <div style={{ color:c.textSubtle, fontSize:"11px", letterSpacing:"0.1em" }}>COMING NEXT</div>
    </div>
  );
}
