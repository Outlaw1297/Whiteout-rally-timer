import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev/preview servers bind to 0.0.0.0 so the app is reachable from outside
// the container (e.g. Cloud Agent VMs). The port can be overridden with $PORT.
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port,
  },
  preview: {
    host: "0.0.0.0",
    port,
  },
});
