export type Theme = "light" | "dark";

/**
 * JS mirror of the CSS theme tokens. SVG presentation attributes (Recharts fills,
 * strokes) cannot read CSS variables, so charts read concrete hex values from here
 * via the theme context. Keep these in sync with globals.css.
 */
export interface Palette {
  background: string;
  surface: string;
  card: string;
  border: string;
  borderStrong: string;
  foreground: string;
  muted: string;
  accent: string;
  success: string;
  danger: string;
  warning: string;
  grid: string;
}

export const PALETTES: Record<Theme, Palette> = {
  dark: {
    background: "#0d1017",
    surface: "#141821",
    card: "#151a24",
    border: "#242b38",
    borderStrong: "#303949",
    foreground: "#e8ebf1",
    muted: "#8a93a6",
    accent: "#4f7dff",
    success: "#34d399",
    danger: "#f87171",
    warning: "#fbbf24",
    grid: "#242b38",
  },
  light: {
    background: "#f5f7fa",
    surface: "#ffffff",
    card: "#ffffff",
    border: "#e4e8ef",
    borderStrong: "#d3d9e3",
    foreground: "#1b2230",
    muted: "#5d6675",
    accent: "#2f6fed",
    success: "#15a06a",
    danger: "#dc4c4c",
    warning: "#b9821a",
    grid: "#e4e8ef",
  },
};

export const THEME_STORAGE_KEY = "mc-theme";
export const DEFAULT_THEME: Theme = "dark";
