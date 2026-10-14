/*
 * Lampa: better rows at the bottom of a movie/series card — owner's TV tweak (Lampa 3.x).
 * Replaces Lampa's «Рекомендации» and «Похожие» rows (raw TMDB; TMDB «similar» is mostly noise) with:
 *   «Похожие»                     — titles sharing several of this title's TMDB keywords (rarer keyword = more weight)
 *                                   plus the director's other films; same kind (animation or not), at least one common genre;
 *   «Рекомендации»                — TMDB recommendations without obscure titles (< 50 votes) and without repeats;
 *   «Зрители IMDb смотрят также»  — IMDb «More like this», mapped to TMDB cards.
 * «Коллекция» (the franchise) stays as Lampa builds it; a title is never shown twice.
 * Computed in the background once the viewer starts scrolling the card (opening is not delayed). Lampa appends the bottom rows
 * lazily while scrolling (components/full onScroll), so the not-yet-built rows are swapped in place.
 */
(function () {
    'use strict';
    if (window.lampa_tv_similar) return;
    window.lampa_tv_similar = '1.1.0';

    var IMDB = 'https://caching.graphql.imdb.com/';
    var IMDB_HEADERS = { 'Content-Type': 'application/json', 'x-imdb-client-name': 'imdb-web-next-localized', 'x-imdb-user-country': 'US', 'x-imdb-user-language': 'en-US' };
    var MIN_VOTES = 150;
    var memo = {};

    function tmdb(path, done) {
        if (memo[path]) return done(memo[path]);
        var net = new Lampa.Reguest();
        net.timeout(10000);
        var url = Lampa.TMDB.api(path + (path.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + Lampa.TMDB.key() + '&language=' + (Lampa.Storage.field('tmdb_lang') || 'ru'));
        net.silent(url, function (json) { memo[path] = json; done(json); }, function () { done(null); });
    }

    // IMDb answers only to its own site in a browser (CORS) — Lampa's native request has no such limit
    function imdbMoreLikeThis(tt, done) {
        if (!tt) return done([]);
        var query = 'query { title(id: "' + tt + '") { moreLikeThisTitles(first: 15) { edges { node { id } } } } }';
        var net = new Lampa.Reguest();
        net.timeout(10000);
        net['native'](IMDB, function (json) {
            try {
                if (typeof json === 'string') json = JSON.parse(json);
                done(json.data.title.moreLikeThisTitles.edges.map(function (e) { return e.node.id; }));
            } catch (e) { done([]); }
        }, function () { done([]); }, JSON.stringify({ query: query }), { headers: IMDB_HEADERS, dataType: 'json' });
    }

    function all(tasks, done) {
        var left = tasks.length, out = [];
        if (!left) return done(out);
        tasks.forEach(function (task, i) { task(function (res) { out[i] = res; if (--left === 0) done(out); }); });
    }

    function year(x) { return parseInt(String(x.release_date || x.first_air_date || '').slice(0, 4), 10) || 0; }

    function build(e, method, done) {
        var movie = e.data.movie, id = movie.id;
        var genres = (movie.genres || []).map(function (g) { return g.id; });
        var anim = genres.indexOf(16) >= 0;
        var seen = {};
        seen[id] = true;
        ((e.data.collection && e.data.collection.results) || []).forEach(function (x) { seen[x.id] = true; });

        function fits(x) {
            var g = x.genre_ids || [];
            var common = false;
            for (var i = 0; i < g.length; i++) if (genres.indexOf(g[i]) >= 0) common = true;
            return (common || !genres.length) && (g.indexOf(16) >= 0) === anim && x.poster_path;
        }

        function details(next) {
            if (movie.keywords && (movie.imdb_id || movie.external_ids)) return next(movie);
            tmdb(method + '/' + id + '?append_to_response=keywords,external_ids', function (d) { next(d || movie); });
        }

        details(function (d) {
            var kws = ((d.keywords && (d.keywords.keywords || d.keywords.results)) || []).slice(0, 10);
            var tt = d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || movie.imdb_id;
            var director = method === 'movie' && e.data.persons && e.data.persons.crew ? e.data.persons.crew.filter(function (c) { return c.job === 'Director'; })[0] : null;

            var tasks = kws.map(function (k) {
                return function (cb) { tmdb('discover/' + method + '?with_keywords=' + k.id + '&vote_count.gte=' + MIN_VOTES + '&sort_by=vote_count.desc', cb); };
            });
            tasks.push(function (cb) { director ? tmdb('person/' + director.id + '/movie_credits', cb) : cb(null); });
            tasks.push(function (cb) { imdbMoreLikeThis(tt, cb); });

            all(tasks, function (res) {
                var imdbIds = res.pop() || [];
                var credits = res.pop();
                var pool = {};
                function add(x, w, strong) {
                    if (seen[x.id] || !fits(x) || (x.vote_count || 0) < MIN_VOTES) return;
                    var p = pool[x.id] = pool[x.id] || { x: x, s: 0, n: 0, strong: false };
                    p.s += w; p.n++; p.strong = p.strong || strong;
                }
                res.forEach(function (d) {
                    if (!d || !d.results) return;
                    var weight = Math.log(5000 / Math.max(2, d.total_results || 0)); // rare keyword → strong signal
                    if (weight > 0) d.results.forEach(function (x) { add(x, weight, weight >= 5); }); // ≤ ~30 titles: a theme on its own
                });
                if (credits && credits.crew) credits.crew.forEach(function (x) { if (x.job === 'Director') add(x, 2.5, true); });

                // shared themes first; then a well-rated, widely seen title beats an obscure one
                function score(p) { return p.s + (p.x.vote_average || 0) / 4 + Math.log(p.x.vote_count || 1) / Math.LN10 / 2; }
                // one common everyday theme («support group», «friendship») is not similarity: such titles only top up a short row
                var ranked = Object.keys(pool).map(function (k) { return pool[k]; }).sort(function (a, b) { return score(b) - score(a); });
                var good = ranked.filter(function (p) { return p.n >= 2 || p.strong; });
                var similar = good.concat(good.length < 8 ? ranked.filter(function (p) { return good.indexOf(p) < 0; }).slice(0, 8 - good.length) : [])
                    .slice(0, 20).map(function (p) { seen[p.x.id] = true; return p.x; });

                var recommend = ((e.data.recomend && e.data.recomend.results) || []).filter(function (x) {
                    return !seen[x.id] && (x.vote_count || 0) >= 50 && x.poster_path && ((x.genre_ids || []).indexOf(16) >= 0) === anim;
                });
                recommend.forEach(function (x) { seen[x.id] = true; });

                all(imdbIds.map(function (t) {
                    return function (cb) { tmdb('find/' + t + '?external_source=imdb_id', cb); };
                }), function (found) {
                    var imdb = [];
                    found.forEach(function (f) {
                        var x = f && ((f.movie_results && f.movie_results[0]) || (f.tv_results && f.tv_results[0]));
                        if (x && !seen[x.id] && x.poster_path) { seen[x.id] = true; imdb.push(x); }
                    });
                    done([
                        { title: Lang('title_similar'), results: similar },
                        { title: Lang('title_recomendations'), results: recommend },
                        { title: 'Зрители IMDb смотрят также', results: imdb }
                    ].filter(function (r) { return r.results.length; }));
                });
            });
        });
    }

    function Lang(key) { return Lampa.Lang.translate(key); }

    function swap(e, rows) {
        var link = e.link;
        if (!link || !link.rows || !rows.length) return;
        var built = link.items ? link.items.length : 0;
        var at = -1;
        for (var i = link.rows.length - 1; i >= built; i--) {
            var r = link.rows[i];
            if (r && r[1] && (r[1] === e.data.recomend || r[1] === e.data.simular)) { link.rows.splice(i, 1); at = i; }
        }
        if (at < 0) return; // Lampa showed no such rows (child profile / adult filter) or they are already on screen
        rows.forEach(function (r) {
            r.results.forEach(function (x) { if (!x.source) x.source = 'tmdb'; });
            link.rows.splice(at++, 0, ['cards', r]);
        });
    }

    // Work only for a viewer who scrolls: the card is complete with its first rows built, and every row Lampa
    // builds after that comes from scrolling (components/full onScroll). Pressing «Смотреть» costs no requests.
    // The rows of a card seen this session are kept.
    var waiting = null;
    var done = {};

    function start(e) {
        var method = (e.object && e.object.method === 'tv') || e.data.movie.number_of_seasons ? 'tv' : 'movie';
        var key = method + e.data.movie.id;
        if (done[key]) return swap(e, done[key]);
        try {
            build(e, method, function (rows) {
                done[key] = rows;
                try { swap(e, rows); } catch (err) { console.log('Similar', 'swap', err && err.message); }
            });
        } catch (err) { console.log('Similar', 'build', err && err.message); }
    }

    Lampa.Listener.follow('full', function (e) {
        if (e.type === 'complite' && e.data && e.data.movie && e.link) waiting = e;
        else if (e.type === 'build' && waiting && e.link === waiting.link) { var w = waiting; waiting = null; start(w); }
    });

    console.log('Similar', 'ready', window.lampa_tv_similar);
})();
