import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/** GET /mobile и др. → index.html для react-router (dev). */
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

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), spaFallbackPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
