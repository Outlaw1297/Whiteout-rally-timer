import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        rally: {
          bg: "#0a0e17",
          surface: "#111827",
          border: "#1f2937",
          accent: "#3b82f6",
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
          text: "#f9fafb",
          muted: "#9ca3af",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
