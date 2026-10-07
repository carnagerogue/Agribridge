import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";

const COMPRESSIBLE = /\.(?:js|css|html|svg|json|webmanifest)$/;
const HASHED_ASSET = /^\/assets\/[\w./-]+-[\w-]{6,}\.\w+$/;
const ENCODINGS = { br: ".br", gzip: ".gz" } as const;

/**
 * Serves the built web app, when present, with an HTML fallback so client
 * routes reload. Mount after the API routes. Returns false without a build.
 *
 * Text assets are sent as the Brotli or gzip copies written at build time when
 * the browser accepts them. Content-hashed assets never change, so browsers may
 * keep them for a year; everything else is revalidated.
 */
export function mountWebApp(
  app: Express,
  production: boolean,
  dist = path.resolve("dist"),
) {
  if (!existsSync(path.join(dist, "index.html"))) return false;
  const root = path.resolve(dist);
  const cacheControl = (pathname: string) =>
    HASHED_ASSET.test(pathname)
      ? "public, max-age=31536000, immutable"
      : production
        ? "public, max-age=3600"
        : "no-cache";
  app.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || !COMPRESSIBLE.test(req.path))
      return next();
    const file = path.resolve(root, `.${req.path}`);
    if (!file.startsWith(root + path.sep)) return next();
    res.vary("Accept-Encoding");
    // Browsers list gzip first but accept Brotli, which is smaller.
    const encoding =
      req.acceptsEncodings("br") === "br"
        ? "br"
        : req.acceptsEncodings("gzip") === "gzip"
          ? "gzip"
          : undefined;
    if (!encoding) return next();
    const compressed = `${file}${ENCODINGS[encoding]}`;
    if (!existsSync(compressed)) return next();
    res.set({
      "Content-Encoding": encoding,
      "Cache-Control": cacheControl(req.path),
    });
    res.type(path.extname(file));
    res.sendFile(compressed, { cacheControl: false }, (error) => {
      if (error) next(error);
    });
  });
  app.use(
    express.static(root, {
      index: false,
      cacheControl: false,
      setHeaders: (res, file) =>
        res.setHeader(
          "Cache-Control",
          cacheControl(
            "/" + path.relative(root, file).split(path.sep).join("/"),
          ),
        ),
    }),
  );
  app.get("/{*path}", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(root, "index.html"));
  });
  return true;
}
