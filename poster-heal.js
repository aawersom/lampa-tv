/*
 * Lampa: posters — reachable host first, heal what broke — owner's TV tweak (Lampa 3.x).
 * 1) Hosts. Lampa takes posters from image.tmdb.org unless its geo check (geo.<cub>, at start) says RU/BY and
 *    the TMDB proxy is on. image.tmdb.org is refused from Moscow (check-host.net ru1/ru2, 2026-10-14), and the
 *    geo check does not run again when the TV changes networks. Here posters always come from a host chain ordered
 *    by speed from Russian home ISPs (Globalping MTS, Rostelecom, SkyNet…, two posters, 2026-10-16), all of them
 *    also fine from Estonia: lampa.byskaz.ru/tmdb/img (Russia, 16–205 ms) → nl.imagetmdb.com (88–253 ms) →
 *    pl.imagetmdb.com → imagetmdb.com (Cloudflare: 210–495 ms, and Russian ISPs cut Cloudflare answers at 16 KB
 *    while a w300 poster is 30–50 KB) → imagetmdb.<cub> (400–650 ms) → image.tmdb.org. Not de.imagetmdb.com (hung on
 *    2 of 5 home probes). That order is only the fallback: the host actually used is the fastest one of the current
 *    network (probeHosts). A host that keeps failing (8 errors in 10 s, reported by the cards through TMDB.broken)
 *    hands over to the next one and a new race starts.
 * 2) Heal. A card gives up on its poster for good (components/card onerror: 15-s timer, then «retry» of the same
 *    src counts as another error at once → after 3 the `.card__img-broken` stub with the region code and URL).
 *    The timers keep running while Lampa is frozen behind the screensaver or the external player, so on return a
 *    whole page of posters «times out» in the same millisecond; a Wi-Fi switch does the same. A broken poster is
 *    loaded again — from every host in turn — when Lampa becomes visible, when the network comes back, and every
 *    30 s while broken posters exist. The stub stays only if every host fails.
 */
(function () {
    'use strict';
    if (window.lampa_tv_poster_heal) return;
    window.lampa_tv_poster_heal = '1.3.0';

    // ---- 1) hosts ----
    function hosts() {
        var cub = (window.Lampa && Lampa.Manifest && Lampa.Manifest.cub_domain) || 'cub.black';
        var list = ['http://lampa.byskaz.ru/tmdb/img/', 'http://nl.imagetmdb.com/', 'http://pl.imagetmdb.com/', 'http://imagetmdb.com/',
            'https://imagetmdb.' + cub + '/', 'https://image.tmdb.org/'];
        return location.protocol === 'https:' ? list.filter(function (h) { return h.indexOf('http:') !== 0; }) : list; // no http host on an https page
    }
    var current = 0;
    var errors = [];

    // The fastest host of THIS network: every host loads the same small poster at once, the first full load wins.
    // A fixed order was wrong as soon as the TV changed networks — 2026-10-23, TV on a direct Moscow line (Altagen):
    // lampa.byskaz.ru/tmdb/img hung without an error (12 s+), every card waited its 15-s timer, while imagetmdb.com
    // answered in 106 ms and nl.imagetmdb.com in 201 ms. A hung host never wins; a 16-KB cut never finishes loading.
    // Run at start, when the network comes back, after the screensaver/player, and when the current host keeps failing.
    var PROBE = 't/p/w92/1sIAsLSaMwm3mb7Y6jISMv56McR.jpg', probing = false, probedAt = 0;
    function probeHosts() {
        if (probing) return;
        probing = true;
        probedAt = Date.now();
        var list = hosts(), won = false, left = list.length;
        var end = function () { if (--left === 0 || won) probing = false; };
        list.forEach(function (host, i) {
            var im = new Image();
            var t = setTimeout(function () { im.src = ''; end(); }, 8000);
            im.onload = function () {
                clearTimeout(t);
                if (!won && im.naturalWidth > 0) {
                    won = true;
                    if (current !== i) console.log('PosterHeal', 'fastest host now:', host);
                    current = i;
                }
                end();
            };
            im.onerror = function () { clearTimeout(t); end(); };
            im.src = host + PROBE + '?r=' + Date.now();
        });
    }

    function path(url) { // 't/p/w300//abc.jpg' or a full poster URL → 't/p/w300/abc.jpg'
        var m = /(t\/p\/.*)$/.exec(String(url || ''));
        return m ? m[1].split('?')[0].replace(/\/+/g, '/') : '';
    }

    function patchTmdb() {
        if (!window.Lampa || !Lampa.TMDB || !Lampa.TMDB.image) return false;
        if (Lampa.TMDB.image.__posterHosts) return true;
        var image = function (url) { return hosts()[current] + String(url).replace(/^\/+/, '').replace(/\/+/g, '/'); };
        image.__posterHosts = true;
        Lampa.TMDB.image = image;
        var broken = Lampa.TMDB.broken;
        Lampa.TMDB.broken = function (url) {
            if (String(url || '').indexOf(hosts()[current]) === 0) {
                var now = Date.now();
                errors.push(now);
                errors = errors.filter(function (t) { return now - t < 10000; });
                if (errors.length >= 8) {
                    errors = [];
                    current = (current + 1) % hosts().length;
                    console.log('PosterHeal', 'host failing, next:', hosts()[current]);
                    probeHosts();
                }
            }
            if (typeof broken === 'function') return broken.apply(this, arguments);
        };
        console.log('PosterHeal', 'ready', window.lampa_tv_poster_heal, hosts()[current]);
        return true;
    }

    if (!patchTmdb()) {
        var tries = 0;
        var timer = setInterval(function () { if (patchTmdb() || ++tries > 60) clearInterval(timer); }, 500);
    }

    // ---- 2) heal ----
    var busy = false;

    function tryHosts(p, i, done) {
        var list = hosts();
        if (i >= list.length) return done(null);
        var host = list[(current + i) % list.length];
        var probe = new Image();
        var settled = false;
        var once = function (ok) {
            if (settled) return;
            settled = true;
            if (ok) done(probe.src); else tryHosts(p, i + 1, done);
        };
        setTimeout(function () { once(false); }, 15000); // a hung load must not block the next host
        probe.onload = function () { once(true); };
        probe.onerror = function () { once(false); };
        probe.src = host + p;
    }

    function heal() {
        var stubs = document.querySelectorAll('.card__img-broken');
        if (!stubs.length || busy) return;
        busy = true;
        var left = stubs.length;
        var finish = function () { if (--left === 0) busy = false; };
        Array.prototype.forEach.call(stubs, function (stub) {
            var img = stub.previousElementSibling;
            var lines = stub.querySelectorAll('div > div');
            var p = path(lines.length ? lines[lines.length - 1].textContent.trim() : '');
            if (!img || !img.classList.contains('card__img') || !p) return finish();
            tryHosts(p, 0, function (src) {
                if (src) {
                    img.onerror = function () {};
                    img.src = src;
                    if (stub.parentNode) stub.parentNode.removeChild(stub);
                }
                finish();
            });
        });
    }

    probeHosts();
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        if (Date.now() - probedAt > 10 * 60 * 1000) probeHosts(); // back after a long while: the network may differ
        setTimeout(heal, 2000);
    });
    window.addEventListener('online', function () { probeHosts(); setTimeout(heal, 2000); });
    setInterval(heal, 30000);
})();
