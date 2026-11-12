// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Bogdan Shapovalov and the XChange authors

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: "127.0.0.1",
    port: 5273,
    strictPort: true,
    // Proxied rather than called cross-origin: the packaged Tauri app talks to
    // the server directly, so the browser dev setup should not be the only
    // configuration that needs CORS on the server.
    proxy: {
      "/v1": {
        target: process.env.FURY_SERVER ?? "http://127.0.0.1:8901",
        changeOrigin: true,
      },
      // The provider's own API. The packaged window asks from Rust, where no
      // CORS rule applies; a page cannot, so browser development goes through
      // here and the same code path reads the same answers in both builds.
      "/kiotproxy": {
        target: "https://api.kiotproxy.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kiotproxy/, ""),
      },
      "/nestproxy": {
        target: "https://nestproxy.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nestproxy/, ""),
      },
    },
  },
});
