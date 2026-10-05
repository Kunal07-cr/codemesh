import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1117",
        panel: "#111820",
        line: "#243141",
        steel: "#8da2b8",
        mint: "rgb(var(--cm-accent-rgb) / <alpha-value>)",
        cyan: "#56c7e8",
        violet: "#a78bfa",
        rose: "#f472b6",
        amber: "#f2b86b",
        coral: "#ef746f"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
