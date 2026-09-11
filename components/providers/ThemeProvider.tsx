"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { applyTheme, persistTheme, readStoredTheme, Theme } from "@/lib/theme";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
}

const C = createContext<ThemeCtx | null>(null);

export function useTheme() {
  const v = useContext(C);
  if (!v) throw new Error("useTheme");
  return v;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "light" : readStoredTheme();
    setTheme(next);
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      persistTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  return <C.Provider value={{ theme, toggleTheme }}>{children}</C.Provider>;
}
