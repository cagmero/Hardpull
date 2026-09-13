import type { Config } from "tailwindcss";

// Tokens live in app/globals.css as HSL channel triples; this maps them onto Tailwind's scale so
// utilities like bg-primary/10 and text-muted-foreground work and no component ever needs a raw
// hex value.
export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem" },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        clear: { DEFAULT: "hsl(var(--clear))", foreground: "hsl(var(--clear-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        critical: { DEFAULT: "hsl(var(--critical))", foreground: "hsl(var(--critical-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // Apple-ish display sizing: tight tracking and leading only at large sizes, where loose
      // defaults read as amateurish.
      fontSize: {
        display: ["clamp(2.5rem, 6vw, 4.25rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        title: ["clamp(1.75rem, 3vw, 2.5rem)", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0, 0, 0.2, 1)",
        in: "cubic-bezier(0.4, 0, 1, 1)",
        move: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      boxShadow: {
        subtle: "0 1px 2px hsl(240 10% 4% / 0.04), 0 1px 3px hsl(240 10% 4% / 0.06)",
        lift: "0 8px 24px -8px hsl(240 10% 4% / 0.14), 0 2px 6px hsl(240 10% 4% / 0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
