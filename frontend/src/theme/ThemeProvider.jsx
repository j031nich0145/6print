// ============================================================
// 🎨 ThemeProvider.jsx
// Context + localStorage + system preference detection
// Manages built-in and custom themes
// ============================================================

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  findTheme,
  isValidTheme,
  applyThemeToCSSVars,
  themeLight,
  themeDark,
} from "./themes";

const ThemeContext = createContext(null);

const STORAGE_KEY_ACTIVE = "sf_theme_active";
const STORAGE_KEY_CUSTOM = "sf_theme_custom";
const STORAGE_KEY_MODE = "sf_theme_mode"; // "light" | "dark" | "system" | (theme id)

export function ThemeProvider({ children }) {
  // All themes = built-ins + user's custom ones
  const [customThemes, setCustomThemes] = useState([]);
  const allThemes = [...BUILT_IN_THEMES, ...customThemes];

  // Active theme object
  const [activeTheme, setActiveTheme] = useState(BUILT_IN_THEMES[0]);

  // "system" | "light" | "dark" | theme.meta.id
  const [mode, setMode] = useState("dark");

  // Prevents persist effects from running before load completes
  const [loaded, setLoaded] = useState(false);

  // Whether the theme editor panel is open
  const [editorOpen, setEditorOpen] = useState(false);

  // System color scheme preference
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // ─────────────────────────────────────
  // LOAD SAVED STATE
  // ─────────────────────────────────────
  useEffect(() => {
    // Load custom themes
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomThemes(parsed.filter(isValidTheme));
        }
      }
    } catch {}

    // Load saved mode
    const savedMode = localStorage.getItem(STORAGE_KEY_MODE) || DEFAULT_THEME_ID;
    setMode(savedMode);
    setLoaded(true);
  }, []);

  // ─────────────────────────────────────
  // LISTEN TO SYSTEM PREFERENCE
  // ─────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemPrefersDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ─────────────────────────────────────
  // RESOLVE ACTIVE THEME FROM MODE
  // ─────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;

    let resolved;

    if (mode === "system") {
      resolved = systemPrefersDark ? themeDark : themeLight;
    } else if (mode === "light") {
      resolved = themeLight;
    } else if (mode === "dark") {
      resolved = themeDark;
    } else {
      resolved = findTheme(allThemes, mode);
    }

    setActiveTheme(resolved);
    applyThemeToCSSVars(resolved);
    document.documentElement.setAttribute("data-theme", resolved.meta.id);
  }, [mode, systemPrefersDark, customThemes, loaded]); // eslint-disable-line

  // ─────────────────────────────────────
  // PERSIST MODE
  // ─────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_MODE, mode);
  }, [mode, loaded]);

  // ─────────────────────────────────────
  // PERSIST CUSTOM THEMES
  // ─────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customThemes));
  }, [customThemes, loaded]);

  // ─────────────────────────────────────
  // API
  // ─────────────────────────────────────

  /** Switch to a theme by ID or mode keyword */
  const switchTheme = useCallback((idOrMode) => {
    setMode(idOrMode);
    localStorage.setItem(STORAGE_KEY_MODE, idOrMode);
  }, []);

  /** Add or update a custom theme. Also immediately persists + applies. */
  const saveCustomTheme = useCallback((theme) => {
    if (!isValidTheme(theme)) {
      console.warn("Invalid theme object:", theme);
      return false;
    }

    setCustomThemes((prev) => {
      const existing = prev.findIndex((t) => t.meta.id === theme.meta.id);
      let next;
      if (existing >= 0) {
        next = [...prev];
        next[existing] = theme;
      } else {
        next = [...prev, theme];
      }
      // Persist immediately so it survives even if effects don't run
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(next));
      return next;
    });

    // Apply CSS vars right now, don't wait for the effect cycle
    applyThemeToCSSVars(theme);
    setActiveTheme(theme);

    return true;
  }, []);

  /** Delete a custom theme by ID */
  const deleteCustomTheme = useCallback((id) => {
    setCustomThemes((prev) => prev.filter((t) => t.meta.id !== id));
    // If we're currently using it, fall back to default
    if (mode === id) setMode(DEFAULT_THEME_ID);
  }, [mode]);

  /** Import a theme from a JSON string (for share/paste) */
  const importTheme = useCallback((jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      // Handle single theme or array
      const themes = Array.isArray(parsed) ? parsed : [parsed];
      const valid = themes.filter(isValidTheme);
      if (valid.length === 0) return { success: false, error: "No valid themes found" };

      valid.forEach((t) => {
        // Force non-built-in
        t.meta.builtIn = false;
        // Ensure unique ID
        if (BUILT_IN_THEMES.find((b) => b.meta.id === t.meta.id)) {
          t.meta.id = `${t.meta.id}-imported`;
        }
        saveCustomTheme(t);
      });

      return { success: true, count: valid.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [saveCustomTheme]);

  /** Export a theme as a JSON string */
  const exportTheme = useCallback((id) => {
    const theme = findTheme(allThemes, id || activeTheme.meta.id);
    return JSON.stringify(theme, null, 2);
  }, [allThemes, activeTheme]);

  /** Download a theme as a .json file */
  const downloadTheme = useCallback((id) => {
    const theme = findTheme(allThemes, id || activeTheme.meta.id);
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${theme.meta.id}-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allThemes, activeTheme]);

  /** Download ALL custom themes as a bundle */
  const downloadAllCustomThemes = useCallback(() => {
    const blob = new Blob([JSON.stringify(customThemes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-themes-bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [customThemes]);

  const value = {
    // State
    theme: activeTheme,
    mode,
    allThemes,
    builtInThemes: BUILT_IN_THEMES,
    customThemes,
    editorOpen,

    // Actions
    switchTheme,
    setEditorOpen,
    saveCustomTheme,
    deleteCustomTheme,
    importTheme,
    exportTheme,
    downloadTheme,
    downloadAllCustomThemes,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
};
