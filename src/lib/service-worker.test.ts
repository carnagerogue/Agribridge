import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const fetch = vi.fn(
    async (_request: Request) =>
      new Response("asset", { headers: { "Content-Type": "text/javascript" } }),
  );
  const cache = {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => {}),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [] as string[]),
    match: vi.fn(async () => undefined),
    delete: vi.fn(async () => true),
  };
  const self = {
    location: { origin: "https://agribridge.test" },
    addEventListener: (name: string, handler: (event: any) => void) =>
      handlers.set(name, handler),
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
  };
  runInNewContext(
    readFileSync("public/sw.js", "utf8").replaceAll(
      "__AGRIBRIDGE_BUILD_ID__",
      "0123456789abcdef0123",
    ),
    {
      self,
      caches,
      fetch,
      URL,
      Request,
      Response,
      Headers,
      AbortController,
      setTimeout,
      clearTimeout,
    },
  );
  return { handlers, fetch, cache, caches };
}

describe("offline public-shell isolation", () => {
  it("does not intercept API, cross-origin, POST, or range requests", () => {
    const { handlers, fetch } = worker();
    for (const request of [
      new Request("https://agribridge.test/api/bootstrap"),
      new Request("https://agribridge.test/api/auth/session"),
      new Request("https://other.test/assets/app-abcdef12.js"),
      new Request("https://agribridge.test/assets/app-abcdef12.js", {
        method: "POST",
      }),
      new Request("https://agribridge.test/assets/app-abcdef12.js", {
        headers: { Range: "bytes=0-10" },
      }),
    ]) {
      const respondWith = vi.fn();
      handlers.get("fetch")!({ request, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("omits credentials and authorization when caching immutable static assets", async () => {
    const { handlers, fetch, cache } = worker();
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: new Request("https://agribridge.test/assets/app-abcdef12.js", {
        headers: { Authorization: "test-only-token" },
        credentials: "include",
      }),
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    await response;
    const sent = fetch.mock.calls[0]?.[0] as unknown as Request;
    expect(sent.credentials).toBe("omit");
    expect(sent.headers.has("Authorization")).toBe(false);
    expect(cache.put).toHaveBeenCalledOnce();
  });
  it("retains one older shell while deleting older obsolete versions", async () => {
    const { handlers, caches } = worker();
    caches.keys.mockResolvedValue([
      "unrelated-app",
      "agribridge-shell-oldest",
      "agribridge-shell-previous",
      "agribridge-shell-0123456789abcdef0123",
    ]);
    let done: Promise<void> | undefined;
    handlers.get("activate")!({
      waitUntil: (value: Promise<void>) => {
        done = value;
      },
    });
    await done;
    expect(caches.delete).toHaveBeenCalledExactlyOnceWith(
      "agribridge-shell-oldest",
    );
  });
});
