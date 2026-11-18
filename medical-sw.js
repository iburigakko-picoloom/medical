// Built medical shell only. A complete build is installed atomically.
const base = new URL("./", self.location.href);
const build = new URL(self.location.href).searchParams.get("build");
const cacheName = "medical-shell-" + build;
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const response = await fetch(new URL("precache-manifest.json", base), {
        cache: "no-store",
      });
      if (!response.ok) throw Error("Missing build manifest");
      const { files } = await response.json();
      const required = [
        "medical.html","medical.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png",
        ...files.filter((f) => f.endsWith(".js") || f.endsWith(".css")),
      ];
      const cache = await caches.open(cacheName);
      try {
        await cache.addAll(
          required.map(
            (p) => new Request(new URL(p, base), { cache: "reload" }),
          ),
        );
      } catch (e) {
        await caches.delete(cacheName);
        throw e;
      }
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("medical-shell-") && key !== cacheName)
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
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
      url.pathname === base.pathname + "medical.html")
  ) {
    event.respondWith(
      caches
        .open(cacheName)
        .then(
          async (c) =>
            (await c.match(new URL("medical.html", base))) || fetch(req),
        ),
    );
    return;
  }
  if (url.pathname.startsWith(base.pathname + "assets/") || url.pathname.startsWith(base.pathname+"icons/") || url.pathname===base.pathname+"medical.webmanifest")
    event.respondWith(
      (async () => {
        const cache = await caches.open(cacheName),
          hit = await cache.match(req, {ignoreVary:true});
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
});

