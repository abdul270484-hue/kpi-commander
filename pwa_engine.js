/**
 * ==============================================================================
 * BUJM EXECUTIVE KPI COMMANDER - PWA ADVANCED TACTICAL ENGINE
 * ==============================================================================
 * Features:
 * 1. Safe Service Worker Lifecycle Management & Instant Updates
 * 2. App Badging API (Live Counter on Home Screen Icon)
 * 3. Haptic Tactile Engine (Micro-vibrations for native feel)
 * 4. Smart Offline Radar (Zero interruption during network drops)
 * 5. Pull-to-Refresh Gesture on Mobile
 * 6. Native Executive Web Share
 * ==============================================================================
 */

(function () {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. SERVICE WORKER REGISTRATION & AUTO-CACHE PURGE
    // --------------------------------------------------------------------------
    if ('caches' in window) {
        caches.keys().then((keys) => {
            keys.forEach((key) => {
                if (key.startsWith('bujm-kpi-shell-') && key !== 'bujm-kpi-shell-v4.5') {
                    console.log('[PWA] Purging outdated cache:', key);
                    caches.delete(key).catch(() => {});
                }
            });
        }).catch(() => {});
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('🛡️ [PWA] Service Worker aktif dengan scope:', registration.scope);

                    // Auto-update check
                    registration.update().catch(() => {});

                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (!installingWorker) return;

                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Auto-activate without waiting for manual user tap
                                installingWorker.postMessage({ action: 'skipWaiting' });
                                window.location.reload();
                            }
                        };
                    };
                })
                .catch((err) => {
                    console.warn('[PWA] Service Worker registration skipped/failed:', err.message);
                });
        });
    }

    // --------------------------------------------------------------------------
    // 2. HAPTIC TACTILE ENGINE (Vibration API)
    // --------------------------------------------------------------------------
    window.pwaHaptic = function (type = 'light') {
        try {
            if (!('vibrate' in navigator)) return;
            switch (type) {
                case 'light':
                    navigator.vibrate(10);
                    break;
                case 'medium':
                    navigator.vibrate(20);
                    break;
                case 'heavy':
                    navigator.vibrate(35);
                    break;
                case 'success':
                    navigator.vibrate([15, 40, 20]);
                    break;
                case 'warning':
                    navigator.vibrate([25, 60, 25]);
                    break;
            }
        } catch (_) {}
    };

    // Auto-bind haptic to all buttons with data-haptic or interactive classes
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, .kpi-master-card, .tab-btn, .action-btn');
        if (btn) {
            window.pwaHaptic('light');
        }
    }, { passive: true });

    // --------------------------------------------------------------------------
    // 3. APP BADGING API (Live Counter on Home Screen Icon)
    // --------------------------------------------------------------------------
    window.updateAppBadge = function (count) {
        try {
            if ('setAppBadge' in navigator) {
                if (count && count > 0) {
                    navigator.setAppBadge(count).catch(() => {});
                } else {
                    navigator.clearAppBadge().catch(() => {});
                }
            }
        } catch (_) {}
    };

    // --------------------------------------------------------------------------
    // 4. SMART OFFLINE RADAR
    // --------------------------------------------------------------------------
    function initOfflineRadar() {
        const radarBar = document.createElement('div');
        radarBar.id = 'pwaOfflineRadar';
        radarBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 100000;
            padding: 8px 16px;
            font-size: 0.8rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-align: center;
            display: none;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4);
        `;
        document.body.appendChild(radarBar);

        function updateOnlineStatus() {
            if (!navigator.onLine) {
                window.pwaHaptic('warning');
                radarBar.style.display = 'block';
                radarBar.style.background = 'rgba(239, 68, 68, 0.95)';
                radarBar.style.color = '#ffffff';
                radarBar.innerHTML = '<i class="fa-solid fa-wifi-slash mr-2"></i> MODE OFFLINE — Menampilkan cache data operasional terakhir';
            } else {
                if (radarBar.style.display === 'block') {
                    window.pwaHaptic('success');
                    radarBar.style.background = 'rgba(16, 185, 129, 0.95)';
                    radarBar.style.color = '#ffffff';
                    radarBar.innerHTML = '<i class="fa-solid fa-wifi mr-2"></i> TERHUBUNG KEMBALI — Sinkronisasi real-time aktif';
                    setTimeout(() => {
                        radarBar.style.display = 'none';
                    }, 3000);
                }
            }
        }

        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
    }

    // --------------------------------------------------------------------------
    // 5. PULL-TO-REFRESH GESTURE (Touch Screen Only)
    // --------------------------------------------------------------------------
    function initPullToRefresh() {
        let touchStartY = 0;
        let touchMoveY = 0;
        let isPulling = false;

        const refreshIndicator = document.createElement('div');
        refreshIndicator.id = 'pwaPullRefreshIndicator';
        refreshIndicator.style.cssText = `
            position: fixed;
            top: -60px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #0f172a;
            border: 2px solid #06b6d4;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #06b6d4;
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.4);
            transition: top 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.2s;
        `;
        refreshIndicator.innerHTML = '<i class="fa-solid fa-rotate text-lg"></i>';
        document.body.appendChild(refreshIndicator);

        window.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0) {
                touchStartY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            touchMoveY = e.touches[0].clientY;
            const diff = touchMoveY - touchStartY;

            if (diff > 15 && window.scrollY === 0) {
                const pullProgress = Math.min(diff * 0.4, 85);
                refreshIndicator.style.top = `${pullProgress - 50}px`;
                const icon = refreshIndicator.querySelector('i');
                if (icon) icon.style.transform = `rotate(${diff * 2}deg)`;
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            if (!isPulling) return;
            const diff = touchMoveY - touchStartY;
            isPulling = false;

            if (diff > 120 && window.scrollY === 0) {
                window.pwaHaptic('medium');
                refreshIndicator.style.top = '20px';
                const icon = refreshIndicator.querySelector('i');
                if (icon) icon.classList.add('fa-spin');

                // Soft reload from live Cloud
                setTimeout(() => {
                    window.location.reload();
                }, 300);
            } else {
                refreshIndicator.style.top = '-60px';
            }
            touchStartY = 0;
            touchMoveY = 0;
        }, { passive: true });
    }

    // --------------------------------------------------------------------------
    // 6. NATIVE EXECUTIVE BRIEFING SHARE
    // --------------------------------------------------------------------------
    window.shareExecutiveBriefing = function (customTitle, customText) {
        window.pwaHaptic('light');

        const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
        const title = customTitle || `Executive KPI Briefing - PT. BUJM (${dateStr})`;
        
        let text = customText;
        if (!text) {
            // Auto-extract current KPI totals from dashboard DOM
            const totalSo = document.getElementById('val-total-so') ? document.getElementById('val-total-so').innerText : '-';
            const mpu = document.getElementById('val-total-mpu') ? document.getElementById('val-total-mpu').innerText : '-';
            const dosa = document.getElementById('val-total-dosa') ? document.getElementById('val-total-dosa').innerText : '-';

            text = `📊 *EXECUTIVE SUMMARY PT. BUJM*\n📅 *${dateStr}*\n━━━━━━━━━━━━━━━━━━━━\n` +
                   `• Total Service Orders: *${totalSo}*\n` +
                   `• Pending Parts (MPU): *${mpu}*\n` +
                   `• Dosa Cabang Overdue: *${dosa}*\n` +
                   `━━━━━━━━━━━━━━━━━━━━\n` +
                   `🔗 Akses Live Dashboard: https://management-bujm-dashboard.web.app\n` +
                   `_Generated by BUJM Executive Commander_`;
        }

        if (navigator.share) {
            navigator.share({
                title: title,
                text: text,
                url: window.location.origin
            }).catch(() => {});
        } else {
            // Desktop fallback: Open WhatsApp Web with prefilled message
            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
            window.open(waUrl, '_blank');
        }
    };



    // --------------------------------------------------------------------------
    // TOAST HELPER
    // --------------------------------------------------------------------------
    function showPwaToast(msg, onClick) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 85px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 100000;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(6, 182, 212, 0.5);
            color: #ffffff;
            padding: 12px 22px;
            border-radius: 12px;
            font-size: 0.85rem;
            font-weight: 600;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            cursor: pointer;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        toast.innerHTML = `<span>${msg}</span>`;
        if (onClick) {
            toast.addEventListener('click', () => {
                window.pwaHaptic('light');
                onClick();
                toast.remove();
            });
        }
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 7000);
    }

    // --------------------------------------------------------------------------
    // INITIALIZATION ON DOM READY
    // --------------------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPwaAll);
    } else {
        initPwaAll();
    }

    function initPwaAll() {
        initOfflineRadar();
        initPullToRefresh();
    }

})();
