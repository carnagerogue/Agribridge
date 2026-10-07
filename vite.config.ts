import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
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

/**
 * Writes Brotli and gzip copies of text assets after the build so the server
 * sends compressed files without spending CPU per request (server/web.ts).
 */
function precompress(): Plugin {
  let outDir = "";
  const brotli = promisify(brotliCompress);
  const deflate = promisify(gzip);
  async function files(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    );
    return nested.flat();
  }
  return {
    name: "agribridge-precompress",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      for (const file of await files(outDir)) {
        if (!/\.(?:js|css|html|svg|json|webmanifest)$/.test(file)) continue;
        if ((await stat(file)).size < 1024) continue;
        const source = await readFile(file);
        await writeFile(
          `${file}.br`,
          await brotli(source, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }),
        );
        await writeFile(`${file}.gz`, await deflate(source, { level: 9 }));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineShell(), precompress()],
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
