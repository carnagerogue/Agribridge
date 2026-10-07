import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { brotliCompressSync, brotliDecompressSync, gzipSync } from "node:zlib";
import express from "express";
import { mountWebApp } from "../web.js";

async function withWebApp(
  production: boolean,
  work: (url: string, dist: string) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "agribridge-web-"));
  const dist = path.join(directory, "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  await writeFile(path.join(dist, "index.html"), "<!doctype html><p>shell</p>");
  const script = "console.log('agribridge');".repeat(100);
  await writeFile(path.join(dist, "assets/index-AbC123xy.js"), script);
  await writeFile(
    path.join(dist, "assets/index-AbC123xy.js.br"),
    brotliCompressSync(script),
  );
  await writeFile(
    path.join(dist, "assets/index-AbC123xy.js.gz"),
    gzipSync(script),
  );
  await writeFile(path.join(dist, "manifest.webmanifest"), "{}");
  await writeFile(path.join(directory, "secret.js"), "private");
  await writeFile(
    path.join(directory, "secret.js.br"),
    brotliCompressSync("private"),
  );
  const app = express();
  assert.equal(mountWebApp(app, production, dist), true);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  try {
    await work(`http://127.0.0.1:${port}`, script);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

// fetch() decodes bodies; use raw requests to see what was actually sent.
async function raw(url: string, encoding?: string) {
  const { request } = await import("node:http");
  return new Promise<{
    headers: Record<string, any>;
    body: Buffer;
    status: number;
  }>((resolve, reject) => {
    const req = request(
      url,
      { headers: encoding ? { "accept-encoding": encoding } : {} },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            headers: res.headers,
            body: Buffer.concat(chunks),
            status: res.statusCode || 0,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("compressed build assets are served to browsers that accept them", async () =>
  withWebApp(true, async (url, script) => {
    const asset = `${url}/assets/index-AbC123xy.js`;
    const brotli = await raw(asset, "gzip, deflate, br");
    assert.equal(brotli.status, 200);
    assert.equal(brotli.headers["content-encoding"], "br");
    assert.match(brotli.headers["content-type"], /javascript/);
    assert.match(brotli.headers.vary, /Accept-Encoding/);
    assert.equal(
      brotli.headers["cache-control"],
      "public, max-age=31536000, immutable",
    );
    assert.equal(brotliDecompressSync(brotli.body).toString(), script);
    assert.ok(brotli.body.length < script.length / 5);

    const gzip = await raw(asset, "gzip");
    assert.equal(gzip.headers["content-encoding"], "gzip");
    const refused = await raw(asset, "gzip, br;q=0");
    assert.equal(refused.headers["content-encoding"], "gzip");

    const plain = await raw(asset);
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.equal(plain.body.toString(), script);
    assert.equal(
      plain.headers["cache-control"],
      "public, max-age=31536000, immutable",
    );
  }));

test("unhashed files revalidate and client routes fall back to the shell", async () =>
  withWebApp(true, async (url) => {
    const manifest = await raw(`${url}/manifest.webmanifest`, "br");
    assert.equal(manifest.headers["content-encoding"], undefined);
    assert.equal(manifest.headers["cache-control"], "public, max-age=3600");
    const route = await raw(`${url}/farms`, "br");
    assert.equal(route.status, 200);
    assert.equal(route.headers["cache-control"], "no-cache");
    assert.match(route.body.toString(), /shell/);
  }));

test("compressed lookups never leave the build directory", async () =>
  withWebApp(false, async (url) => {
    for (const attempt of [
      "/assets/..%2f..%2fsecret.js",
      "/..%2fsecret.js",
      "/%2e%2e/secret.js",
    ]) {
      const response = await raw(`${url}${attempt}`, "br");
      assert.notEqual(response.body.toString(), "private");
      assert.equal(response.headers["content-encoding"], undefined);
    }
  }));
