/*
 * Lampa: TMDB API through a host that answers from this network — owner's TV tweak (Lampa 3.x).
 * api.themoviedb.org is refused from Russian networks (check-host.net ru1/ru2/ru3, 2026-10-16). Lampa switches to its
 * CUB proxy only when the geo check at start says RU/BY, and plugins (ratings ko3ik, no-dmca) put
 * api.themoviedb.org into their URLs themselves — in such a network card details, «Похожие» and the IMDb lookup fail.
 * Every Lampa request — $.ajax or the Android app's native one — announces itself with `request_before` and a
 * mutable params.url (core Request go/android_go), so one listener moves every TMDB API URL, whoever built it, to
 * the host picked for this network: api.themoviedb.org → lampa.byskaz.ru/tmdb/api (the backup Lampa itself names in
 * its TMDB Proxy) → tmdb-api.rootu.top → tmdbapi.bylampa.online → apitmdb.cub.best. All answered 200 from Russian home
 * ISPs (Globalping: MTS, Rostelecom, ER-Telecom) for titles no cache held, 2026-10-16. Not apitmdb.cub.black (Lampa's
 * own proxy when cub_domain is cub.black): it answers only from its cache and redirects a miss to the blocked TMDB.
 * The host is picked by asking each one in turn for /configuration with a cache-busting parameter (a cached answer
 * would pass a proxy that cannot reach TMDB): at start, when the network comes back, when Lampa becomes visible
 * again, and after 3 failed TMDB requests in 15 s. The pick is kept for the next start.
 */
(function () {
    'use strict';
    if (window.lampa_tv_tmdb_route) return;
    window.lampa_tv_tmdb_route = '1.2.0';

    var KEY = 'lampa_tv_tmdb_route';
    var TMDB_API = /^https?:\/\/(api\.themoviedb\.org\/3|apitmdb\.[^\/]+\/3|lampa\.byskaz\.ru\/tmdb\/api\/3|tmdb-api\.rootu\.top\/3|tmdbapi\.bylampa\.online\/3)\//;

    function hosts() {
        var list = ['https://api.themoviedb.org/3/', 'http://lampa.byskaz.ru/tmdb/api/3/', 'http://tmdb-api.rootu.top/3/',
            'http://tmdbapi.bylampa.online/3/', 'https://apitmdb.cub.best/3/'];
        return location.protocol === 'https:' ? list.filter(function (h) { return h.indexOf('http:') !== 0; }) : list; // no http mirror on an https page
    }

    var saved = Lampa.Storage.get(KEY, '');
    var current = hosts().indexOf(saved) >= 0 ? saved : hosts()[0];
    var probing = false, lastProbe = 0, errors = [];

    function probe(force) {
        if (probing || (!force && Date.now() - lastProbe < 30000)) return;
        probing = true;
        lastProbe = Date.now();
        var list = hosts();
        (function next(i) {
            if (i >= list.length) { probing = false; return console.log('TmdbRoute', 'no host answers, keep', current); }
            $.ajax({
                url: list[i] + 'configuration?api_key=' + Lampa.TMDB.key() + '&r=' + Date.now(),
                dataType: 'json',
                timeout: 5000,
                success: function (j) {
                    if (!j || !j.images) return next(i + 1);
                    probing = false;
                    if (current !== list[i]) console.log('TmdbRoute', 'host', list[i]);
                    current = list[i];
                    Lampa.Storage.set(KEY, current);
                },
                error: function () { next(i + 1); }
            });
        })(0);
    }

    Lampa.Listener.follow('request_before', function (e) {
        var p = e.params;
        if (p && typeof p.url === 'string' && TMDB_API.test(p.url)) p.url = p.url.replace(TMDB_API, current);
    });

    Lampa.Listener.follow('request_error', function (e) {
        var url = e.params && e.params.url;
        if (typeof url !== 'string' || url.indexOf(current) !== 0 || (e.error && e.error.status)) return; // only network failures (status 0) of the picked host
        var now = Date.now();
        errors = errors.filter(function (t) { return now - t < 15000; }).concat(now);
        if (errors.length >= 3) { errors = []; probe(true); }
    });

    // A CUB card's details come from CUB's own TMDB proxy (tmdb.<cub>/3/…) with CUB's extras (kinopoisk_id, KP/IMDb
    // ratings, release quality). From the TV line it answered 5 of 12 (500s, dropped connections; 2026-10-24) while every
    // TMDB mirror answered 12 of 12, and a failed request leaves the card empty. A failed one is asked once more, then the
    // card comes from TMDB (through the host picked here), without CUB's extras.
    var cub = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.cub;
    if (cub && typeof cub.full === 'function' && !cub.full.__fallback) {
        var cubFull = cub.full;
        cub.full = function (params, oncomplite, onerror) {
            var self = this, tries = 0;
            (function attempt() {
                var settled = false;
                cubFull.call(self, params, function () {
                    if (settled) return;
                    settled = true;
                    oncomplite.apply(this, arguments);
                }, function () {
                    if (settled) return;
                    settled = true;
                    if (++tries < 2) return attempt();
                    var tmdb = Lampa.Api.sources.tmdb;
                    console.log('TmdbRoute', 'CUB card failed twice, from TMDB:', params && params.method, params && params.id);
                    if (tmdb && typeof tmdb.full === 'function') tmdb.full(Object.assign({}, params, { source: 'tmdb' }), oncomplite, onerror);
                    else onerror.apply(this, arguments);
                });
            })();
        };
        cub.full.__fallback = true;
    }

    window.addEventListener('online', function () { setTimeout(function () { probe(true); }, 2000); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) probe(); });
    probe(true);

    console.log('TmdbRoute', 'ready', window.lampa_tv_tmdb_route, current);
})();
