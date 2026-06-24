"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_THEME,
  PALETTES,
  THEME_STORAGE_KEY,
  type Palette,
  type Theme,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: Theme;
  palette: Palette;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialized from the attribute the inline script already applied, so the
  // first client render matches the server-painted theme (no flash, no mismatch).
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  const apply = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, t);
      } catch {
        // ignore storage failures (private mode, etc.)
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    apply(theme === "dark" ? "light" : "dark");
  }, [theme, apply]);

  // Keep state in sync if the attribute was changed before hydration.
  useEffect(() => {
    const current = readInitialTheme();
    if (current !== theme) setThemeState(current);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, palette: PALETTES[theme], toggleTheme, setTheme: apply }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback so server components / tests that render without the provider
    // still get sensible values.
    return {
      theme: DEFAULT_THEME,
      palette: PALETTES[DEFAULT_THEME],
      toggleTheme: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}
