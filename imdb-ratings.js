/*
 * Lampa: IMDb rating everywhere — owner's TV tweak (Lampa 3.x). Owner: «в превью показывался рейтинг imdb основным,
 * tmdb мне там не нужен»; «imdb появляется на мгновение и тут же пропадает».
 * 1) Poster tiles. Lampa's card «Ratting» module writes TMDB vote_average into `.card__vote`. Here the tile shows the
 *    IMDb rating instead, asked from IMDb's own API by imdb_id (a screen of tiles in one request; OMDb with the owner's
 *    key only if IMDb does not answer) for tiles that come on screen; until it answers the tile shows the last IMDb answer
 *    or CUB's value (CUB lists carry a lagging imdb_rating). Asked again daily for titles out less than half a year, every
 *    14 days for others. A tile without a known IMDb rating shows no number (no TMDB fallback).
 *    The badge colour follows the rating: 8+ green, 7–7.9 light green, 6–6.9 IMDb yellow, 5–5.9 orange, below red.
 * 2) Movie card. Lampa shows the IMDb rating it got from CUB; then the ratings plugin (ko3ik) asks OMDb and, when it
 *    gets nothing (no imdb_id because TMDB is blocked, OMDb error), hides `.rate--imdb` — the rating flashes and
 *    vanishes. Here a hidden IMDb badge is put back with the known value, asked from IMDb when the card has none. The TMDB badge is not shown (owner, 2026-10-18:
 *    «TMDB внутри у карточек убери рейтинг»).
 */
(function () {
    'use strict';
    if (window.lampa_tv_imdb_ratings) return;
    window.lampa_tv_imdb_ratings = '1.4.1';

    var CACHE_KEY = 'lampa_tv_imdb_cache';
    var TTL = 14 * 24 * 3600 * 1000;
    var cache = null;

    // every tile on screen leaves an entry (~50 chars) and nothing else removes them; localStorage is ~2.8M of ~5M chars,
    // and a full one makes Lampa move whatever key it writes next to IndexedDB. So once per start: entries older than
    // 4 weeks go, and at most the newest 4000 stay.
    var KEEP_MAX = 4000;
    function load() {
        if (cache) return cache;
        try { cache = Lampa.Storage.get(CACHE_KEY, '{}') || {}; } catch (e) { cache = {}; }
        var now = Date.now(), keys = Object.keys(cache).filter(function (k) { return cache[k] && now - cache[k].t < 2 * TTL; });
        if (keys.length !== Object.keys(cache).length || keys.length > KEEP_MAX) {
            keys.sort(function (a, b) { return cache[b].t - cache[a].t; });
            var kept = {};
            keys.slice(0, KEEP_MAX).forEach(function (k) { kept[k] = cache[k]; });
            cache = kept;
            Lampa.Storage.set(CACHE_KEY, cache);
        }
        return cache;
    }
    var saveTimer = null;
    // ratings asked from IMDb itself carry v:2; older entries may hold CUB's value (1.3 stored it from the card)
    function remember(tt, rating, mapping) {
        load()[tt] = mapping ? { r: rating, t: Date.now() } : { r: rating, t: Date.now(), v: 2 };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { Lampa.Storage.set(CACHE_KEY, cache); }, 3000);
    }
    function cached(tt) { // a tmdb:… → tt… mapping
        var c = tt && load()[tt];
        return c && Date.now() - c.t < TTL ? c.r : null;
    }
    function imdbOf(data) { return data && (data.imdb_id || (data.external_ids && data.external_ids.imdb_id)) || null; }
    // CUB's IMDb ratings lag behind: «Сейчас смотрят» 2026-10-24, 19 of 111 off by 0.2+ (Клэйфейс CUB 9.0, IMDb 7.6), and a
    // fresh title's rating moves for weeks. So CUB's value is shown only until IMDb answers, and the rating of a title out
    // less than half a year is asked again daily, others every 14 days.
    function ttl(data) {
        var d = Date.parse(data && (data.release_date || data.first_air_date) || '');
        return !d || Date.now() - d < 180 * 864e5 ? 864e5 : TTL;
    }
    function rating(data) { // { r: '7.6' | '-' } asked from IMDb, or null
        var c = load()[imdbOf(data)];
        return c && c.v === 2 ? c : null;
    }
    function fresh(data) { var c = rating(data); return !!c && Date.now() - c.t < ttl(data); }
    function known(data) {
        var c = rating(data);
        if (c) return c.r === '-' ? null : c.r;
        var r = parseFloat(data && data.imdb_rating);
        return r > 0 ? r.toFixed(1) : null;
    }

    // ---- IMDb ratings: IMDb's own API, many titles per request; OMDb only if IMDb does not answer ----
    // OMDb sits behind Cloudflare: on the TV's direct Moscow line (2026-10-23) a request hung 30 s and the badge stayed
    // empty «через раз». caching.graphql.imdb.com answered every time (~0.6 s) and takes a whole screen of titles at once.
    var IMDB = 'https://caching.graphql.imdb.com/';
    var IMDB_HEADERS = { 'Content-Type': 'application/json', 'x-imdb-client-name': 'imdb-web-next-localized' };
    // IMDb silent (a torrent filling the line): OMDb only for titles showing no number at all, and for 5 min the others are
    // not asked — a few main-page visits would otherwise spend the owner's 1000/day OMDb key, shared with ratings+ (ko3ik)
    var queue = [], asked = {}, flushTimer = null, running = 0, imdbDownUntil = 0;
    function omdb(tt, done) {
        var key = Lampa.Storage.get('ratings_omdb_key', '');
        if (!key) return done(undefined);
        var net = new Lampa.Reguest();
        net.timeout(10000);
        net.silent('https://www.omdbapi.com/?apikey=' + encodeURIComponent(key) + '&i=' + encodeURIComponent(tt), function (j) {
            done(j && j.imdbRating && j.imdbRating !== 'N/A' ? parseFloat(j.imdbRating).toFixed(1) : null);
        }, function () { done(undefined); });
    }
    function imdbBatch(ids, done) { // → { tt: '8.2' | null } or null when IMDb did not answer
        var net = new Lampa.Reguest();
        net.timeout(10000);
        // IMDb answers only its own site in a browser (CORS); Lampa's native request has no such limit
        net['native'](IMDB, function (json) {
            try {
                if (typeof json === 'string') json = JSON.parse(json);
                var out = {};
                json.data.titles.forEach(function (t) {
                    var r = t && t.ratingsSummary && t.ratingsSummary.aggregateRating;
                    if (t) out[t.id] = r ? Number(r).toFixed(1) : null;
                });
                done(out);
            } catch (e) { done(null); }
        }, function () { done(null); }, JSON.stringify({ query: '{ titles(ids: ' + JSON.stringify(ids) + ') { id ratingsSummary { aggregateRating } } }' }),
        { headers: IMDB_HEADERS, dataType: 'json' });
    }
    function settle(job, r) {
        delete asked[job.tt]; // a later ask goes to the cache, or asks again after a failure
        if (r !== undefined) remember(job.tt, r || '-'); // '-' = IMDb has no rating
        job.cbs.forEach(function (cb) { cb(r === undefined ? undefined : r || null); }); // undefined = IMDb did not answer
    }
    function flush() {
        flushTimer = null;
        if (!queue.length || running >= 2) return;
        var jobs = queue.splice(0, 25);
        running++;
        imdbBatch(jobs.map(function (j) { return j.tt; }), function (res) {
            running--;
            if (res) jobs.forEach(function (j) { settle(j, j.tt in res ? res[j.tt] : undefined); });
            else {
                imdbDownUntil = Date.now() + 5 * 60 * 1000;
                jobs.forEach(function (j) { if (j.need) omdb(j.tt, function (r) { settle(j, r); }); else settle(j, undefined); });
            }
            if (queue.length) flush();
        });
    }
    function ask(tt, cb, need) { // need: nothing is shown for it yet
        if (!need && Date.now() < imdbDownUntil) return cb(undefined);
        if (asked[tt]) { asked[tt].need = asked[tt].need || need; return asked[tt].cbs.push(cb); }
        var job = asked[tt] = { tt: tt, cbs: [cb], need: !!need };
        queue.push(job);
        if (!flushTimer) flushTimer = setTimeout(flush, 150); // a screen of tiles comes in one burst → one request
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
        vote.setAttribute('data-imdb', tier(value));
        vote.style.display = '';
    }

    // rating → colour band: 8+ green, 7 light green, 6 IMDb yellow, 5 orange, below red
    function tier(value) {
        var r = parseFloat(value);
        return r >= 8 ? '8' : r >= 7 ? '7' : r >= 6 ? '6' : r >= 5 ? '5' : '0';
    }

    function tile(card) {
        if (card.__imdbDone) return;
        var data = card.card_data;
        if (!data || data.cub_hundred_fire) return; // «сотня» CUB shows fire counts, not a rating
        card.__imdbDone = true;
        var shown = known(data);
        paint(card, shown); // the last IMDb answer, else CUB's value, until IMDb answers now
        if (fresh(data)) return;
        var update = function (r) { if (r !== undefined) paint(card, r); }; // IMDb silent: keep what is shown
        whenVisible(card, function () {
            var tt = imdbOf(data);
            if (tt) return ask(tt, update, !shown);
            imdbId(data, function (id) {
                if (!id) return;
                var d = Object.assign({}, data, { imdb_id: id });
                if (fresh(d)) return paint(card, known(d));
                ask(id, update, !shown);
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
            remember(key, id || '-', true);
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
    style.textContent = '.card__vote.card__vote--imdb{background:#f5c518;color:#000;font-weight:700}' +
        '.card__vote--imdb[data-imdb="8"]{background:#1e9e4a;color:#fff}' +
        '.card__vote--imdb[data-imdb="7"]{background:#8bc34a;color:#000}' +
        '.card__vote--imdb[data-imdb="5"]{background:#ff9800;color:#000}' +
        '.card__vote--imdb[data-imdb="0"]{background:#e53935;color:#fff}' +
        '.rate--tmdb{display:none!important}'; // the movie card's TMDB badge (only that template uses the class)
    document.head.appendChild(style);

    // ---- 2) movie card: keep a known IMDb badge visible ----
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        var movie = e.data.movie;
        var body = e.body && e.body[0] ? e.body[0] : document;
        // Lampa writes CUB's (lagging) value into the badge; an IMDb answer replaces it, so the card says what the tile says.
        // Without an IMDb answer a badge the ratings plugin hid is put back with the known value.
        var guard = function () {
            var box = body.querySelector('.rate--imdb');
            var c = rating(movie), value = known(movie);
            if (!box || !value || (!c && !box.classList.contains('hide'))) return;
            box.classList.remove('hide');
            var divs = box.children;
            if (divs[0] && divs[0].textContent !== value) divs[0].textContent = value;
        };
        [1500, 3000, 6000, 12000].forEach(function (ms) { setTimeout(guard, ms); });
        // the card's own value may be CUB's (behind IMDb) or none at all (a card from TMDB: search, filter, «Похожие»), and
        // the ratings plugin's OMDb may not answer: the rating is asked from IMDb here; the tiles take it from the cache too
        var tt = imdbOf(movie);
        if (tt && !fresh(movie)) ask(tt, function () { guard(); }, !known(movie));
    });

    console.log('ImdbRatings', 'ready', window.lampa_tv_imdb_ratings);
})();
