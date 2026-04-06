import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** SPA fallback для react-router (dev). */
function spaFallbackPlugin() {
  return {
    name: "spa-fallback",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((req, _res, next) => {
        if (req.method !== "GET" || !req.url) return next();
        const path = req.url.split("?")[0] ?? "";
        if (
          path.startsWith("/api") ||
          path.startsWith("/@") ||
          path.startsWith("/src") ||
          path.startsWith("/node_modules") ||
          (path.includes(".") && !path.endsWith("/"))
        ) {
          return next();
        }
        if (path === "/" || path === "/index.html") return next();
        req.url = "/index.html";
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallbackPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ["**/hockey_server/__pycache__/**", "**/.venv/**"],
    },
  },
});
