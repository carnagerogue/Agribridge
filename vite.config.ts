import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Include lazy routes in the offline shell without ever listing API URLs. */
function offlineShell(): Plugin {
  let root = "";
  return {
    name: "agribridge-offline-shell",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) =>
          /^assets\/[a-zA-Z0-9_./-]+-[a-zA-Z0-9_-]{6,}\.(?:js|css|woff2?|svg|png|webp)$/.test(
            name,
          ),
        )
        .sort()
        .map((name) => "/" + name);
      const worker = readFileSync(resolve(root, "public/sw.js"), "utf8");
      const hash = createHash("sha256")
        .update(JSON.stringify(assets))
        .update(worker);
      for (const file of [
        "index.html",
        "public/icon.svg",
        "public/manifest.webmanifest",
      ])
        hash.update(readFileSync(resolve(root, file)));
      const version = hash.digest("hex").slice(0, 20);
      this.emitFile({
        type: "asset",
        fileName: "offline-assets.json",
        source: JSON.stringify({ version, assets }),
      });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: worker.replaceAll("__AGRIBRIDGE_BUILD_ID__", version),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineShell()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
  preview: {
    port: 5180,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 250 },
});
