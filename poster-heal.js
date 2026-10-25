/*
 * Lampa: posters — each poster from a host that keeps it, another host for every retry — owner's TV tweak (Lampa 3.x).
 * 1) Hosts. Lampa takes posters from image.tmdb.org unless its geo check says RU/BY; from the TV's line image.tmdb.org
 *    resolves to 127.0.0.1 (router DNS) and Cloudflare/OVH answers come at 10–11 s a poster (pl.imagetmdb.com,
 *    imagetmdb.com; 12 posters each, curl on the TV, 2026-10-24). What did work, 12 of 12 even 12 at once:
 *    lampa.byskaz.ru/tmdb/img 0.07 s, nl.imagetmdb.com 0.3 s, de.imagetmdb.com 0.4 s, imagetmdb.<cub> 10 of 12.
 *    nl, de and CUB send `Cache-Control: max-age=31919000`, byskaz sends no cache headers at all: with byskaz picked
 *    as «fastest» (1.1–1.3) the WebView fetched every poster again on every screen. So:
 *    - each poster always comes from the same cacheable host — nl or de by a hash of its path, half each: twice the
 *      connections (the WebView opens 6 per host) and the next showing comes from the disk cache;
 *    - Lampa gives a poster's first load 15 s, then asks for it again 2 s after each failure (components/card, up to
 *      4 tries): every new try of the same poster goes to the next working host after the one that failed — the other
 *      of nl/de, byskaz, CUB — never the same host twice in a row. A screen of 30–40 posters on a line a torrent fills
 *      ran past the 15 s in the queue (2026-10-25 19:15, 20 «noload» in one millisecond);
 *    - those 15-s timeouts come a screen at a time (also back from the player or the screensaver: the timers ran
 *      while Lampa was frozen), so 8 errors of a host in 10 s only make it be checked with one small poster; it is
 *      set aside for 10 min, its posters going to the next host, only if that check fails. Every host is checked
 *      at start, when the network comes back and after a long absence.
 * 2) Heal. Posters loaded again — from every working host in turn, Cloudflare/OVH last — 3 s after a failure, when
 *    Lampa is visible again, when the network comes back, and every 30 s: the cards that gave up
 *    (`.card__img-broken`: region code + URL), and Lampa's retries still hanging 20 s after the last failure (a retry
 *    has no 15-s timer, it would never fail nor become a stub). At most 3 times a poster.
 */
(function () {
    'use strict';
    if (window.lampa_tv_poster_heal) return;
    window.lampa_tv_poster_heal = '1.4.0';

    // ---- 1) hosts ----
    var CACHED = ['http://nl.imagetmdb.com/', 'http://de.imagetmdb.com/'];
    function backup() {
        var cub = (window.Lampa && Lampa.Manifest && Lampa.Manifest.cub_domain) || 'cub.black';
        return ['http://lampa.byskaz.ru/tmdb/img/', 'https://imagetmdb.' + cub + '/'];
    }
    var LAST = ['http://pl.imagetmdb.com/', 'http://imagetmdb.com/', 'https://image.tmdb.org/']; // heal only
    var https = function (list) { return location.protocol === 'https:' ? list.filter(function (h) { return h.indexOf('http:') !== 0; }) : list; };

    var down = {}, errors = {}, pick = {}, brokenAt = {}, checking = {};
    var up = function (h) { return !(down[h] > Date.now()); };
    function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
    function chain(p) { // the hosts for one poster in the order its tries go: its cacheable host, the other one, the backups
        var cached = https(CACHED), first = cached[hash(p) % cached.length];
        return (first ? [first] : []).concat(cached.filter(function (h) { return h !== first; }), https(backup()));
    }
    function firstUp(list) { return list.filter(up)[0] || list[0]; }
    function after(p, failed) { // the next host after the one that just failed, never the same one again
        var c = chain(p), i = c.indexOf(failed);
        var rest = i < 0 ? c : c.slice(i + 1).concat(c.slice(0, i));
        return firstUp(rest);
    }
    function path(url) { // 't/p/w300//abc.jpg' or a full poster URL → 't/p/w300/abc.jpg'
        var m = /(t\/p\/.*)$/.exec(String(url || ''));
        return m ? m[1].split('?')[0].replace(/\/+/g, '/') : '';
    }

    // one small poster from each host: a host that answers is (back) in, one that does not is set aside for 10 min
    function check(list) {
        (list || https(CACHED.concat(backup()))).forEach(function (host) {
            if (checking[host]) return;
            checking[host] = true;
            var im = new Image();
            var settle = function (ok) {
                clearTimeout(t);
                checking[host] = false;
                if (ok) delete down[host];
                else {
                    if (up(host)) console.log('PosterHeal', 'host does not answer, set aside for 10 min:', host);
                    down[host] = Date.now() + 10 * 60 * 1000;
                }
            };
            var t = setTimeout(function () { im.src = ''; settle(false); }, 8000);
            im.onload = function () { settle(im.naturalWidth > 0); };
            im.onerror = function () { settle(false); };
            im.src = host + 't/p/w92/1sIAsLSaMwm3mb7Y6jISMv56McR.jpg?r=' + Date.now();
        });
        if (!list) checkedAt = Date.now();
    }
    var checkedAt = 0, healSoon;

    function patchTmdb() {
        if (!window.Lampa || !Lampa.TMDB || !Lampa.TMDB.image) return false;
        if (Lampa.TMDB.image.__posterHosts) return true;
        var image = function (url) {
            var p = String(url).replace(/^\/+/, '').replace(/\/+/g, '/');
            var host = pick[p] && up(pick[p]) ? pick[p] : firstUp(chain(p));
            return host + p;
        };
        image.__posterHosts = true;
        Lampa.TMDB.image = image;
        var broken = Lampa.TMDB.broken;
        Lampa.TMDB.broken = function (url) {
            var src = String(url || ''), p = path(src), now = Date.now();
            var host = https(CACHED.concat(backup())).filter(function (h) { return src.indexOf(h) === 0; })[0];
            if (p) {
                pick[p] = after(p, host); // Lampa's next try of this poster goes to the next host
                brokenAt[p] = now;
            }
            if (host) {
                // Lampa's 15-s timer fails a whole screen at once when the queue, not the host, is slow (back from the player
                // or the screensaver, a torrent filling the line): 8 errors only make the host be checked with one poster
                errors[host] = (errors[host] || []).filter(function (t) { return now - t < 10000; }).concat(now);
                if (errors[host].length >= 8 && up(host)) { errors[host] = []; check([host]); }
            }
            clearTimeout(healSoon);
            healSoon = setTimeout(heal, 3000);
            if (typeof broken === 'function') return broken.apply(this, arguments);
        };
        console.log('PosterHeal', 'ready', window.lampa_tv_poster_heal);
        return true;
    }

    if (!patchTmdb()) {
        var waited = 0;
        var timer = setInterval(function () { if (patchTmdb() || ++waited > 60) clearInterval(timer); }, 500);
    }

    // ---- 2) heal ----
    var busy = false;

    function tryHosts(list, p, i, done) {
        if (i >= list.length) return done(null);
        var probe = new Image();
        var settled = false;
        var once = function (ok) {
            if (settled) return;
            settled = true;
            if (!ok) probe.src = ''; // a hung load must not keep one of the host's 6 connections
            if (ok) done(probe.src); else tryHosts(list, p, i + 1, done);
        };
        setTimeout(function () { once(false); }, 15000);
        probe.onload = function () { once(probe.naturalWidth > 0); };
        probe.onerror = function () { once(false); };
        probe.src = list[i] + p;
    }

    // posters to load again: Lampa's stubs, and Lampa's retries still hanging 20 s after the last failure (only the first load
    // has Lampa's 15-s timer, a stalled retry would never fail nor become a stub). Each at most 3 times.
    function candidates() {
        var out = [], now = Date.now();
        Array.prototype.forEach.call(document.querySelectorAll('.card__img-broken'), function (stub) {
            var img = stub.previousElementSibling, lines = stub.querySelectorAll('div > div');
            var p = path(lines.length ? lines[lines.length - 1].textContent.trim() : '');
            if (img && img.classList.contains('card__img') && p) out.push({ img: img, p: p, stub: stub });
        });
        Array.prototype.forEach.call(document.querySelectorAll('.card__img'), function (img) {
            var p = path(img.getAttribute('src'));
            if (p && brokenAt[p] && now - brokenAt[p] > 20000 && !(img.complete && img.naturalWidth > 0)) out.push({ img: img, p: p });
        });
        return out.filter(function (c) { return (c.img.__heal = (c.img.__heal || 0) + 1) <= 3; });
    }

    function heal() {
        if (busy) return;
        var list = candidates();
        if (!list.length) return;
        busy = true;
        var left = list.length;
        var finish = function () { if (--left === 0) busy = false; };
        list.forEach(function (c) {
            var hosts = chain(c.p).filter(up).concat(chain(c.p).filter(function (h) { return !up(h); }), https(LAST));
            tryHosts(hosts, c.p, 0, function (src) {
                if (src) {
                    c.img.onerror = function () {};
                    c.img.src = src;
                    delete brokenAt[c.p];
                    if (c.stub && c.stub.parentNode) c.stub.parentNode.removeChild(c.stub);
                }
                finish();
            });
        });
    }

    check();
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        if (Date.now() - checkedAt > 10 * 60 * 1000) check(); // back after a long while: the network may differ
        setTimeout(heal, 2000);
    });
    window.addEventListener('online', function () { check(); setTimeout(heal, 2000); });
    setInterval(heal, 30000);
})();
