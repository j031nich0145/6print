// ============================================================
// 🎨 UNIVERSAL THEME SYSTEM — themes.js
// Schema-first theme objects. Every key is intentional.
// Import this anywhere and render consistently across all apps.
// ============================================================

export const THEME_VERSION = "1.0.0";

export const themeSchema = {
  meta: {
    id: "string — unique identifier, kebab-case",
    name: "string — display name",
    version: "string — semver",
    author: "string",
    description: "string",
    tags: ["dark", "light", "retro", "minimal", "etc"],
    builtIn: "boolean — prevents deletion",
  },
  colors: {
    bg: "string — page/root background",
    panel: "string — secondary panels, modals",
    sidebar: "string — sidebar background",
    surface: "string — cards, elevated surfaces",
    surfaceHover: "string — hovered surface",
    border: "string — default border color",
    borderStrong: "string — emphasized border",
    text: "string — primary text",
    textMuted: "string — secondary text",
    textSubtle: "string — placeholder, disabled",
    accent: "string — primary accent",
    accentHover: "string — accent on hover",
    accentFg: "string — text/icons on accent bg",
    accentSubtle: "string — tinted accent bg",
    userBubble: "string — user message bg",
    userBubbleFg: "string — user message text",
    assistantBubble: "string — assistant message bg",
    assistantBubbleFg: "string — assistant message text",
    inputBg: "string — textarea/input background",
    inputBorder: "string — input border",
    inputFocusBorder: "string — focused input border",
    danger: "string — destructive actions",
    dangerSubtle: "string — danger tinted bg",
    success: "string",
    warning: "string",
    scrollbar: "string",
    overlay: "string",
    code: "string",
  },
  typography: {
    fontFamily: "string",
    fontFamilyMono: "string",
    fontFamilyDisplay: "string",
    fontSizeBase: "string",
    fontSizeSm: "string",
    fontSizeLg: "string",
    lineHeight: "string",
    letterSpacing: "string",
    fontWeightNormal: "number",
    fontWeightMedium: "number",
    fontWeightBold: "number",
  },
  shape: {
    cardRadius: "string",
    buttonRadius: "string",
    inputRadius: "string",
    bubbleRadius: "string",
    sidebarItemRadius: "string",
    modalRadius: "string",
    pillRadius: "string",
    avatarRadius: "string",
  },
  spacing: {
    xs: "string",
    sm: "string",
    md: "string",
    lg: "string",
    xl: "string",
    sidebarPadding: "string",
    messagePadding: "string",
  },
  effects: {
    shadowSm: "string",
    shadowMd: "string",
    shadowLg: "string",
    shadowAccent: "string",
    transitionSpeed: "string",
    transitionEasing: "string",
    glassBg: "string",
    blurAmount: "string",
    gradientAccent: "string",
  },
};

// ─────────────────────────────────────────
// DARK THEMES
// ─────────────────────────────────────────

export const themeVoid = {
  meta: {
    id: "void", name: "Void", version: THEME_VERSION, author: "system",
    description: "Ultra-dark. Maximum focus. Ink on night.",
    tags: ["dark", "minimal", "professional"], builtIn: true,
  },
  colors: {
    bg: "#0a0a0a", panel: "#111111", sidebar: "#0d0d0d",
    surface: "#161616", surfaceHover: "#1e1e1e",
    border: "rgba(255,255,255,0.07)", borderStrong: "rgba(255,255,255,0.15)",
    text: "#e2e2e2", textMuted: "#888888", textSubtle: "#555555",
    accent: "#6366f1", accentHover: "#4f52d0", accentFg: "#ffffff",
    accentSubtle: "rgba(99,102,241,0.12)",
    userBubble: "#6366f1", userBubbleFg: "#ffffff",
    assistantBubble: "#161616", assistantBubbleFg: "#e2e2e2",
    inputBg: "#111111", inputBorder: "rgba(255,255,255,0.08)",
    inputFocusBorder: "rgba(99,102,241,0.6)",
    danger: "#ef4444", dangerSubtle: "rgba(239,68,68,0.12)",
    success: "#22c55e", warning: "#f59e0b",
    scrollbar: "#1f1f1f", overlay: "rgba(0,0,0,0.7)", code: "#1a1a1a",
  },
  typography: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
    fontFamilyDisplay: "'Syne', 'DM Sans', sans-serif",
    fontSizeBase: "14px", fontSizeSm: "12px", fontSizeLg: "16px",
    lineHeight: "1.6", letterSpacing: "-0.01em",
    fontWeightNormal: 400, fontWeightMedium: 500, fontWeightBold: 700,
  },
  shape: {
    cardRadius: "12px", buttonRadius: "8px", inputRadius: "10px",
    bubbleRadius: "18px", sidebarItemRadius: "8px",
    modalRadius: "16px", pillRadius: "999px", avatarRadius: "50%",
  },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px",
    sidebarPadding: "12px", messagePadding: "20px" },
  effects: {
    shadowSm: "0 1px 4px rgba(0,0,0,0.3)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.5)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.6)",
    shadowAccent: "0 0 20px rgba(99,102,241,0.3)",
    transitionSpeed: "0.15s", transitionEasing: "cubic-bezier(0.4,0,0.2,1)",
    glassBg: "rgba(10,10,10,0.7)", blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  },
};

// Obsidian — deep charcoal, muted green accent
export const themeObsidian = {
  meta: {
    id: "obsidian", name: "Obsidian", version: THEME_VERSION, author: "system",
    description: "Deep charcoal. Muted green. Precision dark.",
    tags: ["dark", "professional", "earth"], builtIn: true,
  },
  colors: {
    bg: "#141614", panel: "#1b1e1b", sidebar: "#111311",
    surface: "#212421", surfaceHover: "#292c29",
    border: "rgba(160,200,160,0.08)", borderStrong: "rgba(160,200,160,0.16)",
    text: "#dde8dd", textMuted: "#7a917a", textSubtle: "#4a5e4a",
    accent: "#5a8f5a", accentHover: "#467346", accentFg: "#ffffff",
    accentSubtle: "rgba(90,143,90,0.12)",
    userBubble: "#3a6e3a", userBubbleFg: "#dde8dd",
    assistantBubble: "#212421", assistantBubbleFg: "#dde8dd",
    inputBg: "#1b1e1b", inputBorder: "rgba(160,200,160,0.1)",
    inputFocusBorder: "rgba(90,143,90,0.45)",
    danger: "#e05252", dangerSubtle: "rgba(224,82,82,0.1)",
    success: "#5a8f5a", warning: "#c49a3a",
    scrollbar: "#252825", overlay: "rgba(10,12,10,0.75)", code: "#191c19",
  },
  typography: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    fontFamilyMono: "'JetBrains Mono', monospace",
    fontFamilyDisplay: "'DM Sans', sans-serif",
    fontSizeBase: "14px", fontSizeSm: "12px", fontSizeLg: "16px",
    lineHeight: "1.6", letterSpacing: "-0.01em",
    fontWeightNormal: 400, fontWeightMedium: 500, fontWeightBold: 700,
  },
  shape: {
    cardRadius: "10px", buttonRadius: "7px", inputRadius: "9px",
    bubbleRadius: "16px", sidebarItemRadius: "6px",
    modalRadius: "14px", pillRadius: "999px", avatarRadius: "50%",
  },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px",
    sidebarPadding: "12px", messagePadding: "20px" },
  effects: {
    shadowSm: "0 1px 4px rgba(0,0,0,0.4)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.55)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.65)",
    shadowAccent: "0 0 18px rgba(90,143,90,0.2)",
    transitionSpeed: "0.15s", transitionEasing: "cubic-bezier(0.4,0,0.2,1)",
    glassBg: "rgba(20,22,20,0.75)", blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #5a8f5a 0%, #4a7a6e 100%)",
  },
};

// Terrain — dark warm earth, topographic map feel
export const themeTerrain = {
  meta: {
    id: "terrain", name: "Terrain", version: THEME_VERSION, author: "system",
    description: "Dark warm earth. Stone and shadow.",
    tags: ["dark", "warm", "earth"], builtIn: true,
  },
  colors: {
    bg: "#18160f", panel: "#201e15", sidebar: "#151309",
    surface: "#28251a", surfaceHover: "#312e22",
    border: "rgba(200,185,140,0.09)", borderStrong: "rgba(200,185,140,0.18)",
    text: "#e8e0cc", textMuted: "#9a8e72", textSubtle: "#635a42",
    accent: "#8a7a52", accentHover: "#70633f", accentFg: "#ffffff",
    accentSubtle: "rgba(138,122,82,0.12)",
    userBubble: "#6a5c38", userBubbleFg: "#e8e0cc",
    assistantBubble: "#28251a", assistantBubbleFg: "#e8e0cc",
    inputBg: "#201e15", inputBorder: "rgba(200,185,140,0.1)",
    inputFocusBorder: "rgba(138,122,82,0.4)",
    danger: "#c0542a", dangerSubtle: "rgba(192,84,42,0.1)",
    success: "#6a8a52", warning: "#c4973a",
    scrollbar: "#2c291e", overlay: "rgba(12,10,6,0.8)", code: "#1c1a12",
  },
  typography: {
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    fontFamilyMono: "'JetBrains Mono', monospace",
    fontFamilyDisplay: "'IBM Plex Sans', sans-serif",
    fontSizeBase: "14px", fontSizeSm: "12px", fontSizeLg: "16px",
    lineHeight: "1.6", letterSpacing: "0em",
    fontWeightNormal: 400, fontWeightMedium: 500, fontWeightBold: 700,
  },
  shape: {
    cardRadius: "8px", buttonRadius: "6px", inputRadius: "8px",
    bubbleRadius: "14px", sidebarItemRadius: "5px",
    modalRadius: "12px", pillRadius: "999px", avatarRadius: "50%",
  },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px",
    sidebarPadding: "12px", messagePadding: "20px" },
  effects: {
    shadowSm: "0 1px 4px rgba(0,0,0,0.4)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.55)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.65)",
    shadowAccent: "0 0 16px rgba(138,122,82,0.2)",
    transitionSpeed: "0.15s", transitionEasing: "cubic-bezier(0.4,0,0.2,1)",
    glassBg: "rgba(24,22,15,0.78)", blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #8a7a52 0%, #6a8a52 100%)",
  },
};

// ─────────────────────────────────────────
// LIGHT THEMES
// ─────────────────────────────────────────

// Parchment — warm map paper, cartographic feel
export const themeParchment = {
  meta: {
    id: "parchment", name: "Parchment", version: THEME_VERSION, author: "system",
    description: "Warm map paper. Cartographic and precise.",
    tags: ["light", "warm", "earth"], builtIn: true,
  },
  colors: {
    bg: "#f5f0e6", panel: "#ede7d9", sidebar: "#e6e0d0",
    surface: "#faf7f0", surfaceHover: "#f0ebe0",
    border: "rgba(100,80,45,0.12)", borderStrong: "rgba(100,80,45,0.24)",
    text: "#2a2015", textMuted: "#6b5a3a", textSubtle: "#a09070",
    accent: "#7a5c1e", accentHover: "#5e4515", accentFg: "#ffffff",
    accentSubtle: "rgba(122,92,30,0.1)",
    userBubble: "#7a5c1e", userBubbleFg: "#ffffff",
    assistantBubble: "#ede7d9", assistantBubbleFg: "#2a2015",
    inputBg: "#faf7f0", inputBorder: "rgba(100,80,45,0.15)",
    inputFocusBorder: "rgba(122,92,30,0.4)",
    danger: "#b03a2e", dangerSubtle: "rgba(176,58,46,0.08)",
    success: "#2e7d52", warning: "#a66a00",
    scrollbar: "#d8d0be", overlay: "rgba(30,20,10,0.45)", code: "#ede7d9",
  },
  typography: {
    fontFamily: "'IBM Plex Sans', 'Georgia', sans-serif",
    fontFamilyMono: "'JetBrains Mono', monospace",
    fontFamilyDisplay: "'Lora', 'Georgia', serif",
    fontSizeBase: "15px", fontSizeSm: "13px", fontSizeLg: "17px",
    lineHeight: "1.65", letterSpacing: "0em",
    fontWeightNormal: 400, fontWeightMedium: 500, fontWeightBold: 700,
  },
  shape: {
    cardRadius: "8px", buttonRadius: "6px", inputRadius: "8px",
    bubbleRadius: "14px", sidebarItemRadius: "5px",
    modalRadius: "12px", pillRadius: "999px", avatarRadius: "50%",
  },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px",
    sidebarPadding: "12px", messagePadding: "20px" },
  effects: {
    shadowSm: "0 1px 3px rgba(80,60,20,0.1)",
    shadowMd: "0 4px 14px rgba(80,60,20,0.12)",
    shadowLg: "0 12px 36px rgba(80,60,20,0.15)",
    shadowAccent: "0 0 14px rgba(122,92,30,0.15)",
    transitionSpeed: "0.15s", transitionEasing: "cubic-bezier(0.4,0,0.2,1)",
    glassBg: "rgba(245,240,230,0.8)", blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #7a5c1e 0%, #a07830 100%)",
  },
};

// Slate — cool grey professional light
export const themeSlate = {
  meta: {
    id: "slate", name: "Slate", version: THEME_VERSION, author: "system",
    description: "Cool grey. Clean professional light.",
    tags: ["light", "minimal", "professional"], builtIn: true,
  },
  colors: {
    bg: "#f4f5f7", panel: "#ebedf0", sidebar: "#e2e5e9",
    surface: "#ffffff", surfaceHover: "#f0f2f5",
    border: "rgba(55,65,81,0.11)", borderStrong: "rgba(55,65,81,0.22)",
    text: "#1a202c", textMuted: "#64748b", textSubtle: "#94a3b8",
    accent: "#2c6e8a", accentHover: "#215572", accentFg: "#ffffff",
    accentSubtle: "rgba(44,110,138,0.08)",
    userBubble: "#2c6e8a", userBubbleFg: "#ffffff",
    assistantBubble: "#ebedf0", assistantBubbleFg: "#1a202c",
    inputBg: "#ffffff", inputBorder: "rgba(55,65,81,0.14)",
    inputFocusBorder: "rgba(44,110,138,0.4)",
    danger: "#c0392b", dangerSubtle: "rgba(192,57,43,0.07)",
    success: "#1e7e5a", warning: "#a0720a",
    scrollbar: "#d1d5db", overlay: "rgba(15,20,30,0.4)", code: "#ebedf0",
  },
  typography: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    fontFamilyMono: "'JetBrains Mono', monospace",
    fontFamilyDisplay: "'DM Sans', sans-serif",
    fontSizeBase: "14px", fontSizeSm: "12px", fontSizeLg: "16px",
    lineHeight: "1.6", letterSpacing: "-0.01em",
    fontWeightNormal: 400, fontWeightMedium: 500, fontWeightBold: 700,
  },
  shape: {
    cardRadius: "10px", buttonRadius: "7px", inputRadius: "9px",
    bubbleRadius: "16px", sidebarItemRadius: "6px",
    modalRadius: "14px", pillRadius: "999px", avatarRadius: "50%",
  },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px",
    sidebarPadding: "12px", messagePadding: "20px" },
  effects: {
    shadowSm: "0 1px 3px rgba(0,0,0,0.08)",
    shadowMd: "0 4px 14px rgba(0,0,0,0.1)",
    shadowLg: "0 12px 36px rgba(0,0,0,0.12)",
    shadowAccent: "0 0 14px rgba(44,110,138,0.18)",
    transitionSpeed: "0.14s", transitionEasing: "cubic-bezier(0.4,0,0.2,1)",
    glassBg: "rgba(244,245,247,0.82)", blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #2c6e8a 0%, #1e4f6a 100%)",
  },
};

// Stone — warm grey, muted green, grounded
export const themeStone = {
  meta: {
    id: "stone", name: "Stone", version: THEME_VERSION, author: "system",
    description: "Warm grey. Muted sage. Grounded and calm.",
    tags: ["light", "warm", "earth"], builtIn: true,
  },
  colors: {
    bg: "#f3f2ef", panel: "#eae9e4", sidebar: "#e1e0da",
    surface: "#fafaf8", surfaceHover: "#f0efeb",
    border: "rgba(80,75,60,0.11)", borderStrong: "rgba(80,75,60,0.22)",
    text: "#1e1d18", textMuted: "#6b6a5e", textSubtle: "#9e9d94",
    accent: "#5a7a52", accentHover: "#456040", accentFg: "#ffffff",
    accentSubtle: "rgba(90,122,82,0.09)",
    userBubble: "#5a7a52", userBubbleFg: "#ffffff",
    assistantBubble: "#eae9e4", assistantBubbleFg: "#1e1d18",
    inputBg: "#fafaf8", inputBorder: "rgba(80,75,60,0.13)",
    inputFocusBorder: "rgba(90,122,82,0.38)",
    danger: "#a83228", dangerSubtle: "rgba(168,50,40,0.07)",
    success: "#3a7252", warning: "#906a18",
    scrollbar: "#d4d3cc", overlay: "rgba(20,18,14,0.42)", code: "#eae9e4",
  },
  typography: {
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    fontFamilyMono: "'JetBrains Mono', monospace",
    fontFamilyDisplay: "'IBM Plex Sans', sans-serif",
    fontSizeBase: "14px", fontSizeSm: "12px", fontSizeLg: "16px",
    lineHeight: "1.65", letterSpacing: "0em",
    fontWeightNormal: 400, fontWeightMedium: 500, fontWeightBold: 700,
  },
  shape: {
    cardRadius: "9px", buttonRadius: "7px", inputRadius: "8px",
    bubbleRadius: "15px", sidebarItemRadius: "6px",
    modalRadius: "13px", pillRadius: "999px", avatarRadius: "50%",
  },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px",
    sidebarPadding: "12px", messagePadding: "20px" },
  effects: {
    shadowSm: "0 1px 3px rgba(0,0,0,0.07)",
    shadowMd: "0 4px 14px rgba(0,0,0,0.09)",
    shadowLg: "0 12px 36px rgba(0,0,0,0.11)",
    shadowAccent: "0 0 14px rgba(90,122,82,0.16)",
    transitionSpeed: "0.14s", transitionEasing: "cubic-bezier(0.4,0,0.2,1)",
    glassBg: "rgba(243,242,239,0.82)", blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #5a7a52 0%, #4a8a6e 100%)",
  },
};

// ─────────────────────────────────────────
// MODE DEFAULTS
// ─────────────────────────────────────────
export const themeDark = {
  ...themeVoid,
  meta: { ...themeVoid.meta, id: "dark", name: "Dark", description: "System dark", builtIn: true },
};

export const themeLight = {
  ...themeSlate,
  meta: { ...themeSlate.meta, id: "light", name: "Light", description: "System light", builtIn: true },
};

// ─────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────
export const BUILT_IN_THEMES = [
  themeVoid,
  themeObsidian,
  themeTerrain,
  themeParchment,
  themeSlate,
  themeStone,
];

export const DEFAULT_THEME_ID = "void";

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
export const findTheme = (themes, id) =>
  themes.find((t) => t.meta.id === id) || themes[0];

export const isValidTheme = (obj) => {
  try {
    return obj && typeof obj === "object" &&
      obj.meta?.id && obj.meta?.name &&
      obj.colors?.bg && obj.colors?.accent &&
      obj.typography?.fontFamily && obj.shape?.cardRadius;
  } catch { return false; }
};

export const createBlankTheme = (base = themeVoid) => ({
  ...JSON.parse(JSON.stringify(base)),
  meta: {
    ...base.meta,
    id: `custom-${Date.now()}`,
    name: "My Theme",
    author: "custom",
    description: "",
    tags: ["custom"],
    builtIn: false,
  },
});

export const applyThemeToCSSVars = (theme) => {
  const root = document.documentElement;
  const c = theme.colors;
  const t = theme.typography;
  const s = theme.shape;
  const sp = theme.spacing;
  const e = theme.effects;
  const vars = {
    "--color-bg": c.bg, "--color-panel": c.panel, "--color-sidebar": c.sidebar,
    "--color-surface": c.surface, "--color-surface-hover": c.surfaceHover,
    "--color-border": c.border, "--color-border-strong": c.borderStrong,
    "--color-text": c.text, "--color-text-muted": c.textMuted, "--color-text-subtle": c.textSubtle,
    "--color-accent": c.accent, "--color-accent-hover": c.accentHover,
    "--color-accent-fg": c.accentFg, "--color-accent-subtle": c.accentSubtle,
    "--color-user-bubble": c.userBubble, "--color-user-bubble-fg": c.userBubbleFg,
    "--color-assistant-bubble": c.assistantBubble, "--color-assistant-bubble-fg": c.assistantBubbleFg,
    "--color-input-bg": c.inputBg, "--color-input-border": c.inputBorder,
    "--color-input-focus-border": c.inputFocusBorder,
    "--color-danger": c.danger, "--color-danger-subtle": c.dangerSubtle,
    "--color-success": c.success, "--color-warning": c.warning,
    "--color-scrollbar": c.scrollbar, "--color-overlay": c.overlay, "--color-code": c.code,
    "--font-family": t.fontFamily, "--font-family-mono": t.fontFamilyMono,
    "--font-family-display": t.fontFamilyDisplay,
    "--font-size-base": t.fontSizeBase, "--font-size-sm": t.fontSizeSm, "--font-size-lg": t.fontSizeLg,
    "--line-height": t.lineHeight, "--letter-spacing": t.letterSpacing,
    "--radius-card": s.cardRadius, "--radius-button": s.buttonRadius,
    "--radius-input": s.inputRadius, "--radius-bubble": s.bubbleRadius,
    "--radius-sidebar-item": s.sidebarItemRadius, "--radius-modal": s.modalRadius,
    "--radius-pill": s.pillRadius, "--radius-avatar": s.avatarRadius,
    "--spacing-xs": sp.xs, "--spacing-sm": sp.sm, "--spacing-md": sp.md,
    "--spacing-lg": sp.lg, "--spacing-xl": sp.xl,
    "--spacing-sidebar": sp.sidebarPadding, "--spacing-message": sp.messagePadding,
    "--shadow-sm": e.shadowSm, "--shadow-md": e.shadowMd, "--shadow-lg": e.shadowLg,
    "--shadow-accent": e.shadowAccent,
    "--transition-speed": e.transitionSpeed, "--transition-easing": e.transitionEasing,
    "--glass-bg": e.glassBg, "--blur-amount": e.blurAmount,
    "--gradient-accent": e.gradientAccent,
  };
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
};
