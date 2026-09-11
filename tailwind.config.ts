import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  /* Theme tokens live in globals.css --navy/--panel/--line so light mode can remaps surfaces. */
  theme: {
    extend: {
      colors: {
        navy: "rgb(var(--navy) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        panel2: "rgb(var(--panel2) / <alpha-value>)",
        line: "rgb(var(--line) / var(--line-alpha))",
        bull: "#4ade80",
        bear: "#f87171",
        warn: "#fbbf24",
        accent: "#3b82f6",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(74, 222, 128, 0.15)",
        panel: "0 0 0 1px rgb(var(--line) / var(--line-alpha)), 0 12px 40px rgb(var(--shadow) / var(--shadow-alpha))",
      },
    },
  },
  plugins: [],
};

export default config;
