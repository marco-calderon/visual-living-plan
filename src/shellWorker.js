// Generated from src/shellWorker.ts. Do not edit.

// src/shellCache.ts
var SHELL_CACHE_PREFIX = "visual-living-plan-shell-";
var SHELL_CACHE_VERSION = "2.1.0";
var SHELL_CACHE_NAME = "visual-living-plan-shell-2.1.0";
var DOCUMENT_CACHE_MARKER = "device";
var PRECACHE_BATCH = 16;
var ASSET_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|wasm)$/i;
var PLAN_NETWORK = /^\/plans\/[^/]+\/(?:api|view|share|document|versions)(?:\/|$)/;
var VERSION_PAGE = /^\/plans\/[^/]+\/versions\/[1-9]\d*\/?$/;
function classifyShellRequest(request, origin) {
  if (request.method !== "GET")
    return "network";
  if (request.headers.has("range"))
    return "network";
  if (request.headers.has("authorization"))
    return "network";
  const upgrade = request.headers.get("upgrade");
  if (upgrade && upgrade.toLowerCase() === "websocket")
    return "network";
  if (request.headers.get("x-tsr-serverfn") === "true")
    return "network";
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return "network";
  }
  if (url.origin !== origin)
    return "network";
  const path = url.pathname;
  if (path === "/sw.js")
    return "network";
  if (path === "/precache-manifest.json")
    return "network";
  if (path === "/api" || path.startsWith("/api/"))
    return "network";
  if (PLAN_NETWORK.test(path) && !VERSION_PAGE.test(path))
    return "network";
  if (path === "/archive" || path.startsWith("/archive/"))
    return "network";
  if (path.endsWith(".map"))
    return "network";
  if (isAssetPath(path) || isAssetDestination(request))
    return "asset";
  if (isDocumentRequest(request))
    return "document";
  return "network";
}
function documentCacheRequest(request) {
  const url = new URL(request.url);
  url.hash = "";
  url.pathname = normalizePath(url.pathname);
  url.searchParams.delete("__lp_shell");
  if (url.pathname === "/dashboard")
    url.searchParams.delete("period");
  url.searchParams.set("__lp_shell", DOCUMENT_CACHE_MARKER);
  return new Request(url.href, { method: "GET" });
}
function shouldStoreDocument(response) {
  if (response.status !== 200)
    return false;
  if (response.redirected)
    return false;
  if (response.type !== "basic" && response.type !== "default")
    return false;
  if (response.headers.has("set-cookie"))
    return false;
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}
function shouldStoreAsset(response) {
  if (response.status !== 200)
    return false;
  if (response.type !== "basic" && response.type !== "default")
    return false;
  if (response.headers.has("set-cookie"))
    return false;
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("text/html") || type.includes("application/json") || type.includes("text/event-stream")) {
    return false;
  }
  return true;
}
async function activateShellCaches(cacheStorage) {
  const names = await cacheStorage.keys();
  await Promise.all(names.filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE_NAME).map((name) => cacheStorage.delete(name)));
}
function precacheAssetUrls(manifest) {
  if (!manifest || typeof manifest !== "object")
    return [];
  const urls = manifest.urls;
  if (!Array.isArray(urls))
    return [];
  const seen = new Set;
  const list = [];
  for (const entry of urls) {
    if (typeof entry !== "string" || !entry.startsWith("/") || entry.endsWith(".map"))
      continue;
    if (seen.has(entry))
      continue;
    seen.add(entry);
    list.push(entry);
  }
  return list;
}
async function precacheShell(manifestUrl, deps) {
  let response;
  try {
    response = await deps.fetch(manifestUrl);
  } catch {
    return;
  }
  if (!response.ok)
    return;
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    return;
  }
  const urls = precacheAssetUrls(manifest);
  const size = deps.batchSize && deps.batchSize > 0 ? deps.batchSize : PRECACHE_BATCH;
  const batches = [];
  for (let index = 0;index < urls.length; index += size)
    batches.push(urls.slice(index, index + size));
  await Promise.allSettled(batches.map((batch) => deps.addAll(batch)));
}
function isForgetDocumentsMessage(value) {
  if (!value || typeof value !== "object")
    return false;
  return value.type === "forget-documents";
}
async function forgetShellDocuments(cache, message) {
  if (!cache.keys || !cache.delete)
    return;
  const paths = new Set((message.paths ?? []).map((path) => normalizePath(path)));
  const keys = await cache.keys();
  await Promise.all(keys.map(async (request) => {
    const url = new URL(request.url);
    if (!url.searchParams.has("__lp_shell"))
      return;
    if (!message.all && !paths.has(normalizePath(url.pathname)))
      return;
    await cache.delete?.(request);
  }));
}
function offlineNoticeHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)" />
<title>Not on this device · Living Plan</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #ffffff; color: #181e25; font: 16px/1.5 "DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; }
  main { max-width: 28rem; padding: 2rem; }
  h1 { font-size: 24px; font-weight: 600; line-height: 1.3; margin: 0 0 0.75rem; }
  p { margin: 0 0 1.25rem; color: #3f3f46; }
  a { color: #2563eb; font-weight: 500; }
  @media (prefers-color-scheme: dark) {
    body { background: #171717; color: #ededed; }
    p { color: #949494; }
    a { color: #0094fc; }
  }
</style>
</head>
<body>
<main>
  <h1>Not saved on this device</h1>
  <p>This plan is not saved on this device yet. Reconnect to open it.</p>
  <a href="/dashboard">Back to dashboard</a>
</main>
</body>
</html>`;
}
function offlineNoticeResponse() {
  return new Response(offlineNoticeHtml(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
function handleShellFetch(request, deps) {
  const kind = classifyShellRequest(request, deps.origin);
  if (kind === "network")
    return null;
  if (kind === "asset")
    return cacheFirstAsset(request, deps);
  return networkFirstDocument(request, deps);
}
async function cacheFirstAsset(request, deps) {
  const cache = await deps.caches.open(deps.cacheName);
  const cached = await cache.match(request);
  if (cached)
    return cached;
  const response = await deps.fetch(request);
  if (shouldStoreAsset(response))
    await cache.put(request, response.clone());
  return response;
}
async function networkFirstDocument(request, deps) {
  const cache = await deps.caches.open(deps.cacheName);
  const key = documentCacheRequest(request);
  try {
    const response = await deps.fetch(request);
    if (shouldStoreDocument(response))
      await cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached)
      return cached;
    const url = new URL(request.url);
    if (normalizePath(url.pathname) === "/") {
      const dashboard = await cache.match(documentCacheRequest(new Request(`${url.origin}/dashboard`)));
      if (dashboard)
        return dashboard;
    }
    return offlineNoticeResponse();
  }
}
function normalizePath(pathname) {
  if (!pathname)
    return "/";
  if (pathname.length > 1)
    return pathname.replace(/\/+$/, "") || "/";
  return pathname;
}
function isAssetPath(path) {
  if (path === "/favicon.png" || path === "/manifest.webmanifest")
    return true;
  if (path.startsWith("/client/") || path.startsWith("/assets/"))
    return true;
  return ASSET_EXTENSION.test(path);
}
function isAssetDestination(request) {
  const destination = requestDestination(request);
  return destination === "script" || destination === "style" || destination === "image" || destination === "font" || destination === "manifest";
}
function isDocumentRequest(request) {
  if (requestMode(request) === "navigate")
    return true;
  const destination = requestDestination(request);
  if (destination === "document" || destination === "iframe")
    return true;
  return (request.headers.get("accept") ?? "").includes("text/html");
}
function requestMode(request) {
  return request.mode ?? "";
}
function requestDestination(request) {
  const destination = request.destination;
  if (destination)
    return destination;
  return request.headers.get("sec-fetch-dest") ?? "";
}

// src/shellWorker.ts
function inServiceWorker(scope) {
  const ctor = scope.ServiceWorkerGlobalScope;
  return typeof ctor === "function" && scope instanceof ctor;
}
if (inServiceWorker(globalThis)) {
  const scope = globalThis;
  scope.addEventListener("install", (event) => {
    event.waitUntil((async () => {
      const cache = await scope.caches.open(SHELL_CACHE_NAME);
      await precacheShell(new URL("/precache-manifest.json", scope.location.origin).href, {
        fetch: (url) => scope.fetch(new Request(url, { cache: "no-store" })),
        addAll: async (urls) => {
          if (cache.addAll) {
            await cache.addAll(urls);
            return;
          }
          await Promise.all(urls.map(async (url) => {
            const response = await scope.fetch(new Request(url));
            await cache.put(new Request(url), response);
          }));
        }
      });
      await scope.skipWaiting();
    })());
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(activateShellCaches(scope.caches).then(() => scope.clients.claim()));
  });
  scope.addEventListener("fetch", (event) => {
    if (!event.request || !event.respondWith)
      return;
    const response = handleShellFetch(event.request, {
      cacheName: SHELL_CACHE_NAME,
      caches: scope.caches,
      fetch: (request) => scope.fetch(request),
      origin: scope.location.origin,
      waitUntil: (promise) => event.waitUntil(promise)
    });
    if (response)
      event.respondWith(response);
  });
  scope.addEventListener("message", (event) => {
    if (!isForgetDocumentsMessage(event.data))
      return;
    const message = event.data;
    event.waitUntil((async () => {
      const cache = await scope.caches.open(SHELL_CACHE_NAME);
      await forgetShellDocuments(cache, message);
    })());
  });
}
export {
  SHELL_CACHE_NAME,
  SHELL_CACHE_VERSION,
  activateShellCaches,
  classifyShellRequest,
  handleShellFetch
};
