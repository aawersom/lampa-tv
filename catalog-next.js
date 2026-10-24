/*
 * Lampa: «Ещё» lists load ahead — owner's TV tweak (Lampa 3.x). Owner: «когда перехожу в "еще" для популярных, для
 * новинок и прочее, то нет автоподгрузки каталога»; «по дефолту должно загружаться сразу 2 страницы»; «за 6 строк до
 * конца начинал подгружать еще 2».
 * A full list (category_full) asks for the next page from the scroll's onEnd, and the scroll calls onEnd only when it
 * actually moves (Scroll startScroll: «Зачем начинать анимацию, если мы уже там?» → no scrollEnded at the same
 * position). The list also ignores onEnd for the first second after it is built (Next onLoadNext: builded_time).
 * The first page is 20 cards = 4 rows: pressed down through them within that second, the focus sits on the last row,
 * further presses move nothing, and no page ever comes (TV, «Прошлый год», 2026-10-18). A failed page request ends the
 * same way.
 * The same paging (core «Full» card grid) serves «Рекомендуем», «Релизы», «Избранное»/«История», «Подписки» and the
 * rest, so every such list is handled, recognised by its shape rather than its name.
 * Here: a list that opens asks for its second page as soon as it may (1 s after build); every Down press that leaves
 * the focus 6 rows or fewer above the last loaded row (cards on screen plus those loaded and not yet drawn) asks for
 * two more pages, one after the other. Pages are asked through the list's own onEnd, so its guards (one request at a
 * time, not past the last page) still hold.
 */
(function () {
    'use strict';
    if (window.lampa_tv_catalog_next) return;
    window.lampa_tv_catalog_next = '1.6.0';

    var AHEAD_ROWS = 6, PAGES = 2;

    // any card-grid list (core «Full» category: category_full, recomend, relise, favorite, subscribes, mytorrents…):
    // it pages through scroll.onEnd and buffers loaded cards in `loaded` / `limit_view`
    function isGrid(comp) {
        return !!(comp && comp.scroll && typeof comp.scroll.onEnd === 'function' && Array.isArray(comp.loaded) && typeof comp.limit_view === 'number' && comp.object);
    }

    function list() {
        var active = Lampa.Activity.active();
        var comp = active && active.activity && active.activity.component;
        return isGrid(comp) ? comp : null;
    }

    // CUB pages shift between requests (popularity order changes), so a title can come on two pages: «Прошлый год»,
    // 3 repeats in 100 cards (TV, 2026-10-18). Pages reach the screen through `loaded` (core Next pushes slices of
    // every page there), so a card already in the list is dropped on its way in.
    function dedupe(comp) {
        if (comp.loaded.__dedupe) return;
        var seen = {};
        var key = function (d) { return (d.media_type || (d.name || d.first_air_date ? 'tv' : 'movie')) + ':' + d.id; };
        var root = comp.activity && comp.activity.render ? comp.activity.render()[0] : null;
        if (root) Array.prototype.forEach.call(root.querySelectorAll('.card'), function (c) { if (c.card_data && c.card_data.id) seen[key(c.card_data)] = 1; });
        var loaded = comp.loaded;
        loaded.push = function () {
            var chunks = Array.prototype.map.call(arguments, function (chunk) {
                return (chunk || []).filter(function (d) { if (!d || !d.id) return true; var k = key(d); if (seen[k]) return false; seen[k] = 1; return true; });
            }).filter(function (chunk) { return chunk.length; });
            return chunks.length ? Array.prototype.push.apply(loaded, chunks) : loaded.length;
        };
        loaded.__dedupe = true;
    }

    function whenIdle(comp, fn) { // the list is built and has no page request in flight
        var tries = 0;
        (function check() {
            if (comp.destroyed || ++tries > 100) return;
            var ready = comp.items && comp.items.length && Date.now() - (comp.builded_time || 0) > 1100 && !comp.next_wait;
            if (ready) { dedupe(comp); fn(); } else setTimeout(check, 200);
        })();
    }

    function more(comp, pages) { // ask for up to `pages` next pages, one after the other
        if (comp.__moreBusy) return;
        comp.__moreBusy = true;
        (function step(left) {
            whenIdle(comp, function () {
                var page = comp.object.page;
                comp.scroll.onEnd();
                if (comp.object.page === page || left <= 1) { comp.__moreBusy = false; return; } // nothing asked (last page) or done
                step(left - 1);
            });
        })(pages);
        setTimeout(function () { comp.__moreBusy = false; }, 30000); // never stay busy after a lost request
    }

    function rowsLeft(comp) { // loaded rows below the focused card, counting loaded-but-not-drawn cards
        var root = comp.activity && comp.activity.render ? comp.activity.render()[0] : document;
        var cards = root.querySelectorAll('.card');
        var focus = root.querySelector('.card.focus');
        if (!focus || cards.length < 2) return -1;
        var perRow = 0, top = cards[0].offsetTop;
        while (perRow < cards.length && cards[perRow].offsetTop === top) perRow++;
        var total = cards.length;
        (comp.loaded || []).forEach(function (chunk) { total += chunk.length || 0; });
        var index = Array.prototype.indexOf.call(cards, focus);
        return Math.floor((total - 1) / perRow) - Math.floor(index / perRow);
    }

    Lampa.Listener.follow('activity', function (e) {
        if (e.type !== 'start' || !e.object) return;
        var tries = 0;
        (function wait() { // the grid exists only once its first page has come (a slow answer takes seconds)
            var comp = e.object.activity && e.object.activity.component;
            if (isGrid(comp)) {
                // once per list, whatever page it opens on (search «Ещё» starts at page 2, a page picked in «Навигация» at its own)
                if (!comp.__morePreloaded) { comp.__morePreloaded = true; more(comp, 1); }
                return;
            }
            if (++tries < 100 && !(comp && comp.destroyed)) setTimeout(wait, 200);
        })();
    });

    // Main page: the viewer's own «Продолжить просмотр» comes first (owner, 2026-10-23). Lampa registers it at index 1, and
    // every row registered after it (CUB, plugins) is inserted in front, so it ended up 7th, behind «Сейчас смотрят»,
    // «Недавние выходы», Shots, «Ближайшие выходы», «Рекомендуем». Here the same list (Favorite.continues — history minus
    // finished and dropped) is a row of its own moved to the top, and Lampa's copy is dropped. Lampa's copy also mixes in
    // titles with a new voiced episode from CUB notices — a CUB Premium feature this account does not have.
    var titleContinue = function () { return Lampa.Lang.translate('title_continue'); };
    if (Lampa.ContentRows && Lampa.ContentRows.add && Lampa.Favorite && Lampa.Favorite.continues) {
        Lampa.ContentRows.add({
            name: 'lampa_tv_continue_first', title: titleContinue(), index: 0, screen: ['main'],
            call: function () {
                var results = Lampa.Favorite.continues('tv');
                if (!results.length) return;
                var row = function (call) { call({ results: results, title: titleContinue(), lampa_tv_first: true }); };
                row.lampa_tv_first = true;
                return row;
            }
        });
        var callRows = Lampa.ContentRows.call;
        Lampa.ContentRows.call = function (screen, params, calls) {
            var res = callRows.apply(this, arguments);
            if (screen !== 'main' || !Array.isArray(calls)) return res;
            var mine = calls.filter(function (f) { return typeof f === 'function' && f.lampa_tv_first; })[0];
            if (!mine) return res;
            calls.forEach(function (f, i) {
                if (typeof f !== 'function' || f === mine) return;
                calls[i] = function (call) {
                    return f.call(this, function (json) {
                        call(json && json.title === titleContinue() && !json.lampa_tv_first ? { results: [] } : json);
                    });
                };
            });
            calls.splice(calls.indexOf(mine), 1);
            calls.unshift(mine);
            return res;
        };
    }

    // Search: a title that is exactly what was typed comes first (owner, 2026-10-23). CUB answers in rows «Фильмы»,
    // «Сериалы», «Аниме» in its own order: «Игра престолов» showed two documentaries first and the series third, in the
    // second row. Here, in the CUB and TMDB search sources, exact matches (Russian or original title, case/ё/punctuation
    // ignored) go to the front of their row and a row holding one goes first; everything else keeps its order.
    var norm = function (s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/g, ' ').trim(); };
    var exact = function (item, q) {
        return [item.title, item.name, item.original_title, item.original_name].some(function (t) { return t && norm(t) === q; });
    };
    function rankSearch(rows, query) {
        var q = norm(query);
        if (!q || !Array.isArray(rows)) return rows;
        rows.forEach(function (row) {
            if (!row || !Array.isArray(row.results)) return;
            var hit = row.results.filter(function (x) { return exact(x, q); });
            if (hit.length) row.results = hit.concat(row.results.filter(function (x) { return hit.indexOf(x) < 0; }));
            row.__exact = !!hit.length;
        });
        var first = rows.filter(function (r) { return r && r.__exact; });
        return first.concat(rows.filter(function (r) { return first.indexOf(r) < 0; }));
    }
    ['cub', 'tmdb'].forEach(function (name) {
        var src = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources[name];
        if (!src || typeof src.discovery !== 'function' || src.discovery.__ranked) return;
        var discovery = src.discovery;
        src.discovery = function () {
            var d = discovery.apply(this, arguments);
            if (d && typeof d.search === 'function') {
                var search = d.search;
                d.search = function (params, oncomplite) {
                    var query = params && params.query;
                    try { query = decodeURIComponent(query); } catch (e) { /* plain text */ }
                    return search.call(this, params, function (rows) {
                        try { rows = rankSearch(rows, query); } catch (e) { console.log('CatalogNext', 'search rank', e && e.message); }
                        oncomplite(rows);
                    });
                };
            }
            return d;
        };
        src.discovery.__ranked = true;
    });

    // «Огонь!»: CUB has 5 pages of it (100 titles, top/fire/movie|tv, 2026-10-24); owner: «мало выдачи в огонь». Once
    // CUB's pages end, the list goes on with TMDB's popular well-rated titles of the last years (CUB's own already shown
    // are skipped), so «Ещё» keeps loading.
    var FIRE_MORE = 45;
    var fireNext = {
        movie: function () { return 'discover/movie?sort_by=popularity.desc&vote_average.gte=7&vote_count.gte=300&primary_release_date.gte=' + (new Date().getFullYear() - 5) + '-01-01'; },
        tv: function () { return 'discover/tv?sort_by=popularity.desc&vote_average.gte=7.5&vote_count.gte=150&without_genres=10763,10764,10767&first_air_date.gte=' + (new Date().getFullYear() - 6) + '-01-01'; }
    };
    var cubSource = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.cub;
    if (cubSource && typeof cubSource.list === 'function' && !cubSource.list.__fire) {
        var cubList = cubSource.list, fireSeen = { movie: {}, tv: {} }, firePages = { movie: 5, tv: 5 };
        cubSource.list = function (params, oncomplite, onerror) {
            var m = /^top\/fire\/(movie|tv)\b/.exec(params && params.url || '');
            if (!m) return cubList.apply(this, arguments);
            var type = m[1], seen = fireSeen[type], page = parseInt(params.page, 10) || 1;
            var mark = function (list) { (list || []).forEach(function (x) { seen[x.id] = 1; }); };
            if (page <= firePages[type]) {
                return cubList.call(this, params, function (json) {
                    if (json && json.total_pages) firePages[type] = json.total_pages;
                    if (json) { mark(json.results); json.total_pages = firePages[type] + FIRE_MORE; }
                    oncomplite(json);
                }, onerror);
            }
            (function tmdbPage(p, tries) {
                Lampa.Api.sources.tmdb.list({ url: fireNext[type](), page: p }, function (json) {
                    var fresh = (json.results || []).filter(function (x) { return !seen[x.id]; });
                    mark(fresh);
                    var last = Math.min(FIRE_MORE, json.total_pages || 0);
                    if (!fresh.length && p < last && tries < 3) return tmdbPage(p + 1, tries + 1);
                    oncomplite(Object.assign({}, json, { results: fresh, page: page, total_pages: firePages[type] + last }));
                }, onerror);
            })(page - firePages[type], 0);
        };
        cubSource.list.__fire = true;
    }

    // «Рекомендуем посмотреть»: Lampa builds it from TMDB's recommendations for the titles in the history, one title every
    // 2 min, and keeps them in a cache of 100 (Storage.cache('recomends_list', 100)) for films and series together. The
    // owner's history is mostly series, so the main page (films only) had 28 (TV backup 2026-10-23). Here the cache keeps
    // 600, and after start the history titles not asked for 2 weeks get their recommendations at once (one every 1.5 s).
    var RECS = 'recomends_list', RECS_MAX = 600, RECS_DONE = 'lampa_tv_recs_done';
    var storageCache = Lampa.Storage.cache;
    if (typeof storageCache === 'function' && !storageCache.__recs) {
        Lampa.Storage.cache = function (name, max) {
            if (name === RECS) arguments[1] = Math.max(max || 0, RECS_MAX);
            return storageCache.apply(this, arguments);
        };
        Lampa.Storage.cache.__recs = true;
    }
    var KEEP = ['id', 'title', 'name', 'original_title', 'original_name', 'poster_path', 'backdrop_path', 'release_date', 'first_air_date',
        'vote_average', 'vote_count', 'genre_ids', 'original_language', 'popularity', 'media_type'];
    function recsFill() {
        if (!Lampa.Favorite || !Lampa.Favorite.get || !Lampa.TMDB || !Lampa.TMDB.api) return;
        var history = Lampa.Favorite.get({ type: 'history' }) || [];
        var done = Lampa.Storage.get(RECS_DONE, '{}'), now = Date.now(), minYear = new Date().getFullYear() - 20;
        var todo = history.filter(function (h) { return ['cub', 'tmdb'].indexOf(h.source) >= 0 && !(done[h.id] > now - 14 * 864e5); });
        var inHistory = {};
        history.forEach(function (h) { inHistory[h.id] = 1; });
        (function next(i) {
            if (i >= todo.length) return;
            var h = todo[i], type = h.number_of_seasons || h.seasons || h.first_air_date ? 'tv' : 'movie';
            var net = new Lampa.Reguest();
            net.timeout(10000);
            net.silent(Lampa.TMDB.api(type + '/' + h.id + '/recommendations?api_key=' + Lampa.TMDB.key() + '&language=' + (Lampa.Storage.field('tmdb_lang') || 'ru')), function (json) {
                var list = Lampa.Storage.cache(RECS, RECS_MAX, []), have = {};
                list.forEach(function (r) { have[r.id] = 1; });
                (json && json.results || []).forEach(function (r) {
                    var year = parseInt((r.first_air_date || r.release_date || '0').slice(0, 4), 10);
                    if (have[r.id] || inHistory[r.id] || !(year > minYear)) return;
                    var slim = { source: 'tmdb' };
                    KEEP.forEach(function (k) { if (r[k] !== undefined) slim[k] = r[k]; });
                    list.push(slim);
                    have[r.id] = 1;
                });
                Lampa.Storage.set(RECS, list.slice(-RECS_MAX));
                done[h.id] = Date.now();
                Lampa.Storage.set(RECS_DONE, done);
                setTimeout(function () { next(i + 1); }, 1500);
            }, function () { setTimeout(function () { next(i + 1); }, 1500); });
        })(0);
    }
    setTimeout(recsFill, 60000); // after the start's own requests

    Lampa.Keypad.listener.follow('down', function () {
        if (Lampa.Controller.enabled().name !== 'content') return;
        setTimeout(function () { // after Lampa has moved the focus
            var comp = list();
            if (!comp) return;
            if (comp.items && comp.items.length) dedupe(comp);
            var left = rowsLeft(comp);
            if (left >= 0 && left <= AHEAD_ROWS) more(comp, PAGES);
        }, 50);
    });
})();
