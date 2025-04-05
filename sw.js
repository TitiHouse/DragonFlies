// service-worker.js

// Nom du cache. Incrémentez ce numéro si vous modifiez les fichiers mis en cache.
const CACHE_NAME = 'planning-cache-v3'; // Incrémenté pour refléter les changements

// Fichiers essentiels à mettre en cache pour le hors ligne.
// IMPORTANT : Nous NE mettons PAS en cache './' ou './index.html'
// pour forcer la vérification réseau (et donc Cloudflare Access) à chaque chargement.
const urlsToCache = [
  // PAS DE './' OU './index.html' ICI !
  'manifest.json',
  // Bibliothèques externes (CDN) - Mieux vaut les télécharger et les servir localement pour robustesse offline
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  // Icônes
  'icons/icon-192x192.png',
  'icons/icon-512x512.png'
  // Ajoutez d'autres ressources statiques si nécessaire (VOTRE CSS, VOS JS locaux, polices...)
  // Exemple: '/css/style.css', '/js/main.js'
];

// Installation : Mise en cache des assets (JS, CSS, Images, etc. PAS le HTML principal)
self.addEventListener('install', event => {
  console.log('SW: Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Mise en cache initiale des assets...');
        // Mise en cache des ressources définies dans urlsToCache
        return cache.addAll(urlsToCache).catch(error => {
          // Si une ressource CDN (ou autre) échoue, on log l'erreur mais on continue
          console.error('SW: Échec de mise en cache initiale pour certaines ressources:', error);
          // Ne pas rejeter la promesse ici permet à l'installation de continuer
          // même si un fichier CDN optionnel est inaccessible temporairement.
        });
      })
      .then(() => {
        console.log('SW: Installation terminée (assets mis en cache).');
        // Force le service worker en attente à devenir le service worker actif.
        return self.skipWaiting();
      })
      .catch(error => {
         console.error("SW: Erreur durant l'installation:", error);
      })
  );
});

// Activation : Nettoyage des anciens caches
self.addEventListener('activate', event => {
  console.log('SW: Activation...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => cacheName !== CACHE_NAME) // Filtre les caches qui ne sont PAS le cache actuel
          .map(cacheName => {
            console.log('SW: Suppression ancien cache:', cacheName);
            return caches.delete(cacheName); // Supprime les anciens caches
          })
      );
    }).then(() => {
        console.log('SW: Nettoyage des anciens caches terminé.');
        // Permet à un service worker activé de prendre le contrôle de la page immédiatement.
        return self.clients.claim();
    }).then(() => {
        console.log('SW: Activation terminée et contrôle pris.');
    }).catch(error => {
        console.error("SW: Erreur durant l'activation:", error);
    })
  );
});

// Fetch : Interception des requêtes réseau
self.addEventListener('fetch', event => {
  const request = event.request;

  // *** STRATÉGIE 1 : Network Only pour les requêtes de navigation HTML ***
  // Force la requête réseau pour le document HTML principal.
  // Ceci assure que Cloudflare Access (ou autre authentification) est vérifié.
  if (request.mode === 'navigate' && request.destination === 'document') {
    console.log('SW: [Navigate] Requête réseau directe pour:', request.url);
    event.respondWith(
      fetch(request)
        .catch(error => {
          // Le réseau a échoué (l'utilisateur est probablement hors ligne)
          console.warn('SW: [Navigate] Échec réseau pour HTML principal:', request.url, error);
          // Renvoyer une réponse HTML simple indiquant l'état hors ligne.
          // IMPORTANT: Ne PAS renvoyer une version cachée de l'application ici.
          return new Response(
            `<!DOCTYPE html>
             <html lang="fr">
             <head>
               <meta charset="UTF-8">
               <meta name="viewport" content="width=device-width, initial-scale=1.0">
               <title>Hors Ligne</title>
               <style>
                 body { font-family: sans-serif; text-align: center; padding: 20px; }
               </style>
             </head>
             <body>
               <h1>Vous êtes hors ligne</h1>
               <p>Impossible de charger la page principale de l'application. Veuillez vérifier votre connexion Internet et réessayer.</p>
             </body>
             </html>`,
            {
              status: 503, // Service Unavailable
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/html' }
            }
          );
          // Alternative : Si vous avez une page offline.html *simple* mise en cache DANS urlsToCache:
          // return caches.match('/offline.html');
        })
    );
    return; // Ne pas exécuter la stratégie suivante pour les navigations
  }

  // *** STRATÉGIE 2 : Cache First (puis Réseau) pour toutes les autres requêtes (Assets: CSS, JS, Images, etc.) ***
  // Sert les assets depuis le cache si disponibles, sinon tente le réseau.
  // console.log('SW: [Asset] Traitement de:', request.url); // Décommenter pour voir toutes les requêtes d'assets
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        // 2a. Trouvé dans le cache : Renvoyer la réponse du cache
        if (cachedResponse) {
          // console.log('SW: [Asset] Servi depuis le cache:', request.url);
          return cachedResponse;
        }

        // 2b. Non trouvé dans le cache : Aller au réseau
        // console.log('SW: [Asset] Non trouvé en cache, requête réseau pour:', request.url);
        return fetch(request)
          .then(networkResponse => {
            // Optionnel : Mettre dynamiquement en cache les nouvelles ressources accédées ?
            // C'est utile pour les assets découverts après le chargement initial,
            // mais peut remplir le cache rapidement. À utiliser avec précaution.
            /*
            if (networkResponse.ok) { // Ne cache que les réponses valides
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                console.log('SW: [Asset] Mise en cache dynamique pour:', request.url);
                cache.put(request, responseToCache);
              });
            }
            */
            return networkResponse; // Renvoyer la réponse réseau
          })
          .catch(error => {
            // Le réseau a échoué ET l'asset n'était pas en cache
            console.warn('SW: [Asset] Échec requête réseau (et non en cache):', request.url, error);
            // Renvoyer une réponse d'erreur appropriée selon le type d'asset si nécessaire
            // Par exemple, pour une image, on pourrait renvoyer une image placeholder.
            // Pour JS/CSS, une erreur ici peut casser l'apparence ou fonctionnalité.
            // Retourner une réponse d'erreur générique :
             return new Response(`Impossible de charger la ressource : ${request.url}`, {
               status: 404, // Not Found (ou 503 Service Unavailable)
               statusText: 'Not Found',
               headers: { 'Content-Type': 'text/plain' }
             });
          });
      })
  );
});

console.log('SW: Script chargé.'); // Confirme que le script SW lui-même s'est chargé