// Built medical shell only. A complete build is installed atomically.
const base = new URL("./", self.location.href);
const build = "mwy9skl8-l0uyrnz6";
const cacheName = "medical-shell-" + build;
function releaseUrl(path) {
  const url = new URL(path, base);
  url.searchParams.set("release", build);
  return url;
}

self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const response = await fetch(releaseUrl("precache-manifest.json"), {
        cache: "no-store",
      });
      if (!response.ok) throw Error("Missing build manifest");
      const { files, buildId } = await response.json();
      if (buildId !== build) throw Error("Medical release changed during install");
      const shell = await fetch(releaseUrl("medical.html"), {cache: "no-store"});
      if (!shell.ok || !(await shell.clone().text()).includes(`name="quiz-build-id" content="${build}"`))
        throw Error("Medical HTML and assets belong to different releases");
      const manifest = await fetch(releaseUrl("medical.webmanifest"), {cache: "no-store"});
      if (!manifest.ok) throw Error("Missing Medical manifest");
      const required = [
        "icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png",
        ...files.filter((f) => f.endsWith(".js") || f.endsWith(".css")),
      ];
      const cache = await caches.open(cacheName);
      await cache.addAll(
        required.map(p => new Request(new URL(p, base), { cache: "reload" })),
      );
      await cache.put(new URL("medical.html", base), shell);
      await cache.put(new URL("medical.webmanifest", base), manifest);
      await self.skipWaiting();
    })(),
  ),
);
// An open exercise can still request its original lazy chunks after takeover.
async function olderShells() {
  const shells = (await caches.keys()).filter(key => key.startsWith("medical-shell-"));
  const position = shells.indexOf(cacheName);
  return position < 0 ? [] : shells.slice(0, position);
}

async function pruneUnusedShells(replacingClient) {
  const clients = await self.clients.matchAll({type: "window", includeUncontrolled: true});
  if (clients.some(client => client.id !== replacingClient && client.url.startsWith(base.href))) return;
  for (const key of await olderShells()) await caches.delete(key);
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await pruneUnusedShells();
  })());
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  if (
    req.mode === "navigate" &&
    (url.pathname === base.pathname ||
      url.pathname === base.pathname + "medical.html" ||
      url.pathname === base.pathname + "index.html")
  ) {
    event.waitUntil(pruneUnusedShells(event.replacesClientId));
    event.respondWith(
      (async () => {
        // The next online visit must be able to discover a newer release.
        // During an exercise the current document stays open.
        try {
          const response = await fetch(req, { cache: "no-store" });
          if (response.ok) return response;
          const cached = await caches.match(new URL("medical.html", base), {cacheName});
          return cached ?? response;
        } catch (error) {
          const cached = await caches.match(new URL("medical.html", base), {cacheName});
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }
  if (url.pathname === base.pathname + "medical.webmanifest") {
    event.respondWith((async () => {
      try {
        const online = await fetch(req, {cache: "no-store"});
        if (online.ok) return online;
      } catch { /* Use the installed manifest offline. */ }
      return await caches.match(new URL("medical.webmanifest", base), {cacheName}) ?? Response.error();
    })());
    return;
  }
  if (url.pathname.startsWith(base.pathname + "assets/") || url.pathname.startsWith(base.pathname + "icons/") || url.pathname.startsWith(base.pathname + "content/covers/"))
    event.respondWith(
      (async () => {
        const cache = await caches.open(cacheName),
          hit = await cache.match(req, {ignoreVary:true});
        if (hit) return hit;
        if (/[-][A-Za-z0-9_-]{8}\.(js|css|mjs)$/.test(url.pathname)) {
          for (const key of (await olderShells()).reverse()) {
            const previous = await caches.match(req, {cacheName: key, ignoreVary: true});
            if (previous) return previous;
          }
        }
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
});

