import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // A deliberate cobalt, distinct from Tailwind's stock "blue" — the
        // one accent color in an otherwise black/white/gray palette.
        brand: {
          50: "#eef3ff",
          100: "#dfe8ff",
          200: "#c2d3ff",
          300: "#98b4ff",
          400: "#6d8fff",
          500: "#4569fb",
          600: "#2947e0",
          700: "#1f36b3",
          800: "#1c2f8f",
          900: "#1a2a72",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
