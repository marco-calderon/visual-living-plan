// Generated from src/shellWorker.ts. Do not edit.

// src/shellCache.ts
var SHELL_CACHE_PREFIX = "visual-living-plan-shell-";
var SHELL_CACHE_VERSION = "1.11.0";
var SHELL_CACHE_NAME = "visual-living-plan-shell-1.11.0";
var ASSET_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|wasm)$/i;
var PLAN_NETWORK = /^\/plans\/[^/]+\/(?:api|view|share|document|versions)(?:\/|$)/;
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
  if (path === "/api" || path.startsWith("/api/"))
    return "network";
  if (PLAN_NETWORK.test(path))
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
async function sessionMarker(cookie) {
  const value = cookie?.trim() ?? "";
  if (!value)
    return "anon";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function documentCacheRequest(request) {
  const url = new URL(request.url);
  url.hash = "";
  if (url.pathname.length > 1)
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.searchParams.delete("__lp_shell");
  url.searchParams.set("__lp_shell", await sessionMarker(request.headers.get("cookie")));
  return new Request(url.href, { method: "GET" });
}
function shouldStoreDocument(response) {
  if (response.status !== 200)
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
  const key = await documentCacheRequest(request);
  try {
    const response = await deps.fetch(request);
    if (shouldStoreDocument(response))
      await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached)
      return cached;
    throw error;
  }
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
    event.waitUntil(scope.skipWaiting());
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(activateShellCaches(scope.caches).then(() => scope.clients.claim()));
  });
  scope.addEventListener("fetch", (event) => {
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
}
export {
  SHELL_CACHE_NAME,
  SHELL_CACHE_VERSION,
  activateShellCaches,
  classifyShellRequest,
  handleShellFetch
};
