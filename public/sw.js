/* Public app shell only. Authenticated API data is never stored here. */
const CACHE_PREFIX = "agribridge-shell-";
const BUILD_ID = "__AGRIBRIDGE_BUILD_ID__";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const SHELL = "/index.html";
const HASHED_ASSET =
  /^\/assets\/[a-zA-Z0-9_./-]+-[a-zA-Z0-9_-]{6,}\.(?:js|css|woff2?|svg|png|webp)$/;
const PUBLIC_FILES = new Set(["/icon.svg", "/manifest.webmanifest"]);

function publicResponse(response) {
  return (
    response.ok &&
    response.type !== "opaque" &&
    !/no-store|private/i.test(response.headers.get("Cache-Control") || "")
  );
}

async function navigationResponse(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (!/^[a-f0-9]{20}$/.test(BUILD_ID))
        throw new Error("Offline mode requires a production build.");
      const [response, manifestResponse] = await Promise.all([
        fetch(SHELL, { credentials: "omit", cache: "reload" }),
        fetch("/offline-assets.json", { credentials: "omit", cache: "reload" }),
      ]);
      if (
        !publicResponse(response) ||
        !response.headers.get("Content-Type")?.includes("text/html")
      )
        throw new Error("Public app shell unavailable.");
      const html = await response.clone().text();
      // A Vite development page imports TypeScript directly; never cache it.
      if (/\/@vite\/client|\/src\/[^"' >]+\.(?:tsx?|jsx?)/.test(html))
        throw new Error("Offline mode requires a production build.");
      if (
        !publicResponse(manifestResponse) ||
        !manifestResponse.headers
          .get("Content-Type")
          ?.includes("application/json")
      )
        throw new Error("Offline asset manifest unavailable.");
      const manifest = await manifestResponse.json();
      if (
        manifest.version !== BUILD_ID ||
        !Array.isArray(manifest.assets) ||
        !manifest.assets.length ||
        manifest.assets.length > 500 ||
        !manifest.assets.every(
          (path) =>
            typeof path === "string" &&
            HASHED_ASSET.test(path) &&
            !path.includes(".."),
        )
      )
        throw new Error("Offline asset manifest is invalid.");
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.put(SHELL, response);
        await Promise.all(
          [...new Set([...manifest.assets, ...PUBLIC_FILES])].map(
            async (path) => {
              const asset = await fetch(path, {
                credentials: "omit",
                cache: "reload",
              });
              if (
                !publicResponse(asset) ||
                asset.headers.get("Content-Type")?.includes("text/html")
              )
                throw new Error("Public app asset unavailable.");
              await cache.put(path, asset);
            },
          ),
        );
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      // Keep one previous immutable shell for another tab that has not reloaded.
      const previous = names.filter(
        (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
      );
      await Promise.all(
        previous.slice(0, -1).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    request.headers.has("Range")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await navigationResponse(request);
          if (response.ok || response.status < 500) return response;
        } catch {
          /* The public shell can reopen without a connection. */
        }
        return (
          (await caches.match(SHELL, { cacheName: CACHE_NAME })) ||
          new Response(
            "Agribridge needs a connection for its first visit. Please reconnect and try again.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          )
        );
      })(),
    );
    return;
  }

  if (
    url.search ||
    (!HASHED_ASSET.test(url.pathname) && !PUBLIC_FILES.has(url.pathname))
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
      if (HASHED_ASSET.test(url.pathname)) {
        const previous = (await caches.keys()).filter(
          (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
        );
        for (const name of previous) {
          const retained = await caches.match(url.pathname, {
            cacheName: name,
          });
          if (retained) return retained;
        }
      }
      // Cookies/authorization must not influence anything persisted in CacheStorage.
      const headers = new Headers(request.headers);
      headers.delete("Authorization");
      const response = await fetch(
        new Request(request, { credentials: "omit", headers }),
      );
      if (publicResponse(response))
        await cache.put(url.pathname, response.clone());
      return response;
    })(),
  );
});
