import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        rally: {
          bg: "#061018",
          surface: "#0c1824",
          "surface-2": "#122033",
          border: "#1e3348",
          accent: "#5EC8F0",
          ice: "#5EC8F0",
          "ice-dim": "#3A9FC4",
          snow: "#F0F7FC",
          success: "#3DCEA0",
          warning: "#E8B84A",
          danger: "#F07178",
          launch: "#FF4D5A",
          text: "#E8F1F8",
          muted: "#8AA0B5",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-inter)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(94, 200, 240, 0.06)",
        focus: "0 0 0 3px rgba(94, 200, 240, 0.35)",
      },
      keyframes: {
        "launch-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.82" },
        },
        "soft-fade": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "launch-pulse": "launch-pulse 1.1s ease-in-out infinite",
        "soft-fade": "soft-fade 220ms ease-out",
      },
      screens: {
        xs: "390px",
      },
    },
  },
  plugins: [],
};

export default config;
