/* アダマス工房 Service Worker
   - ホーム画面追加（PWAインストール）を有効化するための最小構成。
   - ナビゲーションはネットワーク優先（新デプロイをすぐ反映）、失敗時にキャッシュへフォールバック。
   - ハッシュ付きアセット等はキャッシュ優先（オフライン動作）。 */
// アイコン等のハッシュ無しファイルはキャッシュ優先なので、差し替えたら必ずこの版を上げる
// （activate で旧キャッシュを削除し、新しいファイルを取り直させる）
const CACHE = "adamas-koubou-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // ネットワーク優先（オフライン時のみキャッシュ）
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cached = await caches.match(req);
          return cached || caches.match(self.registration.scope) || Response.error();
        }
      })(),
    );
    return;
  }

  // それ以外はキャッシュ優先（Viteのハッシュ付きアセットは不変）
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
