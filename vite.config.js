import { defineConfig } from "vite";

// During `npm run dev`, forward /api to the local storage server
// (run it with `npm run server`). In production, nginx proxies /api.
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: process.env.KPSS_API_URL || "http://127.0.0.1:8090",
        changeOrigin: true
      }
    }
  }
});
