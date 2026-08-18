/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0a0f1f",
          900: "#0f1730",
          800: "#16204a",
          700: "#1f2c5c",
        },
        gold: {
          400: "#e8c168",
          500: "#d4a94a",
          600: "#b8893a",
        },
        ivory: "#faf7f0",
      },
      fontFamily: {
        sans: ["'Noto Sans Thai'", "'Noto Sans'", "system-ui", "sans-serif"],
        serif: ["'Noto Serif Thai'", "'Noto Serif'", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,48,0.04), 0 8px 24px -8px rgba(15,23,48,0.08)",
        "card-hover": "0 4px 12px rgba(212,169,74,0.12), 0 16px 32px -12px rgba(15,23,48,0.14)",
      },
      backgroundImage: {
        "radial-gold": "radial-gradient(60% 60% at 50% 0%, rgba(212,169,74,0.18) 0%, rgba(212,169,74,0) 70%)",
        "hero-stars":
          "radial-gradient(1px 1px at 20% 30%, rgba(232,193,104,0.6) 0, transparent 100%), radial-gradient(1px 1px at 70% 20%, rgba(232,193,104,0.5) 0, transparent 100%), radial-gradient(1.5px 1.5px at 40% 70%, rgba(232,193,104,0.4) 0, transparent 100%), radial-gradient(1px 1px at 85% 60%, rgba(232,193,104,0.5) 0, transparent 100%), radial-gradient(1px 1px at 55% 45%, rgba(232,193,104,0.35) 0, transparent 100%), radial-gradient(1.5px 1.5px at 10% 80%, rgba(232,193,104,0.4) 0, transparent 100%)",
      },
    },
  },
  plugins: [],
};
