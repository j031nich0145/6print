import { useState, useRef, useEffect, useCallback } from "react";

// ── Suggested queries ─────────────────────────────────────────────────────────
const SUGGESTED = [
  { label:"Worst right now",         q:"Which cities have the worst air quality right now and what's driving it?" },
  { label:"Asia vs Europe",          q:"Compare pollution levels between Asia and Europe." },
  { label:"Health effects AQI 150",  q:"What are the health effects of sustained exposure to an AQI of 150?" },
  { label:"Top CO city",             q:"Which city has the highest carbon monoxide levels and why?" },
  { label:"UV & latitude",           q:"How does UV index relate to latitude and season?" },
  { label:"PM2.5 vs PM10",           q:"What's the difference between PM2.5 and PM10 and which is more dangerous?" },
  { label:"Wildfire signature",       q:"How do wildfires show up in air quality data?" },
  { label:"Dust hotspots",           q:"Which regions have the highest dust levels and why?" },
];

// ── Simple markdown renderer ──────────────────────────────────────────────────
function renderInline(text, c, mono) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} style={{ color:c.text }}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} style={{
        background:c.surface, border:`1px solid ${c.border}`,
        borderRadius:3, padding:"1px 5px",
        fontFamily:mono, fontSize:10, color:c.accent,
      }}>{p.slice(1,-1)}</code>;
    return p;
  });
}

function Markdown({ text, theme }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const lines = (text || "").split("\n");
  const out   = [];
  let i = 0, key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      out.push(
        <div key={key++} style={{
          background:c.surface, border:`1px solid ${c.border}`, borderRadius:6,
          padding:"8px 12px", margin:"6px 0", fontFamily:mono, fontSize:10,
          color:c.text, overflowX:"auto", whiteSpace:"pre",
        }}>{codeLines.join("\n")}</div>
      );
      i++; continue;
    }

    // ## Heading
    if (line.startsWith("## ")) {
      out.push(
        <div key={key++} style={{ fontFamily:mono, fontSize:10, fontWeight:700,
          color:c.accent, marginTop:10, marginBottom:3,
          letterSpacing:"0.12em", textTransform:"uppercase" }}>
          {line.slice(3)}
        </div>
      );
      i++; continue;
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("• ")) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("• "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={key++} style={{ margin:"4px 0 6px 0", paddingLeft:16 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontFamily:mono, fontSize:11, color:c.text,
              lineHeight:1.65, marginBottom:2 }}>
              {renderInline(item, c, mono)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      out.push(
        <ol key={key++} style={{ margin:"4px 0 6px 0", paddingLeft:18 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontFamily:mono, fontSize:11, color:c.text,
              lineHeight:1.65, marginBottom:2 }}>
              {renderInline(item, c, mono)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") { i++; continue; }

    // Paragraph
    out.push(
      <p key={key++} style={{ fontFamily:mono, fontSize:11, color:c.text,
        lineHeight:1.7, margin:"2px 0 6px" }}>
        {renderInline(line, c, mono)}
      </p>
    );
    i++;
  }

  return <>{out}</>;
}

// ── Typing cursor ─────────────────────────────────────────────────────────────
function Cursor({ theme }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn(v => !v), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{
      display:"inline-block", width:7, height:12,
      background: on ? theme.colors.accent : "transparent",
      verticalAlign:"middle", marginLeft:2, borderRadius:1,
    }}/>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QueryChat({ data, theme, filters, timeWindow }) {
  const c    = theme.colors;
  const mono = theme.typography.fontFamilyMono;
  const shape = theme.shape ?? {};

  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const abortRef   = useRef(null);

  // Build context from live data
  const buildContext = useCallback(() => {
    const valid  = (data || []).filter(d => d.us_aqi != null);
    const sorted = [...valid].sort((a, b) => (b.us_aqi ?? 0) - (a.us_aqi ?? 0));
    const avg    = valid.length
      ? Math.round(valid.reduce((s, d) => s + (d.us_aqi ?? 0), 0) / valid.length * 10) / 10
      : null;
    const topCO  = [...(data || [])].filter(d => d.carbon_monoxide != null)
      .sort((a, b) => (b.carbon_monoxide ?? 0) - (a.carbon_monoxide ?? 0))[0];
    const topUV  = [...(data || [])].filter(d => d.uv_index != null)
      .sort((a, b) => (b.uv_index ?? 0) - (a.uv_index ?? 0))[0];
    return {
      cityCount:    valid.length,
      timeWindow:   timeWindow ?? "live",
      region:       filters?.region ?? "All Regions",
      globalAvgAqi: avg,
      top5Worst:    sorted.slice(0, 5).map(d => ({ location: d.location, value: d.us_aqi })),
      top5Best:     sorted.slice(-5).reverse().map(d => ({ location: d.location, value: d.us_aqi })),
      topCO: topCO ? { location: topCO.location, value: topCO.carbon_monoxide } : null,
      topUV: topUV ? { location: topUV.location, value: topUV.uv_index }        : null,
    };
  }, [data, filters, timeWindow]);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || streaming) return;

    const userMsg  = { role:"user", content: content.trim() };
    const newMsgs  = [...messages, userMsg];
    setMessages([...newMsgs, { role:"assistant", content:"", streaming:true }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let reply = "";
    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  controller.signal,
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
          context:  buildContext(),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop(); // keep partial last line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              reply += parsed.content;
              setMessages(prev => [
                ...prev.slice(0, -1),
                { role:"assistant", content:reply, streaming:true },
              ]);
            }
          } catch (e) {
            if (e.name !== "SyntaxError") throw e;
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        reply = reply || "(stopped)";
      } else {
        reply = `**Error:** ${err.message}\n\nMake sure the backend is running and \`GROQ_API_KEY\` is set in \`.env\`.`;
      }
    } finally {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role:"assistant", content: reply || "(no response)", streaming:false },
      ]);
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [messages, streaming, buildContext]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stop = () => abortRef.current?.abort();

  const clear = () => {
    stop();
    setMessages([]);
    setInput("");
    setStreaming(false);
    inputRef.current?.focus();
  };

  // ── Context pill ───────────────────────────────────────────────────────────
  const ctx    = buildContext();
  const avgAqi = ctx.globalAvgAqi;
  const aqiColor = avgAqi == null ? c.textSubtle
    : avgAqi <= 50  ? "#22c55e"
    : avgAqi <= 100 ? "#eab308"
    : avgAqi <= 150 ? "#f97316"
    : "#ef4444";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
      background:c.bg }}>

      {/* Header */}
      <div style={{ height:48, display:"flex", alignItems:"center",
        padding:"0 20px", background:c.panel, borderBottom:`1px solid ${c.border}`,
        flexShrink:0, gap:12 }}>
        <span style={{ fontFamily:mono, fontSize:11, fontWeight:700,
          color:c.accent, letterSpacing:"0.15em" }}>QUERY CHAT</span>

        {/* Context badges */}
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle,
            background:c.surface, border:`1px solid ${c.border}`,
            borderRadius:4, padding:"2px 8px" }}>
            {ctx.cityCount} cities
          </div>
          {avgAqi != null && (
            <div style={{ fontFamily:mono, fontSize:9, color:aqiColor,
              background:`${aqiColor}18`, border:`1px solid ${aqiColor}44`,
              borderRadius:4, padding:"2px 8px" }}>
              avg AQI {avgAqi}
            </div>
          )}
          <div style={{ fontFamily:mono, fontSize:9, color:c.textSubtle,
            background:c.surface, border:`1px solid ${c.border}`,
            borderRadius:4, padding:"2px 8px" }}>
            {ctx.timeWindow === "live" ? "live" : `↩ ${ctx.timeWindow}`}
          </div>
        </div>

        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          {streaming && (
            <button onClick={stop} style={{
              padding:"4px 12px", fontFamily:mono, fontSize:9,
              letterSpacing:"0.1em", textTransform:"uppercase",
              background:c.surface, border:`1px solid ${c.border}`,
              borderRadius:4, color:c.textMuted, cursor:"pointer",
            }}>■ Stop</button>
          )}
          {messages.length > 0 && !streaming && (
            <button onClick={clear} style={{
              padding:"4px 12px", fontFamily:mono, fontSize:9,
              letterSpacing:"0.1em", textTransform:"uppercase",
              background:c.surface, border:`1px solid ${c.border}`,
              borderRadius:4, color:c.textMuted, cursor:"pointer",
            }}>↺ Clear</button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px",
        display:"flex", flexDirection:"column", gap:16 }}>

        {/* Welcome / empty state */}
        {messages.length === 0 && (
          <div style={{ maxWidth:640, margin:"40px auto 0", width:"100%" }}>
            <div style={{ fontFamily:mono, fontSize:14, color:c.text,
              marginBottom:6 }}>Ask anything about the data.</div>
            <div style={{ fontFamily:mono, fontSize:11, color:c.textSubtle,
              marginBottom:24, lineHeight:1.6 }}>
              I have live access to {ctx.cityCount} cities across all regions.
              Ask about air quality, health effects, city comparisons, or trends.
            </div>
            <div style={{ display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))", gap:8 }}>
              {SUGGESTED.map(s => (
                <button key={s.label} onClick={() => sendMessage(s.q)} style={{
                  padding:"10px 14px", background:c.surface,
                  border:`1px solid ${c.border}`, borderRadius:6,
                  fontFamily:mono, fontSize:10, color:c.textMuted,
                  cursor:"pointer", textAlign:"left", lineHeight:1.5,
                  transition:"all 0.15s",
                }}>
                  <div style={{ color:c.accent, fontSize:9, letterSpacing:"0.1em",
                    textTransform:"uppercase", marginBottom:3 }}>{s.label}</div>
                  {s.q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          return (
            <div key={idx} style={{
              display:"flex",
              justifyContent: isUser ? "flex-end" : "flex-start",
              maxWidth:"100%",
            }}>
              {/* Assistant avatar */}
              {!isUser && (
                <div style={{ width:28, height:28, borderRadius:"50%", flexShrink:0,
                  background:c.accentSubtle, border:`1px solid ${c.accent}44`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontFamily:mono, fontSize:9, color:c.accent,
                  marginRight:10, marginTop:2 }}>
                  CM
                </div>
              )}

              <div style={{
                maxWidth: isUser ? "72%" : "78%",
                padding: isUser ? "9px 14px" : "12px 16px",
                background: isUser
                  ? `${c.accent}22`
                  : `${c.panel}`,
                border:`1px solid ${isUser ? `${c.accent}55` : c.border}`,
                borderRadius: isUser
                  ? `${shape.cardRadius}px ${shape.cardRadius}px 4px ${shape.cardRadius}px`
                  : `4px ${shape.cardRadius}px ${shape.cardRadius}px ${shape.cardRadius}px`,
              }}>
                {isUser ? (
                  <span style={{ fontFamily:mono, fontSize:11, color:c.text,
                    lineHeight:1.65, whiteSpace:"pre-wrap" }}>{msg.content}</span>
                ) : (
                  <>
                    <Markdown text={msg.content} theme={theme}/>
                    {msg.streaming && <Cursor theme={theme}/>}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef}/>
      </div>

      {/* Input bar */}
      <div style={{ padding:"12px 20px", background:c.panel,
        borderTop:`1px solid ${c.border}`, flexShrink:0 }}>
        <div style={{ display:"flex", gap:10, alignItems:"flex-end",
          background:c.surface, border:`1px solid ${c.border}`,
          borderRadius:shape.cardRadius??8, padding:"8px 12px" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={streaming}
            placeholder="Ask about air quality, cities, health effects… (Enter to send, Shift+Enter for newline)"
            rows={1}
            style={{
              flex:1, background:"transparent", border:"none", outline:"none",
              fontFamily:mono, fontSize:11, color:c.text,
              resize:"none", lineHeight:1.5, minHeight:22, maxHeight:120,
              overflow:"auto",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
            style={{
              padding:"6px 16px", flexShrink:0,
              background: (!input.trim() || streaming) ? c.surface : c.accent,
              border:`1px solid ${(!input.trim() || streaming) ? c.border : c.accent}`,
              borderRadius:6, color: (!input.trim() || streaming) ? c.textSubtle : "#fff",
              fontFamily:mono, fontSize:10, letterSpacing:"0.1em",
              cursor: (!input.trim() || streaming) ? "default" : "pointer",
              transition:"all 0.15s",
            }}>
            {streaming ? "…" : "Send →"}
          </button>
        </div>
        <div style={{ fontFamily:mono, fontSize:8, color:c.textSubtle,
          marginTop:5, textAlign:"right" }}>
          llama-3.3-70b · Groq · data via Open-Meteo + CAMS
        </div>
      </div>
    </div>
  );
}
