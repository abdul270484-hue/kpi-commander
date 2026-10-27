/**
 * ==============================================================================
 * BUJM EXECUTIVE KPI COMMANDER - SERVICE WORKER (PWA)
 * ==============================================================================
 * Architecture: Network-First with Offline App Shell Cache
 * Zero-Risk: Never intercepts or alters Firebase Auth / Firestore live streams
 * ==============================================================================
 */

const CACHE_NAME = 'bujm-kpi-shell-v3.4';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/main.js',
    '/mpm_module.js',
    '/data/mpm_capacity.json',
    '/data/mpm_employees.json',
    '/manifest.json',
    '/bujm_icon_192.png',
    '/bujm_icon_512.png',
    '/autobot_bg.png'
];

// URLs that should NEVER be cached (Firebase Auth, Firestore, APIs, GSPN RPCs)
const BYPASS_DOMAINS = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebaseio.com',
    'firebaseinstallations.googleapis.com',
    'fcmregistrations.googleapis.com',
    'generativelanguage.googleapis.com',
    'localhost:3001'
];

// Install: Pre-cache core shell
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[PWA SW] Pre-cache warning (non-fatal):', err);
            });
        })
    );
});

// Activate: Clean up old caches & take immediate control
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && key.startsWith('bujm-kpi-shell-')) {
                        console.log('[PWA SW] Removing old cache version:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-First with safe fallback for App Shell
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Only handle GET requests
    if (request.method !== 'GET') return;

    // 2. Only handle same-origin app shell assets (never intercept Firebase, gstatic, CDNs, APIs)
    if (url.origin !== self.location.origin) return;

    // 3. Network-First strategy
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                // If valid response from our origin or trusted CDN, save a copy to cache
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        // Only cache same-origin assets or specific static CDNs
                        if (url.origin === self.location.origin || url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
                            cache.put(request, responseClone).catch(() => {});
                        }
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Network failed (Offline / Flaky Connection) -> Serve from cache
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    
                    // Fallback to index.html for navigation requests
                    if (request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Network error occurred and no cache available', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({ 'Content-Type': 'text/plain' })
                    });
                });
            })
    );
});

// Message listener for skipWaiting trigger
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
