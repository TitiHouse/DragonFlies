const CACHE_NAME = 'planning-cache-v1';

// Fichiers essentiels à mettre en cache pour le hors ligne
const urlsToCache = [
  '.', // Référence le fichier HTML principal ('start_url' du manifest)
  './index.html', // On peut aussi le spécifier explicitement
  'manifest.json',
  // Bibliothèques externes (CDN) - **Voir note ci-dessous**
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  // Icônes
  'icons/icon-192x192.png',
  'icons/icon-512x512.png'
];

// Installation: mise en cache
self.addEventListener('install', event => {
  console.log('SW: Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Mise en cache initiale...');
        // Note: Mieux vaut télécharger les libs CDN et les servir localement pour un offline fiable.
        return cache.addAll(urlsToCache).catch(error => {
          console.error('SW: Échec cache initial:', error);
        });
      })
      .then(() => {
        console.log('SW: Installation terminée.');
        return self.skipWaiting();
      })
  );
});

// Activation: nettoyage anciens caches
self.addEventListener('activate', event => {
  console.log('SW: Activation...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
                  .map(cacheName => {
                    console.log('SW: Suppression ancien cache:', cacheName);
                    return caches.delete(cacheName);
                  })
      );
    }).then(() => {
        console.log('SW: Activation terminée.');
        return self.clients.claim();
    })
  );
});

// Fetch: stratégie "Cache d'abord, puis réseau"
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) { return response; }
        // Cache miss - go to network
        return fetch(event.request).catch(error => {
            console.warn('SW: Échec requête réseau:', event.request.url, error);
            // Optionnel: renvoyer une réponse "offline" générique ici
        });
      })
  );
});