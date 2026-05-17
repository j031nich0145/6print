// ============================================================
// 🎨 ThemeEditor.jsx
// Full-featured theme panel:
//   • Preset picker (built-in + custom)
//   • System/Light/Dark shortcuts
//   • Live custom theme editor (colors, shape, typography)
//   • Import / Export / Download / Share
// ============================================================

import { useState, useRef } from "react";
import { useTheme } from "./ThemeProvider";
import { createBlankTheme } from "./themes";

// ─────────────────────────────────────
// TINY PRIMITIVES
// ─────────────────────────────────────
const Row = ({ style, children }) => (
  <div style={{ display: "flex", alignItems: "center", ...style }}>
    {children}
  </div>
);

const Label = ({ children, style }) => (
  <span
    style={{
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--color-text-muted)",
      ...style,
    }}
  >
    {children}
  </span>
);

const Divider = () => (
  <div style={{ height: "1px", background: "var(--color-border)", margin: "12px 0" }} />
);

const Btn = ({ onClick, children, variant = "default", disabled, style }) => {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    borderRadius: "var(--radius-button)",
    border: "1px solid var(--color-border)",
    fontSize: "12px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all var(--transition-speed) var(--transition-easing)",
    fontFamily: "var(--font-family)",
    whiteSpace: "nowrap",
    ...style,
  };

  const variants = {
    default: {
      background: "var(--color-surface)",
      color: "var(--color-text)",
    },
    accent: {
      background: "var(--color-accent)",
      color: "var(--color-accent-fg)",
      border: "none",
    },
    ghost: {
      background: "transparent",
      color: "var(--color-text-muted)",
      border: "1px solid transparent",
    },
    danger: {
      background: "var(--color-danger-subtle)",
      color: "var(--color-danger)",
      border: "1px solid transparent",
    },
  };

  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
};

// ─────────────────────────────────────
// THEME CARD (preset swatch)
// ─────────────────────────────────────
function ThemeCard({ theme, isActive, onSelect, onDelete, onDownload }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={() => onSelect(theme.meta.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        borderRadius: "var(--radius-card)",
        border: `1.5px solid ${isActive ? "var(--color-accent)" : hover ? "var(--color-border-strong)" : "var(--color-border)"}`,
        padding: "10px",
        cursor: "pointer",
        background: isActive ? "var(--color-accent-subtle)" : hover ? "var(--color-surface-hover)" : "var(--color-surface)",
        transition: "all var(--transition-speed) var(--transition-easing)",
      }}
    >
      {/* Swatch preview */}
      <div
        style={{
          height: "36px",
          borderRadius: "6px",
          marginBottom: "8px",
          background: theme.colors.bg,
          border: `1px solid ${theme.colors.border}`,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          gap: "6px",
          overflow: "hidden",
        }}
      >
        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: theme.colors.accent, flexShrink: 0 }} />
        <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: theme.colors.surface, opacity: 0.8 }} />
        <div style={{ width: "20px", height: "6px", borderRadius: "3px", background: theme.colors.accent, opacity: 0.6 }} />
      </div>

      <div style={{ fontSize: "12px", fontWeight: 600, color: isActive ? "var(--color-accent)" : "var(--color-text)", marginBottom: "2px" }}>
        {theme.meta.name}
      </div>
      <div style={{ fontSize: "11px", color: "var(--color-text-subtle)", lineHeight: 1.4 }}>
        {theme.meta.description?.slice(0, 40) || "Custom theme"}
      </div>

      {/* Action buttons on hover */}
      {hover && (
        <div
          style={{ position: "absolute", top: "6px", right: "6px", display: "flex", gap: "4px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onDownload(theme.meta.id)}
            title="Download"
            style={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              padding: "2px 5px",
              fontSize: "10px",
            }}
          >
            ↓
          </button>
          {!theme.meta.builtIn && (
            <button
              onClick={() => onDelete(theme.meta.id)}
              title="Delete"
              style={{
                background: "var(--color-danger-subtle)",
                border: "none",
                borderRadius: "4px",
                color: "var(--color-danger)",
                cursor: "pointer",
                padding: "2px 5px",
                fontSize: "10px",
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {isActive && (
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            right: "8px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--color-accent)",
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────
// COLOR FIELD
// ─────────────────────────────────────
function ColorField({ label, value, onChange }) {
  return (
    <Row style={{ gap: "8px", justifyContent: "space-between" }}>
      <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flex: 1 }}>{label}</span>
      <Row style={{ gap: "6px" }}>
        <input
          type="color"
          value={value?.startsWith("#") ? value : "#888888"}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "28px",
            height: "22px",
            border: "1px solid var(--color-border)",
            borderRadius: "4px",
            cursor: "pointer",
            background: "none",
            padding: "1px",
          }}
        />
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100px",
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-input-border)",
            borderRadius: "4px",
            padding: "3px 6px",
            fontSize: "11px",
            fontFamily: "var(--font-family-mono)",
            color: "var(--color-text)",
            outline: "none",
          }}
        />
      </Row>
    </Row>
  );
}

// ─────────────────────────────────────
// TEXT FIELD
// ─────────────────────────────────────
function TextField({ label, value, onChange }) {
  return (
    <Row style={{ gap: "8px", justifyContent: "space-between" }}>
      <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flex: 1 }}>{label}</span>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "140px",
          background: "var(--color-input-bg)",
          border: "1px solid var(--color-input-border)",
          borderRadius: "4px",
          padding: "4px 6px",
          fontSize: "11px",
          color: "var(--color-text)",
          fontFamily: "var(--font-family)",
          outline: "none",
        }}
      />
    </Row>
  );
}

// ─────────────────────────────────────
// CUSTOM EDITOR TAB
// ─────────────────────────────────────
function CustomEditor({ draft, onChange }) {
  const [section, setSection] = useState("colors");

  const set = (path, value) => {
    const keys = path.split(".");
    const updated = JSON.parse(JSON.stringify(draft));
    let obj = updated;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    onChange(updated);
  };

  const sections = [
    { id: "colors", label: "Colors" },
    { id: "shape", label: "Shape" },
    { id: "typography", label: "Type" },
    { id: "meta", label: "Info" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Section tabs */}
      <Row style={{ gap: "4px" }}>
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              padding: "5px 10px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 500,
              background: section === s.id ? "var(--color-accent)" : "var(--color-surface)",
              color: section === s.id ? "var(--color-accent-fg)" : "var(--color-text-muted)",
              fontFamily: "var(--font-family)",
            }}
          >
            {s.label}
          </button>
        ))}
      </Row>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {section === "colors" && (
          <>
            <Label>Surfaces</Label>
            <ColorField label="Background" value={draft.colors.bg} onChange={(v) => set("colors.bg", v)} />
            <ColorField label="Panel" value={draft.colors.panel} onChange={(v) => set("colors.panel", v)} />
            <ColorField label="Sidebar" value={draft.colors.sidebar} onChange={(v) => set("colors.sidebar", v)} />
            <ColorField label="Surface" value={draft.colors.surface} onChange={(v) => set("colors.surface", v)} />
            <Divider />
            <Label>Text</Label>
            <ColorField label="Primary" value={draft.colors.text} onChange={(v) => set("colors.text", v)} />
            <ColorField label="Muted" value={draft.colors.textMuted} onChange={(v) => set("colors.textMuted", v)} />
            <Divider />
            <Label>Accent</Label>
            <ColorField label="Accent" value={draft.colors.accent} onChange={(v) => set("colors.accent", v)} />
            <ColorField label="Accent Hover" value={draft.colors.accentHover} onChange={(v) => set("colors.accentHover", v)} />
            <ColorField label="Accent FG" value={draft.colors.accentFg} onChange={(v) => set("colors.accentFg", v)} />
            <Divider />
            <Label>Bubbles</Label>
            <ColorField label="User BG" value={draft.colors.userBubble} onChange={(v) => set("colors.userBubble", v)} />
            <ColorField label="User FG" value={draft.colors.userBubbleFg} onChange={(v) => set("colors.userBubbleFg", v)} />
            <ColorField label="Assistant BG" value={draft.colors.assistantBubble} onChange={(v) => set("colors.assistantBubble", v)} />
          </>
        )}

        {section === "shape" && (
          <>
            <Label>Corner Radii</Label>
            <TextField label="Card" value={draft.shape.cardRadius} onChange={(v) => set("shape.cardRadius", v)} />
            <TextField label="Button" value={draft.shape.buttonRadius} onChange={(v) => set("shape.buttonRadius", v)} />
            <TextField label="Input" value={draft.shape.inputRadius} onChange={(v) => set("shape.inputRadius", v)} />
            <TextField label="Bubble" value={draft.shape.bubbleRadius} onChange={(v) => set("shape.bubbleRadius", v)} />
            <TextField label="Sidebar Item" value={draft.shape.sidebarItemRadius} onChange={(v) => set("shape.sidebarItemRadius", v)} />
            <TextField label="Modal" value={draft.shape.modalRadius} onChange={(v) => set("shape.modalRadius", v)} />
            <TextField label="Pill / Tag" value={draft.shape.pillRadius} onChange={(v) => set("shape.pillRadius", v)} />
          </>
        )}

        {section === "typography" && (
          <>
            <Label>Fonts</Label>
            <TextField label="Body Font" value={draft.typography.fontFamily} onChange={(v) => set("typography.fontFamily", v)} />
            <TextField label="Mono Font" value={draft.typography.fontFamilyMono} onChange={(v) => set("typography.fontFamilyMono", v)} />
            <TextField label="Display Font" value={draft.typography.fontFamilyDisplay} onChange={(v) => set("typography.fontFamilyDisplay", v)} />
            <Divider />
            <Label>Sizes</Label>
            <TextField label="Base Size" value={draft.typography.fontSizeBase} onChange={(v) => set("typography.fontSizeBase", v)} />
            <TextField label="Small" value={draft.typography.fontSizeSm} onChange={(v) => set("typography.fontSizeSm", v)} />
            <TextField label="Large" value={draft.typography.fontSizeLg} onChange={(v) => set("typography.fontSizeLg", v)} />
            <TextField label="Line Height" value={draft.typography.lineHeight} onChange={(v) => set("typography.lineHeight", v)} />
          </>
        )}

        {section === "meta" && (
          <>
            <Label>Theme Info</Label>
            <TextField label="Name" value={draft.meta.name} onChange={(v) => set("meta.name", v)} />
            <TextField label="Author" value={draft.meta.author} onChange={(v) => set("meta.author", v)} />
            <TextField label="Description" value={draft.meta.description} onChange={(v) => set("meta.description", v)} />
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────
// IMPORT PANEL
// ─────────────────────────────────────
function ImportPanel({ onImport }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const handleImport = () => {
    const res = onImport(text);
    setResult(res);
    if (res.success) setText("");
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result);
    reader.readAsText(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <Label>Paste or Load JSON</Label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{ "meta": { "id": "my-theme", ... }, ... }'
        style={{
          width: "100%",
          height: "100px",
          background: "var(--color-input-bg)",
          border: "1px solid var(--color-input-border)",
          borderRadius: "var(--radius-input)",
          padding: "8px",
          fontSize: "11px",
          fontFamily: "var(--font-family-mono)",
          color: "var(--color-text)",
          resize: "none",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      <Row style={{ gap: "8px" }}>
        <Btn onClick={() => fileRef.current?.click()} variant="ghost">
          📁 Load File
        </Btn>
        <Btn onClick={handleImport} variant="accent" disabled={!text.trim()}>
          Import
        </Btn>
        <input ref={fileRef} type="file" accept=".json" onChange={handleFile} style={{ display: "none" }} />
      </Row>

      {result && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            background: result.success ? "rgba(34,197,94,0.1)" : "var(--color-danger-subtle)",
            color: result.success ? "var(--color-success)" : "var(--color-danger)",
          }}
        >
          {result.success ? `✓ Imported ${result.count} theme(s)` : `✕ ${result.error}`}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────
// MAIN THEME EDITOR PANEL
// ─────────────────────────────────────
export function ThemeEditor({ onClose }) {
  const {
    theme,
    mode,
    allThemes,
    builtInThemes,
    customThemes,
    switchTheme,
    saveCustomTheme,
    deleteCustomTheme,
    importTheme,
    exportTheme,
    downloadTheme,
    downloadAllCustomThemes,
  } = useTheme();

  const [tab, setTab] = useState("presets"); // "presets" | "custom" | "import"
  const [draft, setDraft] = useState(() => createBlankTheme(theme));
  const [copySuccess, setCopySuccess] = useState(false);

  const SYSTEM_MODES = [
    { id: "system", label: "🖥 System", icon: "🖥" },
    { id: "light", label: "☀️ Light", icon: "☀️" },
    { id: "dark", label: "🌙 Dark", icon: "🌙" },
  ];

  const handleSaveDraft = () => {
    saveCustomTheme(draft);
    switchTheme(draft.meta.id);
    setDraft(createBlankTheme(theme));
    setTab("presets");
  };

  const handleCopyJSON = () => {
    const json = exportTheme(theme.meta.id);
    navigator.clipboard.writeText(json);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const tabs = [
    { id: "presets", label: "Presets" },
    { id: "custom", label: "Custom" },
    { id: "import", label: "Import" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "320px",
        background: "var(--color-panel)",
        borderLeft: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-lg)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-family)",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--color-text)" }}>🎨 Theme</div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
            Active: <span style={{ color: "var(--color-accent)" }}>{theme.meta.name}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            fontSize: "18px",
            lineHeight: 1,
            padding: "4px",
          }}
        >
          ×
        </button>
      </div>

      {/* TABS */}
      <div
        style={{
          display: "flex",
          padding: "12px 16px 0",
          gap: "4px",
          flexShrink: 0,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: "var(--radius-button)",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: tab === t.id ? 600 : 400,
              background: tab === t.id ? "var(--color-surface)" : "transparent",
              color: tab === t.id ? "var(--color-text)" : "var(--color-text-muted)",
              fontFamily: "var(--font-family)",
              transition: "all var(--transition-speed) var(--transition-easing)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SCROLLABLE BODY */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* ── PRESETS TAB ── */}
        {tab === "presets" && (
          <>
            {/* System shortcuts */}
            <Label>Mode</Label>
            <Row style={{ gap: "6px" }}>
              {SYSTEM_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => switchTheme(m.id)}
                  style={{
                    flex: 1,
                    padding: "7px 4px",
                    borderRadius: "var(--radius-button)",
                    border: `1px solid ${mode === m.id ? "var(--color-accent)" : "var(--color-border)"}`,
                    background: mode === m.id ? "var(--color-accent-subtle)" : "var(--color-surface)",
                    color: mode === m.id ? "var(--color-accent)" : "var(--color-text-muted)",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontFamily: "var(--font-family)",
                    transition: "all var(--transition-speed) var(--transition-easing)",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </Row>

            <Divider />

            {/* Built-in themes */}
            <Label>Built-in</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {builtInThemes.map((t) => (
                <ThemeCard
                  key={t.meta.id}
                  theme={t}
                  isActive={mode === t.meta.id}
                  onSelect={switchTheme}
                  onDelete={() => {}}
                  onDownload={downloadTheme}
                />
              ))}
            </div>

            {/* Custom themes */}
            {customThemes.length > 0 && (
              <>
                <Divider />
                <Row style={{ justifyContent: "space-between" }}>
                  <Label>Custom ({customThemes.length})</Label>
                  <Btn onClick={downloadAllCustomThemes} variant="ghost" style={{ fontSize: "11px", padding: "3px 8px" }}>
                    ↓ Export All
                  </Btn>
                </Row>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {customThemes.map((t) => (
                    <ThemeCard
                      key={t.meta.id}
                      theme={t}
                      isActive={mode === t.meta.id}
                      onSelect={switchTheme}
                      onDelete={deleteCustomTheme}
                      onDownload={downloadTheme}
                    />
                  ))}
                </div>
              </>
            )}

            <Divider />

            {/* Export current */}
            <Label>Share Current Theme</Label>
            <Row style={{ gap: "6px" }}>
              <Btn onClick={handleCopyJSON} style={{ flex: 1 }}>
                {copySuccess ? "✓ Copied!" : "📋 Copy JSON"}
              </Btn>
              <Btn onClick={() => downloadTheme()} variant="accent">
                ↓ Download
              </Btn>
            </Row>
          </>
        )}

        {/* ── CUSTOM TAB ── */}
        {tab === "custom" && (
          <>
            <Label>Base Theme</Label>
            <select
              onChange={(e) => {
                const base = allThemes.find((t) => t.meta.id === e.target.value) || allThemes[0];
                setDraft(createBlankTheme(base));
              }}
              style={{
                background: "var(--color-input-bg)",
                border: "1px solid var(--color-input-border)",
                borderRadius: "var(--radius-input)",
                padding: "7px 10px",
                color: "var(--color-text)",
                fontFamily: "var(--font-family)",
                fontSize: "13px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {allThemes.filter((t) => !["light", "dark"].includes(t.meta.id)).map((t) => (
                <option key={t.meta.id} value={t.meta.id}>
                  {t.meta.name}
                </option>
              ))}
            </select>

            <Divider />
            <CustomEditor draft={draft} onChange={setDraft} />
            <Divider />

            <Row style={{ gap: "8px" }}>
              <Btn onClick={() => setDraft(createBlankTheme(theme))} variant="ghost">
                Reset
              </Btn>
              <Btn onClick={handleSaveDraft} variant="accent" style={{ flex: 1 }}>
                Save & Apply
              </Btn>
            </Row>
          </>
        )}

        {/* ── IMPORT TAB ── */}
        {tab === "import" && (
          <ImportPanel onImport={importTheme} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────
// THEME TOGGLE BUTTON (embed anywhere)
// ─────────────────────────────────────
export function ThemeToggleButton({ style }) {
  const { theme, editorOpen, setEditorOpen } = useTheme();

  return (
    <button
      onClick={() => setEditorOpen(!editorOpen)}
      title="Theme Settings"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-button)",
        color: "var(--color-text-muted)",
        cursor: "pointer",
        padding: "6px 10px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
        fontFamily: "var(--font-family)",
        transition: "all var(--transition-speed) var(--transition-easing)",
        ...style,
      }}
    >
      <span>🎨</span>
      <span style={{ fontSize: "11px" }}>{theme.meta.name}</span>
    </button>
  );
}
