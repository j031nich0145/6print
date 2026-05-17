// ============================================================
// 🎨 UNIVERSAL THEME SYSTEM — themes.js
// Schema-first theme objects. Every key is intentional.
// Import this anywhere and render consistently across all apps.
// ============================================================

export const THEME_VERSION = "1.0.0";

// ─────────────────────────────────────────
// SCHEMA DOCUMENTATION
// Use this as the blueprint for custom themes.
// ─────────────────────────────────────────
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
    // Core surfaces
    bg: "string — page/root background",
    panel: "string — secondary panels, modals",
    sidebar: "string — sidebar background",
    surface: "string — cards, elevated surfaces",
    surfaceHover: "string — hovered surface",

    // Borders
    border: "string — default border color",
    borderStrong: "string — emphasized border",

    // Text
    text: "string — primary text",
    textMuted: "string — secondary text",
    textSubtle: "string — placeholder, disabled",

    // Accent (brand color)
    accent: "string — primary accent",
    accentHover: "string — accent on hover",
    accentFg: "string — text/icons on accent bg",
    accentSubtle: "string — tinted accent bg",

    // Chat bubbles
    userBubble: "string — user message bg",
    userBubbleFg: "string — user message text",
    assistantBubble: "string — assistant message bg",
    assistantBubbleFg: "string — assistant message text",

    // Input
    inputBg: "string — textarea/input background",
    inputBorder: "string — input border",
    inputFocusBorder: "string — focused input border",

    // Semantic
    danger: "string — destructive actions",
    dangerSubtle: "string — danger tinted bg",
    success: "string — confirmations",
    warning: "string — warnings",

    // Misc
    scrollbar: "string — scrollbar track/thumb",
    overlay: "string — modal backdrop",
    code: "string — inline code bg",
  },

  typography: {
    fontFamily: "string — body/UI font stack",
    fontFamilyMono: "string — code/mono font stack",
    fontFamilyDisplay: "string — headings/display font",
    fontSizeBase: "string — base font size (px)",
    fontSizeSm: "string — small text",
    fontSizeLg: "string — large text",
    lineHeight: "string — default line height",
    letterSpacing: "string — default letter spacing",
    fontWeightNormal: "number",
    fontWeightMedium: "number",
    fontWeightBold: "number",
  },

  shape: {
    cardRadius: "string — cards, panels",
    buttonRadius: "string — buttons",
    inputRadius: "string — inputs, textareas",
    bubbleRadius: "string — chat bubbles",
    sidebarItemRadius: "string — sidebar list items",
    modalRadius: "string — modals/dialogs",
    pillRadius: "string — tags, badges",
    avatarRadius: "string — avatar roundness",
  },

  spacing: {
    xs: "string — 4px equivalent",
    sm: "string — 8px equivalent",
    md: "string — 16px equivalent",
    lg: "string — 24px equivalent",
    xl: "string — 32px equivalent",
    sidebarPadding: "string",
    messagePadding: "string",
  },

  effects: {
    shadowSm: "string — subtle shadow",
    shadowMd: "string — card shadow",
    shadowLg: "string — elevated shadow",
    shadowAccent: "string — glowing accent shadow",
    transitionSpeed: "string — default animation speed",
    transitionEasing: "string — cubic-bezier or named",
    glassBg: "string — glassmorphism background",
    blurAmount: "string — backdrop-filter blur",
    gradientAccent: "string — optional accent gradient",
  },
};

// ─────────────────────────────────────────
// BUILT-IN THEME: VOID
// Ultra-dark minimal. Pure focus mode.
// ─────────────────────────────────────────
export const themeVoid = {
  meta: {
    id: "void",
    name: "Void",
    version: THEME_VERSION,
    author: "system",
    description: "Ultra-dark. Maximum focus. Ink on night.",
    tags: ["dark", "minimal", "professional"],
    builtIn: true,
  },
  colors: {
    bg: "#0a0a0a",
    panel: "#111111",
    sidebar: "#0d0d0d",
    surface: "#161616",
    surfaceHover: "#1e1e1e",
    border: "rgba(255,255,255,0.07)",
    borderStrong: "rgba(255,255,255,0.15)",
    text: "#e2e2e2",
    textMuted: "#888888",
    textSubtle: "#555555",
    accent: "#6366f1",
    accentHover: "#4f52d0",
    accentFg: "#ffffff",
    accentSubtle: "rgba(99,102,241,0.12)",
    userBubble: "#6366f1",
    userBubbleFg: "#ffffff",
    assistantBubble: "#161616",
    assistantBubbleFg: "#e2e2e2",
    inputBg: "#111111",
    inputBorder: "rgba(255,255,255,0.08)",
    inputFocusBorder: "rgba(99,102,241,0.6)",
    danger: "#ef4444",
    dangerSubtle: "rgba(239,68,68,0.12)",
    success: "#22c55e",
    warning: "#f59e0b",
    scrollbar: "#1f1f1f",
    overlay: "rgba(0,0,0,0.7)",
    code: "#1a1a1a",
  },
  typography: {
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
    fontFamilyDisplay: "'Syne', 'DM Sans', sans-serif",
    fontSizeBase: "14px",
    fontSizeSm: "12px",
    fontSizeLg: "16px",
    lineHeight: "1.6",
    letterSpacing: "-0.01em",
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
  },
  shape: {
    cardRadius: "12px",
    buttonRadius: "8px",
    inputRadius: "10px",
    bubbleRadius: "18px",
    sidebarItemRadius: "8px",
    modalRadius: "16px",
    pillRadius: "999px",
    avatarRadius: "50%",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    sidebarPadding: "12px",
    messagePadding: "20px",
  },
  effects: {
    shadowSm: "0 1px 4px rgba(0,0,0,0.3)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.5)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.6)",
    shadowAccent: "0 0 20px rgba(99,102,241,0.3)",
    transitionSpeed: "0.15s",
    transitionEasing: "cubic-bezier(0.4, 0, 0.2, 1)",
    glassBg: "rgba(255,255,255,0.03)",
    blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  },
};

// ─────────────────────────────────────────
// BUILT-IN THEME: ANTHROPIC
// Warm dark. Like thinking beside a fireplace.
// ─────────────────────────────────────────
export const themeAnthropic = {
  meta: {
    id: "anthropic",
    name: "Anthropic",
    version: THEME_VERSION,
    author: "system",
    description: "Warm dark. Terracotta accents. Like Claude.ai.",
    tags: ["dark", "warm", "professional"],
    builtIn: true,
  },
  colors: {
    bg: "#1a1612",
    panel: "#221e18",
    sidebar: "#181410",
    surface: "#2a2420",
    surfaceHover: "#332e28",
    border: "rgba(255,220,180,0.08)",
    borderStrong: "rgba(255,220,180,0.16)",
    text: "#f0ebe3",
    textMuted: "#9c9080",
    textSubtle: "#665a4e",
    accent: "#d97757",
    accentHover: "#c4623e",
    accentFg: "#ffffff",
    accentSubtle: "rgba(217,119,87,0.12)",
    userBubble: "#d97757",
    userBubbleFg: "#ffffff",
    assistantBubble: "#2a2420",
    assistantBubbleFg: "#f0ebe3",
    inputBg: "#221e18",
    inputBorder: "rgba(255,220,180,0.1)",
    inputFocusBorder: "rgba(217,119,87,0.5)",
    danger: "#ef4444",
    dangerSubtle: "rgba(239,68,68,0.12)",
    success: "#22c55e",
    warning: "#f59e0b",
    scrollbar: "#2e2822",
    overlay: "rgba(10,8,6,0.75)",
    code: "#1f1b16",
  },
  typography: {
    fontFamily: "'Tiempos Text', 'Georgia', serif",
    fontFamilyMono: "'Berkeley Mono', 'JetBrains Mono', monospace",
    fontFamilyDisplay: "'Tiempos Headline', 'Georgia', serif",
    fontSizeBase: "15px",
    fontSizeSm: "13px",
    fontSizeLg: "17px",
    lineHeight: "1.7",
    letterSpacing: "0em",
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
  },
  shape: {
    cardRadius: "10px",
    buttonRadius: "8px",
    inputRadius: "10px",
    bubbleRadius: "16px",
    sidebarItemRadius: "8px",
    modalRadius: "14px",
    pillRadius: "999px",
    avatarRadius: "50%",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    sidebarPadding: "12px",
    messagePadding: "24px",
  },
  effects: {
    shadowSm: "0 1px 4px rgba(0,0,0,0.4)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.5)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.6)",
    shadowAccent: "0 0 20px rgba(217,119,87,0.25)",
    transitionSpeed: "0.18s",
    transitionEasing: "cubic-bezier(0.4, 0, 0.2, 1)",
    glassBg: "rgba(255,220,180,0.03)",
    blurAmount: "10px",
    gradientAccent: "linear-gradient(135deg, #d97757 0%, #e8956a 100%)",
  },
};

// ─────────────────────────────────────────
// BUILT-IN THEME: GEMSTONE
// Dark teal. Structured. Scientific.
// ─────────────────────────────────────────
export const themeGemstone = {
  meta: {
    id: "gemstone",
    name: "Gemstone",
    version: THEME_VERSION,
    author: "system",
    description: "Deep teal dark. Gemini-adjacent. Precise and alive.",
    tags: ["dark", "teal", "cool"],
    builtIn: true,
  },
  colors: {
    bg: "#0d1117",
    panel: "#131920",
    sidebar: "#0a0f14",
    surface: "#1a2332",
    surfaceHover: "#202c3e",
    border: "rgba(100,200,200,0.08)",
    borderStrong: "rgba(100,200,200,0.18)",
    text: "#dde8f0",
    textMuted: "#7a9bb5",
    textSubtle: "#4a6680",
    accent: "#26d0ce",
    accentHover: "#1ab5b3",
    accentFg: "#000000",
    accentSubtle: "rgba(38,208,206,0.1)",
    userBubble: "#26d0ce",
    userBubbleFg: "#001a1a",
    assistantBubble: "#1a2332",
    assistantBubbleFg: "#dde8f0",
    inputBg: "#131920",
    inputBorder: "rgba(100,200,200,0.1)",
    inputFocusBorder: "rgba(38,208,206,0.5)",
    danger: "#ff5c72",
    dangerSubtle: "rgba(255,92,114,0.1)",
    success: "#22c55e",
    warning: "#fbbf24",
    scrollbar: "#1a2332",
    overlay: "rgba(5,10,16,0.8)",
    code: "#111820",
  },
  typography: {
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    fontFamilyMono: "'IBM Plex Mono', 'Fira Code', monospace",
    fontFamilyDisplay: "'IBM Plex Sans', sans-serif",
    fontSizeBase: "14px",
    fontSizeSm: "12px",
    fontSizeLg: "16px",
    lineHeight: "1.6",
    letterSpacing: "0em",
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
  },
  shape: {
    cardRadius: "8px",
    buttonRadius: "6px",
    inputRadius: "8px",
    bubbleRadius: "14px",
    sidebarItemRadius: "6px",
    modalRadius: "12px",
    pillRadius: "4px",
    avatarRadius: "6px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    sidebarPadding: "12px",
    messagePadding: "20px",
  },
  effects: {
    shadowSm: "0 1px 4px rgba(0,0,0,0.4)",
    shadowMd: "0 4px 20px rgba(0,0,0,0.5)",
    shadowLg: "0 12px 48px rgba(0,0,0,0.6)",
    shadowAccent: "0 0 24px rgba(38,208,206,0.2)",
    transitionSpeed: "0.12s",
    transitionEasing: "cubic-bezier(0.2, 0, 0, 1)",
    glassBg: "rgba(38,208,206,0.04)",
    blurAmount: "16px",
    gradientAccent: "linear-gradient(135deg, #26d0ce 0%, #1a9df0 100%)",
  },
};

// ─────────────────────────────────────────
// BUILT-IN THEME: TERMINAL
// Amber CRT. Retro hacker. Phosphor glow.
// ─────────────────────────────────────────
export const themeTerminal = {
  meta: {
    id: "terminal",
    name: "Terminal",
    version: THEME_VERSION,
    author: "system",
    description: "Amber phosphor CRT. Maximum hacker energy.",
    tags: ["dark", "retro", "mono", "hacker"],
    builtIn: true,
  },
  colors: {
    bg: "#080a06",
    panel: "#0d1009",
    sidebar: "#060800",
    surface: "#111508",
    surfaceHover: "#181c0e",
    border: "rgba(180,220,80,0.12)",
    borderStrong: "rgba(180,220,80,0.25)",
    text: "#b4dc50",
    textMuted: "#6e8a30",
    textSubtle: "#3d5018",
    accent: "#b4dc50",
    accentHover: "#c8f060",
    accentFg: "#080a06",
    accentSubtle: "rgba(180,220,80,0.08)",
    userBubble: "#1a2208",
    userBubbleFg: "#c8f060",
    assistantBubble: "#0d1009",
    assistantBubbleFg: "#b4dc50",
    inputBg: "#0d1009",
    inputBorder: "rgba(180,220,80,0.15)",
    inputFocusBorder: "rgba(180,220,80,0.5)",
    danger: "#ff4444",
    dangerSubtle: "rgba(255,68,68,0.08)",
    success: "#b4dc50",
    warning: "#ffc107",
    scrollbar: "#111508",
    overlay: "rgba(0,0,0,0.85)",
    code: "#0a0d06",
  },
  typography: {
    fontFamily: "'Berkeley Mono', 'JetBrains Mono', 'Courier New', monospace",
    fontFamilyMono: "'Berkeley Mono', 'JetBrains Mono', monospace",
    fontFamilyDisplay: "'VT323', 'JetBrains Mono', monospace",
    fontSizeBase: "14px",
    fontSizeSm: "12px",
    fontSizeLg: "16px",
    lineHeight: "1.6",
    letterSpacing: "0.02em",
    fontWeightNormal: 400,
    fontWeightMedium: 400,
    fontWeightBold: 700,
  },
  shape: {
    cardRadius: "2px",
    buttonRadius: "2px",
    inputRadius: "2px",
    bubbleRadius: "4px",
    sidebarItemRadius: "2px",
    modalRadius: "2px",
    pillRadius: "2px",
    avatarRadius: "2px",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    sidebarPadding: "12px",
    messagePadding: "20px",
  },
  effects: {
    shadowSm: "0 0 4px rgba(180,220,80,0.1)",
    shadowMd: "0 0 12px rgba(180,220,80,0.08)",
    shadowLg: "0 0 32px rgba(180,220,80,0.06)",
    shadowAccent: "0 0 16px rgba(180,220,80,0.4), 0 0 32px rgba(180,220,80,0.2)",
    transitionSpeed: "0.08s",
    transitionEasing: "steps(4)",
    glassBg: "rgba(180,220,80,0.03)",
    blurAmount: "0px",
    gradientAccent: "none",
  },
};

// ─────────────────────────────────────────
// BUILT-IN THEME: IVORY
// Clean warm light. Like a premium paper notebook.
// ─────────────────────────────────────────
export const themeIvory = {
  meta: {
    id: "ivory",
    name: "Ivory",
    version: THEME_VERSION,
    author: "system",
    description: "Warm light. Paper-white. ChatGPT-adjacent refinement.",
    tags: ["light", "warm", "minimal", "clean"],
    builtIn: true,
  },
  colors: {
    bg: "#faf9f7",
    panel: "#f3f1ed",
    sidebar: "#edeae4",
    surface: "#ffffff",
    surfaceHover: "#f5f3ef",
    border: "rgba(0,0,0,0.08)",
    borderStrong: "rgba(0,0,0,0.15)",
    text: "#1a1814",
    textMuted: "#6b6560",
    textSubtle: "#a09990",
    accent: "#2563eb",
    accentHover: "#1d4ed8",
    accentFg: "#ffffff",
    accentSubtle: "rgba(37,99,235,0.08)",
    userBubble: "#2563eb",
    userBubbleFg: "#ffffff",
    assistantBubble: "#ffffff",
    assistantBubbleFg: "#1a1814",
    inputBg: "#ffffff",
    inputBorder: "rgba(0,0,0,0.12)",
    inputFocusBorder: "rgba(37,99,235,0.5)",
    danger: "#dc2626",
    dangerSubtle: "rgba(220,38,38,0.08)",
    success: "#16a34a",
    warning: "#d97706",
    scrollbar: "#e0ddd8",
    overlay: "rgba(0,0,0,0.4)",
    code: "#f0ede8",
  },
  typography: {
    fontFamily: "'Lora', 'Georgia', serif",
    fontFamilyMono: "'JetBrains Mono', 'Courier New', monospace",
    fontFamilyDisplay: "'Lora', 'Georgia', serif",
    fontSizeBase: "15px",
    fontSizeSm: "13px",
    fontSizeLg: "17px",
    lineHeight: "1.7",
    letterSpacing: "0em",
    fontWeightNormal: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
  },
  shape: {
    cardRadius: "12px",
    buttonRadius: "8px",
    inputRadius: "12px",
    bubbleRadius: "20px",
    sidebarItemRadius: "8px",
    modalRadius: "16px",
    pillRadius: "999px",
    avatarRadius: "50%",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    sidebarPadding: "12px",
    messagePadding: "24px",
  },
  effects: {
    shadowSm: "0 1px 3px rgba(0,0,0,0.06)",
    shadowMd: "0 4px 16px rgba(0,0,0,0.08)",
    shadowLg: "0 12px 40px rgba(0,0,0,0.12)",
    shadowAccent: "0 0 20px rgba(37,99,235,0.15)",
    transitionSpeed: "0.15s",
    transitionEasing: "cubic-bezier(0.4, 0, 0.2, 1)",
    glassBg: "rgba(255,255,255,0.8)",
    blurAmount: "12px",
    gradientAccent: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
  },
};

// ─────────────────────────────────────────
// LIGHT THEME (System Auto)
// ─────────────────────────────────────────
export const themeLight = {
  ...themeIvory,
  meta: {
    ...themeIvory.meta,
    id: "light",
    name: "Light",
    description: "Clean system light theme",
    builtIn: true,
  },
};

// ─────────────────────────────────────────
// DARK THEME (System Auto)
// ─────────────────────────────────────────
export const themeDark = {
  ...themeVoid,
  meta: {
    ...themeVoid.meta,
    id: "dark",
    name: "Dark",
    description: "Clean system dark theme",
    builtIn: true,
  },
};

// ─────────────────────────────────────────
// ALL BUILT-IN THEMES REGISTRY
// ─────────────────────────────────────────
export const BUILT_IN_THEMES = [
  themeVoid,
  themeAnthropic,
  themeGemstone,
  themeTerminal,
  themeIvory,
];

export const DEFAULT_THEME_ID = "void";

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

/** Get a theme by ID from an array */
export const findTheme = (themes, id) =>
  themes.find((t) => t.meta.id === id) || themes[0];

/** Validate that an object looks like a valid theme */
export const isValidTheme = (obj) => {
  try {
    return (
      obj &&
      typeof obj === "object" &&
      obj.meta?.id &&
      obj.meta?.name &&
      obj.colors?.bg &&
      obj.colors?.accent &&
      obj.typography?.fontFamily &&
      obj.shape?.cardRadius
    );
  } catch {
    return false;
  }
};

/** Create a blank custom theme scaffold for the editor */
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

/** Apply a theme to CSS custom properties on :root */
export const applyThemeToCSSVars = (theme) => {
  const root = document.documentElement;
  const c = theme.colors;
  const t = theme.typography;
  const s = theme.shape;
  const sp = theme.spacing;
  const e = theme.effects;

  const vars = {
    "--color-bg": c.bg,
    "--color-panel": c.panel,
    "--color-sidebar": c.sidebar,
    "--color-surface": c.surface,
    "--color-surface-hover": c.surfaceHover,
    "--color-border": c.border,
    "--color-border-strong": c.borderStrong,
    "--color-text": c.text,
    "--color-text-muted": c.textMuted,
    "--color-text-subtle": c.textSubtle,
    "--color-accent": c.accent,
    "--color-accent-hover": c.accentHover,
    "--color-accent-fg": c.accentFg,
    "--color-accent-subtle": c.accentSubtle,
    "--color-user-bubble": c.userBubble,
    "--color-user-bubble-fg": c.userBubbleFg,
    "--color-assistant-bubble": c.assistantBubble,
    "--color-assistant-bubble-fg": c.assistantBubbleFg,
    "--color-input-bg": c.inputBg,
    "--color-input-border": c.inputBorder,
    "--color-input-focus-border": c.inputFocusBorder,
    "--color-danger": c.danger,
    "--color-danger-subtle": c.dangerSubtle,
    "--color-success": c.success,
    "--color-warning": c.warning,
    "--color-scrollbar": c.scrollbar,
    "--color-overlay": c.overlay,
    "--color-code": c.code,
    "--font-family": t.fontFamily,
    "--font-family-mono": t.fontFamilyMono,
    "--font-family-display": t.fontFamilyDisplay,
    "--font-size-base": t.fontSizeBase,
    "--font-size-sm": t.fontSizeSm,
    "--font-size-lg": t.fontSizeLg,
    "--line-height": t.lineHeight,
    "--letter-spacing": t.letterSpacing,
    "--radius-card": s.cardRadius,
    "--radius-button": s.buttonRadius,
    "--radius-input": s.inputRadius,
    "--radius-bubble": s.bubbleRadius,
    "--radius-sidebar-item": s.sidebarItemRadius,
    "--radius-modal": s.modalRadius,
    "--radius-pill": s.pillRadius,
    "--radius-avatar": s.avatarRadius,
    "--spacing-xs": sp.xs,
    "--spacing-sm": sp.sm,
    "--spacing-md": sp.md,
    "--spacing-lg": sp.lg,
    "--spacing-xl": sp.xl,
    "--spacing-sidebar": sp.sidebarPadding,
    "--spacing-message": sp.messagePadding,
    "--shadow-sm": e.shadowSm,
    "--shadow-md": e.shadowMd,
    "--shadow-lg": e.shadowLg,
    "--shadow-accent": e.shadowAccent,
    "--transition-speed": e.transitionSpeed,
    "--transition-easing": e.transitionEasing,
    "--glass-bg": e.glassBg,
    "--blur-amount": e.blurAmount,
    "--gradient-accent": e.gradientAccent,
  };

  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
};