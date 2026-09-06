export type Theme = "night" | "day";

const KEY = "along.theme";

export function readTheme(): Theme {
  if (typeof window === "undefined") return "day";
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "day" || v === "night") return v;
  } catch {
    /* ignore */
  }
  return "day";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}