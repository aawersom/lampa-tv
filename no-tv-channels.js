/*
 * Lampa: no Android TV home-screen channels — owner's TV tweak (Lampa 3.x in the top.rootu.lampa app).
 * The app keeps 9 home-screen rows (recommendations, history, bookmarks, «continue»…) with w1280 pictures and
 * rebuilds them every 15 minutes and 5 s after every change Lampa reports — right after a film ends, the launcher
 * then reprocesses hundreds of pictures while Lampa comes back (TV log 2026-10-14 09:39–09:40, 7083 launcher
 * entries in an hour). The owner never uses these rows.
 * Lampa reports changes through the app bridge `AndroidJS.updateChannel(where)` (app.js updateChannel). Bridge
 * methods themselves cannot be replaced, so the bridge object is: every other call goes through unchanged.
 * (The 15-minute timer is stopped outside Lampa: background run of the app is restricted with appops.)
 */
(function () {
    'use strict';
    if (window.lampa_tv_no_tv_channels) return;
    window.lampa_tv_no_tv_channels = '1.0.0';

    var real = window.AndroidJS;
    if (!real || typeof real.updateChannel !== 'function') return;

    var bridge = {};
    for (var name in real) {
        (function (key) {
            bridge[key] = typeof real[key] === 'function' ? function () { return real[key].apply(real, arguments); } : real[key];
        })(name);
    }
    bridge.updateChannel = function () {};

    try { window.AndroidJS = bridge; } catch (e) { console.log('NoTvChannels', e && e.message); }
})();
