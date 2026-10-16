/*
 * Lampa: IMDb rating everywhere — owner's TV tweak (Lampa 3.x). Owner: «в превью показывался рейтинг imdb основным,
 * tmdb мне там не нужен»; «imdb появляется на мгновение и тут же пропадает».
 * 1) Poster tiles. Lampa's card «Ratting» module writes TMDB vote_average into `.card__vote`. Here the tile shows the
 *    IMDb rating instead: from the card data (CUB lists carry imdb_rating), else from this plugin's cache, else one
 *    OMDb request by imdb_id (the owner's key, set for the ko3ik ratings plugin) — only for tiles that come on screen,
 *    two at a time, cached for 14 days. A tile without a known IMDb rating shows no number (no TMDB fallback).
 * 2) Movie card. Lampa shows the IMDb rating it got from CUB; then the ratings plugin (ko3ik) asks OMDb and, when it
 *    gets nothing (no imdb_id because TMDB is blocked, OMDb error), hides `.rate--imdb` — the rating flashes and
 *    vanishes. Here a hidden IMDb badge is put back with the known value.
 */
(function () {
    'use strict';
    if (window.lampa_tv_imdb_ratings) return;
    window.lampa_tv_imdb_ratings = '1.0.0';

    var CACHE_KEY = 'lampa_tv_imdb_cache';
    var TTL = 14 * 24 * 3600 * 1000;
    var cache = null;

    function load() {
        if (!cache) { try { cache = Lampa.Storage.get(CACHE_KEY, '{}') || {}; } catch (e) { cache = {}; } }
        return cache;
    }
    var saveTimer = null;
    function remember(tt, rating) {
        load()[tt] = { r: rating, t: Date.now() };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { Lampa.Storage.set(CACHE_KEY, cache); }, 3000);
    }
    function cached(tt) {
        var c = tt && load()[tt];
        return c && Date.now() - c.t < TTL ? c.r : null;
    }

    function known(data) {
        var r = parseFloat(data && data.imdb_rating);
        if (r > 0) return r.toFixed(1);
        var c = cached(data && (data.imdb_id || (data.external_ids && data.external_ids.imdb_id)));
        return c && c !== '-' ? c : null;
    }

    // ---- OMDb queue ----
    var queue = [], running = 0, asked = {};
    function omdb(tt, done) {
        var key = Lampa.Storage.get('ratings_omdb_key', '');
        if (!key) return done(null);
        var net = new Lampa.Reguest();
        net.timeout(10000);
        net.silent('https://www.omdbapi.com/?apikey=' + encodeURIComponent(key) + '&i=' + encodeURIComponent(tt), function (j) {
            var r = j && j.imdbRating && j.imdbRating !== 'N/A' ? parseFloat(j.imdbRating).toFixed(1) : null;
            done(r);
        }, function () { done(undefined); });
    }
    function pump() {
        while (running < 2 && queue.length) {
            var job = queue.shift();
            running++;
            (function (job) {
                omdb(job.tt, function (r) {
                    running--;
                    if (r !== undefined) remember(job.tt, r || '-'); // '-' = OMDb has no rating; do not ask again for 14 days
                    job.cbs.forEach(function (cb) { cb(r || null); });
                    pump();
                });
            })(job);
        }
    }
    function ask(tt, cb) {
        if (asked[tt]) return asked[tt].cbs.push(cb);
        var job = asked[tt] = { tt: tt, cbs: [cb] };
        queue.push(job);
        pump();
    }

    // ---- 1) tiles ----
    function paint(card, value) {
        var vote = card.querySelector('.card__vote');
        if (!value) { if (vote) vote.style.display = 'none'; return; }
        if (!vote) {
            var view = card.querySelector('.card__view');
            if (!view) return;
            vote = document.createElement('div');
            vote.className = 'card__vote';
            view.appendChild(vote);
        }
        vote.textContent = value;
        vote.classList.add('card__vote--imdb');
        vote.style.display = '';
    }

    function tile(card) {
        if (card.__imdbDone) return;
        var data = card.card_data;
        if (!data || data.cub_hundred_fire) return; // «сотня» CUB shows fire counts, not a rating
        card.__imdbDone = true;
        var value = known(data);
        if (value) return paint(card, value);
        var tt = data.imdb_id || (data.external_ids && data.external_ids.imdb_id);
        if (cached(tt) === '-') return paint(card, null);
        paint(card, null);
        whenVisible(card, function () {
            if (tt) return ask(tt, function (r) { paint(card, r); });
            imdbId(data, function (id) {
                if (!id) return;
                var c = cached(id);
                if (c) return paint(card, c === '-' ? null : c);
                ask(id, function (r) { paint(card, r); });
            });
        });
    }

    // TMDB lists carry no imdb_id: one external_ids request per title, kept in the same cache ('tmdb:movie:123' → 'tt…')
    function imdbId(data, done) {
        if (!data.id || !Lampa.TMDB || !Lampa.TMDB.api) return done(null);
        var type = data.media_type === 'tv' || data.name || data.first_air_date ? 'tv' : 'movie';
        var key = 'tmdb:' + type + ':' + data.id;
        var c = cached(key);
        if (c) return done(c === '-' ? null : c);
        var net = new Lampa.Reguest();
        net.timeout(10000);
        net.silent(Lampa.TMDB.api(type + '/' + data.id + '/external_ids?api_key=' + Lampa.TMDB.key()), function (j) {
            var id = j && j.imdb_id ? j.imdb_id : null;
            remember(key, id || '-');
            done(id);
        }, function () { done(null); });
    }

    var io = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            if (e.isIntersecting && e.target.__imdbWait) { var f = e.target.__imdbWait; e.target.__imdbWait = null; io.unobserve(e.target); f(); }
        });
    }, { rootMargin: '200px' }) : null;
    function whenVisible(card, fn) {
        if (!io) return fn();
        card.__imdbWait = fn;
        io.observe(card);
    }

    function scan(root) {
        var cards = root.querySelectorAll ? root.querySelectorAll('.card') : [];
        for (var i = 0; i < cards.length; i++) tile(cards[i]);
        if (root.classList && root.classList.contains('card')) tile(root);
    }
    new MutationObserver(function (list) {
        list.forEach(function (m) { for (var i = 0; i < m.addedNodes.length; i++) if (m.addedNodes[i].nodeType === 1) scan(m.addedNodes[i]); });
    }).observe(document.body, { childList: true, subtree: true });
    scan(document.body);

    var style = document.createElement('style');
    style.textContent = '.card__vote.card__vote--imdb{background:#f5c518;color:#000;font-weight:700}';
    document.head.appendChild(style);

    // ---- 2) movie card: keep a known IMDb badge visible ----
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        var movie = e.data.movie;
        var body = e.body && e.body[0] ? e.body[0] : document;
        var guard = function () {
            var box = body.querySelector('.rate--imdb');
            var value = known(movie);
            if (!box || !value || !box.classList.contains('hide')) return;
            box.classList.remove('hide');
            var divs = box.children;
            if (divs[0]) divs[0].textContent = value;
        };
        [1500, 3000, 6000].forEach(function (ms) { setTimeout(guard, ms); });
        var tt = movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id);
        if (tt && parseFloat(movie.imdb_rating) > 0) remember(tt, parseFloat(movie.imdb_rating).toFixed(1));
    });

    console.log('ImdbRatings', 'ready', window.lampa_tv_imdb_ratings);
})();
