import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load env from root directory (one level up from frontend/)
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_MAPBOX_TOKEN": JSON.stringify(env.MAPBOX_TOKEN),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
