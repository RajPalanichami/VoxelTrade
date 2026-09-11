export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "pro-trader-theme";

export function normalizeTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export function readStoredTheme(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

export function chartPalette() {
  const s = getComputedStyle(document.documentElement);
  const rgb = (name: string) => {
    const parts = s.getPropertyValue(name).trim().split(/\s+/).filter(Boolean).join(", ");
    return `rgb(${parts})`;
  };
  return {
    background: rgb("--chart"),
    text: rgb("--chart-text"),
    grid: s.getPropertyValue("--chart-grid").trim(),
    border: s.getPropertyValue("--chart-border").trim(),
  };
}
