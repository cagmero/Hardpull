import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: "hsl(var(--card))",
        clear: "hsl(var(--clear))",
        warning: "hsl(var(--warning))",
        critical: "hsl(var(--critical))",
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 4px)", sm: "calc(var(--radius) - 6px)" },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      transitionTimingFunction: { out: "cubic-bezier(0, 0, 0.2, 1)", move: "cubic-bezier(0.4, 0, 0.2, 1)" },
      boxShadow: {
        subtle: "0 1px 2px hsl(240 10% 4% / 0.04), 0 1px 3px hsl(240 10% 4% / 0.06)",
        lift: "0 8px 24px -8px hsl(240 10% 4% / 0.14), 0 2px 6px hsl(240 10% 4% / 0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
