/*
 * Lampa: «Фильтр» by IMDb — owner's TV tweak (Lampa 3.x, catalog source CUB or TMDB).
 * The tiles and the card show the IMDb rating (imdb-ratings), but Lampa's «Фильтр» asks CUB, which filters by the TMDB
 * rating and only «от 8» works there: «от 6/7» return everything (films with no votes too), ranges are ignored, and
 * «от 8» + 2023 gives 17 films, some of them IMDb 5.8 (checked 2026-10-18). Here the filter runs on IMDb's own advanced
 * search — IMDb rating, enough votes, release dates, genres, original language, title type; sorted by popularity (or best
 * rated / newest) — and each IMDb title becomes a TMDB card (Russian title and poster) that carries its IMDb rating.
 * «от 7» + 2023: 1079 films. The rating menu gets IMDb steps.
 * Options only CUB knows («Качество: высокое», «Возрастной рейтинг», «Онгоинги») keep CUB's list; the rating is then
 * applied to the IMDb rating CUB sends with every title.
 */
(function () {
    'use strict';
    if (window.lampa_tv_imdb_filter) return;
    window.lampa_tv_imdb_filter = '1.0.3';

    var SOURCE = 'imdb_filter';
    var PAGE = 20;
    var IMDB = 'https://caching.graphql.imdb.com/';
    var IMDB_HEADERS = { 'Content-Type': 'application/json', 'x-imdb-client-name': 'imdb-web-next-localized', 'x-imdb-user-country': 'US', 'x-imdb-user-language': 'en-US' };
    // TMDB genre → IMDb genres (an array = any of them); TMDB «Мыльная опера» has no IMDb genre
    var GENRES = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
        10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
        878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: ['Action', 'Adventure'], 10762: 'Family',
        10763: 'News', 10764: 'Reality-TV', 10765: ['Sci-Fi', 'Fantasy'], 10767: 'Talk-Show', 10768: 'War' };
    var RATING_STEPS = [['от 8', 8], ['от 7.5', 7.5], ['от 7', 7], ['от 6.5', 6.5], ['от 6', 6], ['от 5', 5],
        ['от 8 до 10', '8-10'], ['от 7 до 8', '7-8'], ['от 6 до 7', '6-7'], ['ниже 6', '1-6']];

    // ---- what the filter asked for (Lampa's request to CUB «?cat=…» or to TMDB «discover/…») ----
    function parse(url) {
        var q = {}, f = { genres: [], without: [], langs: [] };
        String(url).replace(/^[^?]*\?/, '').split('&').forEach(function (p) {
            var i = p.indexOf('=');
            if (i > 0) q[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
        });
        var list = function (v, sep) { return v ? String(v).split(sep).filter(Boolean) : []; };
        if (/^discover\//.test(url)) {
            f.type = /^discover\/tv/.test(url) ? 'tv' : 'movie';
            if (q['vote_average.gte']) f.min = parseFloat(q['vote_average.gte']);
            if (q['vote_average.lte']) f.max = parseFloat(q['vote_average.lte']);
            var y = q.primary_release_year || q.first_air_date_year;
            if (y) { f.from = y; f.to = y; }
            var lte = q['primary_release_date.lte'] || q['first_air_date.lte'], gte = q['primary_release_date.gte'] || q['first_air_date.gte'];
            if (lte) f.to = lte.slice(0, 4);
            if (gte) f.from = gte.slice(0, 4);
            f.genres = list(q.with_genres, ',');
            f.langs = list(q.with_original_language, '|');
        } else {
            f.type = q.cat === 'tv' || q.cat === 'anime' ? 'tv' : 'movie';
            if (q.vote) { var v = q.vote.split('-'); f.min = parseFloat(v[0]); if (v[1]) f.max = parseFloat(v[1]); }
            if (q.airdate) { var a = q.airdate.split('-'); f.from = a[0]; f.to = a[1] || a[0]; }
            f.genres = list(q.genre, ',');
            f.langs = list(q.language, ',');
            f.sort = q.sort || '';
            if (q.cat === 'anime') { if (f.genres.indexOf('16') < 0) f.genres.push('16'); if (f.langs.indexOf('ja') < 0) f.langs.push('ja'); }
            f.cubOnly = !!(q.uhd || q.pgrating || f.sort === 'airing');
        }
        f.without = list(q.without_genres, ',');
        return f;
    }

    // ---- IMDb advanced search ----
    function constraints(f) {
        var c = [];
        c.push('titleTypeConstraint: { anyTitleTypeIds: ' + JSON.stringify(f.type === 'tv' ? ['tvSeries', 'tvMiniSeries'] : ['movie']) + ' }');
        // enough votes: obscure titles go to the end of a popularity list anyway; best-rated and newest need a real crowd
        // (fresh releases get 9–10 from a few thousand votes; IMDb's own Top 250 asks for 25 000). Newest: 1000 votes —
        // 5000 left «фантастика 2025, новые» at 46 films, 1000 gives 87 (all genres of 2025: 489 → 1362), 2026-10-24.
        // Films in Russian, Ukrainian… get few IMDb votes, so the bar is lower when only such languages are asked for.
        var local = f.langs.length && f.langs.indexOf('en') < 0;
        var votes = f.sort === 'top' ? (local ? 2000 : 25000) : f.sort === 'now' ? (local ? 300 : 1000) : (local ? 25 : 100);
        var range = 'ratingsCountRange: { min: ' + votes + ' }';
        if (f.min || f.max) range = 'aggregateRatingRange: { ' + (f.min ? 'min: ' + f.min : '') + (f.min && f.max ? ', ' : '') + (f.max ? 'max: ' + f.max : '') + ' }, ' + range;
        c.push('userRatingsConstraint: { ' + range + ' }');
        var today = new Date().toISOString().slice(0, 10);
        var end = f.to ? f.to + '-12-31' : f.sort === 'now' ? today : '';
        if (f.sort === 'now' && end > today) end = today;
        if (f.from || end) c.push('releaseDateConstraint: { releaseDateRange: { ' + (f.from ? 'start: "' + f.from + '-01-01"' : '') + (f.from && end ? ', ' : '') + (end ? 'end: "' + end + '"' : '') + ' } }');
        var all = [], any = [], none = [];
        f.genres.forEach(function (id) {
            var g = GENRES[id];
            if (!g) return;
            if (typeof g === 'string') all.push(g);
            else if (f.genres.length === 1) any = g; // «Боевик и приключения» alone = either of them
            else all.push(g[0]);
        });
        f.without.forEach(function (id) { if (typeof GENRES[id] === 'string' && all.indexOf(GENRES[id]) < 0) none.push(GENRES[id]); });
        var g = [];
        if (all.length) g.push('allGenreIds: ' + JSON.stringify(all));
        if (any.length) g.push('anyGenreIds: ' + JSON.stringify(any));
        if (none.length) g.push('excludeGenreIds: ' + JSON.stringify(none));
        if (g.length) c.push('genreConstraint: { ' + g.join(', ') + ' }');
        if (f.langs.length) c.push('languageConstraint: { anyPrimaryLanguages: ' + JSON.stringify(f.langs) + ' }');
        var sort = f.sort === 'top' ? 'USER_RATING, sortOrder: DESC' : f.sort === 'now' ? 'RELEASE_DATE, sortOrder: DESC' : 'POPULARITY, sortOrder: ASC';
        return { text: '{ ' + c.join(', ') + ' }', sort: sort };
    }

    function imdbPage(c, after, done) {
        var query = 'query { advancedTitleSearch(first: ' + PAGE + (after ? ', after: ' + JSON.stringify(after) : '') +
            ', constraints: ' + c.text + ', sort: { sortBy: ' + c.sort + ' }) { total pageInfo { hasNextPage endCursor } ' +
            'edges { node { title { id titleText { text } ratingsSummary { aggregateRating } } } } } }';
        var net = new Lampa.Reguest();
        net.timeout(15000);
        // IMDb answers only its own site in a browser (CORS); Lampa's native request has no such limit
        net['native'](IMDB, function (json) {
            try {
                if (typeof json === 'string') json = JSON.parse(json);
                var s = json.data.advancedTitleSearch;
                done({ total: s.total, next: s.pageInfo.hasNextPage ? s.pageInfo.endCursor : null,
                    items: s.edges.map(function (e) {
                        var t = e.node.title;
                        return { tt: t.id, name: t.titleText && t.titleText.text, rating: t.ratingsSummary && t.ratingsSummary.aggregateRating };
                    }) });
            } catch (err) { done(null); }
        }, function () { done(null); }, JSON.stringify({ query: query }), { headers: IMDB_HEADERS, dataType: 'json' });
    }

    // pages come by cursor: page N needs page N-1's end. Lampa (and catalog-next) ask pages in order.
    var searches = {};
    function cursorFor(s, page, done) {
        if (page === 1) return done(null);
        if (s.cursors[page] !== undefined) return done(s.cursors[page]);
        fetchPage(s, page - 1, function (res) { done(res ? s.cursors[page] : undefined); });
    }
    function fetchPage(s, page, done) {
        if (s.pages[page]) return done(s.pages[page]);
        if (s.waiting[page]) return s.waiting[page].push(done);
        s.waiting[page] = [done];
        var finish = function (res) { var w = s.waiting[page]; delete s.waiting[page]; if (res) s.pages[page] = res; w.forEach(function (cb) { cb(res); }); };
        cursorFor(s, page, function (after) {
            if (page > 1 && !after) return finish(null);
            imdbPage(s.c, after, function (res) {
                if (!res) return finish(null);
                s.total = res.total;
                s.cursors[page + 1] = res.next;
                finish(res);
            });
        });
    }

    // ---- IMDb title → TMDB card ----
    var found = {};
    function tmdbCard(item, type, done) {
        var key = type + item.tt;
        if (found[key] !== undefined) return done(found[key]);
        var net = new Lampa.Reguest();
        net.timeout(10000);
        net.silent(Lampa.TMDB.api('find/' + item.tt + '?external_source=imdb_id&api_key=' + Lampa.TMDB.key() + '&language=' + (Lampa.Storage.field('tmdb_lang') || 'ru')), function (j) {
            var x = j && ((type === 'tv' ? j.tv_results : j.movie_results) || [])[0];
            found[key] = x || null;
            done(found[key]);
        }, function () { done(null); });
    }

    function cards(items, type, done) {
        var left = items.length, out = [];
        if (!left) return done(out);
        items.forEach(function (item, i) {
            tmdbCard(item, type, function (x) {
                if (x) {
                    var card = Object.assign({}, x, { source: 'tmdb', imdb_id: item.tt });
                    // no Russian title in TMDB → the original, often in Tamil or Kannada script: IMDb's English title reads better
                    var field = type === 'tv' ? 'name' : 'title';
                    if (item.name && !/[a-zа-яё]/i.test(card[field] || '')) card[field] = item.name;
                    if (item.rating) card.imdb_rating = Number(item.rating).toFixed(1); // imdb-ratings paints it at once, no OMDb lookup
                    if (type === 'tv' && !card.media_type) card.media_type = 'tv';
                    out[i] = card;
                }
                if (--left === 0) done(out.filter(Boolean));
            });
        });
    }

    // ---- CUB-only options: CUB's list, the rating applied to the IMDb rating CUB sends ----
    //      Few titles of a CUB page pass a rating (4K releases by date, IMDb 7.5+: about one in three pages), so CUB pages are
    //      read in batches until half a page is collected; the next page goes on from where this one stopped.
    var CUB_BATCH = 5;
    function cubList(params, f, oncomplite, onerror) {
        var cub = Lampa.Api.sources.cub;
        var url = String(params.url).replace(/([?&])vote=[^&]*&?/, '$1').replace(/[?&]$/, '');
        if (!f.min && !f.max) return cub.list(Object.assign({}, params, { url: url, source: 'cub' }), oncomplite, onerror);
        var fits = function (x) { var r = parseFloat(x.imdb_rating); return r > 0 && (!f.min || r >= f.min) && (!f.max || r <= f.max); };
        var s = searches['cub' + url] = searches['cub' + url] || { from: { 1: 1 }, pages: 0 };
        var page = parseInt(params.page, 10) || 1, from = s.from[page], out = [], scanned = 0, limit = page === 1 ? 40 : 20;
        if (!from) return oncomplite({ results: [], page: page, total_pages: page - 1 });
        (function batch() {
            var left = CUB_BATCH, got = [], failed = 0;
            for (var i = 0; i < CUB_BATCH; i++) (function (i) {
                cub.list(Object.assign({}, params, { url: url, source: 'cub', page: from + i }), function (json) {
                    if (json.total_pages) s.pages = json.total_pages;
                    got[i] = (json.results || []).filter(fits);
                    if (--left === 0) next();
                }, function () { failed++; got[i] = []; if (--left === 0) next(); });
            })(i);
            function next() {
                if (failed === CUB_BATCH && !out.length) return page > 1 ? oncomplite({ results: [], page: page, total_pages: page - 1 }) : onerror();
                got.forEach(function (list) { out = out.concat(list); });
                from += CUB_BATCH; scanned += CUB_BATCH;
                var more = s.pages ? from <= s.pages : failed === 0;
                if (more && out.length < PAGE / 2 && scanned < limit) return batch();
                if (more) s.from[page + 1] = from;
                oncomplite({ results: out, page: page, total_pages: more ? page + 1 : page, source: 'cub' });
            }
        })();
    }

    Lampa.Api.sources[SOURCE] = {
        list: function (params, oncomplite, onerror) {
            var f = parse(params.url || '');
            if (f.cubOnly) return cubList(params, f, oncomplite, onerror);
            var c = constraints(f), key = c.text + c.sort;
            var s = searches[key] = searches[key] || { c: c, cursors: {}, pages: {}, waiting: {}, total: 0 };
            var page = parseInt(params.page, 10) || 1;
            fetchPage(s, page, function (res) {
                if (!res) return page > 1 ? oncomplite({ results: [], page: page, total_pages: page - 1 }) : onerror();
                cards(res.items, f.type, function (list) {
                    oncomplite({ results: list, page: page, total_pages: Math.max(page, Math.min(500, Math.ceil(s.total / PAGE))), total_results: s.total, source: SOURCE });
                });
            });
        },
        clear: function () {}
    };

    // ---- the filter's result screen uses this source ----
    function filterScreen(object) {
        return object && object.component === 'category_full' && typeof object.url === 'string' &&
            (object.url.indexOf('?cat=') === 0 || object.url.indexOf('discover/') === 0) &&
            object.title === Lampa.Lang.translate('title_filter');
    }
    ['push', 'replace'].forEach(function (name) {
        var orig = Lampa.Activity[name];
        Lampa.Activity[name] = function (object) {
            if (filterScreen(object)) object.source = SOURCE;
            return orig.apply(this, arguments);
        };
    });

    // ---- rating menu: IMDb steps ----
    var select = Lampa.Select.show;
    Lampa.Select.show = function (params) {
        try {
            (params && params.items || []).forEach(function (it) {
                var items = it && it.items;
                if (!items || items.__imdb || !items.some(function (x) { return x.voite === '8-9'; })) return;
                var any = items[0], picked = items.filter(function (x) { return x.selected; })[0];
                items.splice(1, items.length - 1);
                RATING_STEPS.forEach(function (r) {
                    var x = { title: r[0] };
                    if (typeof r[1] === 'number') x.start = r[1]; else x.voite = r[1];
                    items.push(x);
                });
                if (picked && picked !== any) {
                    var same = items.filter(function (x) { return x.start === picked.start && x.voite === picked.voite; })[0];
                    picked.selected = false;
                    if (same) same.selected = true; else any.selected = true;
                }
                items.__imdb = true;
                it.title = 'Рейтинг IMDb';
            });
        } catch (err) { console.log('ImdbFilter', 'menu', err && err.message); }
        return select.apply(this, arguments);
    };

    console.log('ImdbFilter', 'ready', window.lampa_tv_imdb_filter);
})();
