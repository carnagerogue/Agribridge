import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "agribridge-showcase-html",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "icon.svg", source: readFileSync(resolve("public/icon.svg")) });
      },
    },
  ],
  publicDir: false,
  // The second HTML entry is emitted as index.html for a standalone static host.
  build: {
    outDir: "dist-showcase",
    target: "es2022",
    rollupOptions: { input: resolve("showcase/index.html") },
  },
});
