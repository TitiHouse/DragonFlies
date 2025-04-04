const CACHE_NAME = 'planning-cache-v2'; // Garde le même nom ou incrémente si tu changes urlsToCache

// Fichiers essentiels à mettre en cache pour le hors ligne
const urlsToCache = [
  // Il est crucial que index.html soit listé ici pour le fallback hors ligne
  './', // Référence le fichier HTML principal ('start_url' du manifest)
  './index.html', // On peut aussi le spécifier explicitement
  'manifest.json',
  // Bibliothèques externes (CDN)
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  // Icônes
  'icons/icon-192x192.png',
  'icons/icon-512x512.png'
  // Ajoute d'autres ressources statiques si nécessaire (CSS, JS locaux, polices...)
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
          // Ne pas rejeter la promesse ici permet à l'installation de continuer même si un fichier CDN échoue
        });
      })
      .then(() => {
        console.log('SW: Installation terminée.');
        // Force le service worker en attente à devenir le service worker actif.
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
        // Permet à un service worker activé de prendre le contrôle de la page immédiatement.
        return self.clients.claim();
    })
  );
});

// Fetch: Stratégie conditionnelle
self.addEventListener('fetch', event => {
  const request = event.request;

  // *** STRATÉGIE: Network First (puis Cache) pour les navigations HTML ***
  // Ceci permet à Cloudflare Access (ou autre auth) d'intercepter la requête en ligne.
  if (request.mode === 'navigate' && request.destination === 'document') {
    event.respondWith(
      // 1. Essayer le réseau
      fetch(request)
        .then(networkResponse => {
          // 1a. Réseau OK : Mettre en cache la réponse et la retourner
          console.log('SW: [Navigate] Réponse réseau OK pour:', request.url);
          // Il faut cloner la réponse car elle ne peut être consommée qu'une fois
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              console.log('SW: [Navigate] Mise à jour du cache pour:', request.url);
              cache.put(request, responseToCache);
            });
          return networkResponse;
        })
        .catch(error => {
          // 1b. Réseau Échoué (hors ligne) : Essayer le cache
          console.warn('SW: [Navigate] Réseau échoué pour:', request.url, 'Tentative cache...');
          return caches.match(request)
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('SW: [Navigate] Servi depuis le cache (fallback):', request.url);
                return cachedResponse;
              }
              // Optionnel : Renvoyer une page offline générique si même le cache échoue
              console.error('SW: [Navigate] Échec réseau ET cache vide pour:', request.url);
              // return caches.match('/offline.html'); // Si tu as une page offline.html
              return new Response("Vous êtes hors ligne et cette page n'est pas en cache.", { status: 503, statusText: 'Service Unavailable', headers: { 'Content-Type': 'text/plain' }});
            });
        })
    );
    return; // Important: Ne pas exécuter la stratégie suivante pour les navigations
  }

  // *** STRATÉGIE: Cache First (puis Réseau) pour toutes les autres requêtes (CSS, JS, Images, API non-GET?, etc.) ***
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        // 2a. Cache trouvé : Retourner la réponse du cache
        if (cachedResponse) {
          // console.log('SW: [Asset] Servi depuis le cache:', request.url);
          return cachedResponse;
        }

        // 2b. Cache non trouvé : Aller au réseau
        // console.log('SW: [Asset] Non trouvé en cache, requête réseau pour:', request.url);
        return fetch(request).then(networkResponse => {
            // Optionnel: Mettre dynamiquement en cache les nouvelles ressources accédées ?
            // Attention avec cette approche pour les CDN ou les API.
            // let responseToCache = networkResponse.clone();
            // caches.open(CACHE_NAME).then(cache => { cache.put(request, responseToCache); });
            return networkResponse;
        }).catch(error => {
            console.warn('SW: [Asset] Échec requête réseau (et non en cache):', request.url, error);
            // Optionnel: renvoyer une réponse "placeholder" ou une erreur spécifique
            // pour les images par exemple. Pour les JS/CSS, une erreur ici peut casser l'app.
            // Pour les API, renvoyer une structure d'erreur JSON standard peut être utile.
        });
      })
  );
});