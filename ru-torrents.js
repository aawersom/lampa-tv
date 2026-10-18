/*
 * Lampa: русские раздачи — owner's TV tweak (Lampa 3.x, internal torrent client).
 * Nothing is hidden: all parsers, all releases. Each release (row) is ranked on its own.
 * 1) The same torrent (same btih) found by both parsers becomes one row with all its trackers
 *    and the announce URLs of both magnets (one swarm: TorrServer asks every tracker for peers).
 * 2) Whatever sort is chosen in «Сортировать», on top of it:
 *      Russian releases first, then the rest,
 *      then releases whose year matches the film's year (wrong films with a similar title sink);
 *    inside each group the chosen sort stays (default «Популярное»: films by seeders,
 *    series latest season first). Russian = Russian audio in track info, or (no track info and
 *    on a Russian/Ukrainian tracker).
 * 3) A film without its own filter starts unfiltered (Lampa would reuse the last filter chosen for any film).
 * 4) Opening a card already asks the parsers; its «Торренты» list then opens with that answer (one kept, see below).
 * 5) The release last opened for that card is added to TorrServer while the card is open, so pressing it shows its
 *    files at once (see warmUp).
 * Patched: Parser.get callback (merge + rank) and the torrents component's sortWithViewed, which Lampa
 * calls after every sort (components/torrents.js sortResults). Already-opened releases stay pinned on top.
 */
(function () {
    'use strict';
    if (window.lampa_tv_ru_torrents) return;
    window.lampa_tv_ru_torrents = '1.8.0';

    var RANK = 'RuRank';
    var FOREIGN = ['piratebay', 'pirate bay', 'yts', 'knaben', '1337x', 'eztv', 'rarbg', 'torrentgalaxy', 'tgx',
        'nyaa', 'limetorrents', 'torlock', 'kickass', 'magnetdl', 'bitsearch', 'solidtorrents', 'glodls', 'zooqle',
        'btdig', 'torrentdownloads', 'idope', 'extratorrent', 'yourbittorrent', 'bt4g', 'therarbg'];

    function trackers(x) {
        return String(x.Tracker || '').toLowerCase().split(/\s*[,|;]\s*/).filter(Boolean);
    }

    function isForeign(name) {
        for (var i = 0; i < FOREIGN.length; i++) if (name.indexOf(FOREIGN[i]) >= 0) return true;
        return false;
    }

    function foreignOnly(x) {
        var t = trackers(x);
        if (!t.length) return false;
        for (var i = 0; i < t.length; i++) if (!isForeign(t[i])) return false;
        return true;
    }

    // 2 = track info shows Russian audio, 1 = unknown (no track info), 0 = track info says no Russian audio
    function ruAudio(x) {
        var p = x.ffprobe;
        if (!p || !p.length) return 1;
        var audio = p.filter(function (s) { return s && s.codec_type === 'audio'; });
        if (!audio.length) return 1;
        for (var i = 0; i < audio.length; i++) {
            var tags = audio[i].tags || {};
            var lang = String(tags.language || '').toLowerCase();
            var title = String(tags.title || '').toLowerCase();
            if (lang === 'rus' || lang === 'ru' || /рус|дубл|многоголос|одноголос|двухголос|russian/.test(title)) return 2;
        }
        return 0;
    }

    // 2 = title has the film's year, 1 = ±1 year or no year in title, 0 = other years only
    function yearRank(x, year, serial) {
        if (!year || serial) return 1;
        var ys = String(x.Title || '').match(/(?:19|20)\d\d/g);
        if (!ys) return 1;
        var best = 0;
        for (var i = 0; i < ys.length; i++) {
            var d = Math.abs(parseInt(ys[i], 10) - year);
            if (d === 0) return 2;
            if (d === 1) best = 1;
        }
        return best;
    }

    // Russian release = Russian audio known, or (audio unknown AND the release is on a Russian/Ukrainian tracker)
    function russian(x) {
        var a = ruAudio(x);
        if (a === 2) return 1;
        if (a === 0) return 0;
        return foreignOnly(x) ? 0 : 1;
    }

    function btih(x) {
        var m = /btih:([a-z0-9]+)/i.exec(String(x.MagnetUri || ''));
        return m ? m[1].toLowerCase() : '';
    }

    function announces(magnet) {
        return (String(magnet || '').match(/[?&]tr=[^&]*/g) || []).map(function (s) { return s.slice(1); });
    }

    // One torrent (same btih) reported by both parsers → one row: union of trackers, the larger
    // seeders/peers (both parsers count the same trackers, so summing would count them twice),
    // track info and «opened» mark from whichever copy has them. Different torrents never merge.
    function mergeSame(list) {
        var seen = {}, out = [];
        list.forEach(function (x) {
            var h = btih(x);
            if (!h) { out.push(x); return; }
            var base = seen[h];
            if (!base) { seen[h] = x; out.push(x); return; }
            var tr = trackers(base);
            trackers(x).forEach(function (t) { if (tr.indexOf(t) < 0) tr.push(t); });
            base.Tracker = tr.join(', ');
            // one swarm: TorrServer gets the announce URLs of both copies (more trackers → more peers found)
            var ann = announces(base.MagnetUri);
            announces(x.MagnetUri).forEach(function (a) {
                if (ann.indexOf(a) < 0) { ann.push(a); base.MagnetUri += '&' + a; }
            });
            base.Seeders = Math.max(parseInt(base.Seeders, 10) || 0, parseInt(x.Seeders, 10) || 0);
            base.Peers = Math.max(parseInt(base.Peers, 10) || 0, parseInt(x.Peers, 10) || 0);
            if ((!base.ffprobe || !base.ffprobe.length) && x.ffprobe && x.ffprobe.length) base.ffprobe = x.ffprobe;
            if (x.viewed) base.viewed = true;
        });
        return out;
    }

    function process(json, params) {
        if (!json || !json.Results || !json.Results.length) return;
        json.Results = mergeSame(json.Results);
        var movie = (params && params.movie) || {};
        var year = parseInt(String(movie.release_date || movie.first_air_date || '').slice(0, 4), 10) || 0;
        var serial = !!(movie.number_of_seasons || movie.original_name);
        json.Results.forEach(function (x) { x[RANK] = russian(x) * 3 + yearRank(x, year, serial); });
    }

    // 4) Prefetch. One answer is kept: the last opened card's, until it is used, the card is closed or 5 minutes pass
    //    (viewed marks inside it stay fresh). Opening another card replaces it.
    var PREFETCH_TTL = 5 * 60 * 1000;
    var prefetched = null;

    function searchKey(params) { return params && params.movie ? params.movie.id + '|' + params.search : ''; }

    function finish(p) { p.done = true; p.waiters.splice(0).forEach(function (f) { f(); }); }

    // the same search string the card's «Торренты» button builds (components/full start.js, setting parse_lang)
    function buttonSearch(card) {
        var year = ((card.first_air_date || card.release_date || '0000') + '').slice(0, 4);
        var t = card.title, o = card.original_title;
        return {
            df: o, df_year: o + ' ' + year, df_lg: o + ' ' + t, df_lg_year: o + ' ' + t + ' ' + year,
            lg: t, lg_year: t + ' ' + year, lg_df: t + ' ' + o, lg_df_year: t + ' ' + o + ' ' + year
        }[Lampa.Storage.field('parse_lang')];
    }

    // 5) Warm-up. Pressing a release makes Lampa add its magnet to TorrServer and ask for the file list every 2 s; for a
    //    magnet TorrServer first has to fetch the torrent's description from peers — Game of Thrones 1-8 (243 GB):
    //    8–11 s, the episode list came 12.2 s after the press (TV, 2026-10-18). The release opened before for this card
    //    (Lampa marks it: Storage torrents_view keeps Utils.hash(Title), results carry `viewed`) is added the same way as
    //    soon as the card's parser answer is in, and kept alive with a status request every 15 s (TorrServer drops a
    //    torrent nobody reads after 30 s) until the card closes, another release is pressed, the player starts or
    //    WARM_MAX passes. With «Сохранять в базу» on, TorrServer keeps the description and a warm-up takes 2–3 s.
    var WARM_MAX = 20 * 60 * 1000;
    var warm = null;

    function stopWarm() {
        if (warm) { clearInterval(warm.timer); warm = null; }
    }

    function warmUp(card, json) {
        stopWarm();
        var server = Lampa.Torserver && Lampa.Torserver.url && Lampa.Torserver.url();
        if (!server || !json || !json.Results) return;
        var view = Lampa.Storage.get('torrents_view', '[]') || [];
        var best = null, pos = -1;
        json.Results.forEach(function (r) {
            var i = r.viewed ? view.indexOf(r.hash) : -1;
            if (i > pos && (r.MagnetUri || r.Link)) { pos = i; best = r; }
        });
        if (!best) return;
        var net = new Lampa.Reguest(); // own request object: Lampa.Torserver's calls clear each other
        net.timeout(15000);
        var send = function (body, ok) { net.silent(server + '/torrents', ok || function () {}, function () {}, JSON.stringify(body)); };
        var w = warm = { id: card.id, title: best.Title, hash: '', started: Date.now() };
        // the body Lampa sends when the release is pressed (core Torserver.hash), so TorrServer keeps one and the same entry
        send({
            action: 'add', link: best.MagnetUri || best.Link, title: '[LAMPA] ' + (best.title || best.Title), poster: card.img || '',
            data: JSON.stringify({ lampa: true, movie: Lampa.Utils.clearCard ? Lampa.Utils.clearCard(card) : card }),
            save_to_db: Lampa.Storage.get('torrserver_savedb', 'false'), category: card.name ? 'tv' : 'movie'
        }, function (j) { if (j && j.hash) w.hash = j.hash; });
        w.timer = setInterval(function () {
            if (warm !== w || Date.now() - w.started > WARM_MAX) return stopWarm();
            if (w.hash) send({ action: 'get', hash: w.hash });
        }, 15000);
    }

    function patch() {
        if (!window.Lampa || !Lampa.Parser || !Lampa.Parser.get || Lampa.Parser.get.__ruTorrents) return false;
        var orig = Lampa.Parser.get;

        // the torrents component keeps exactly this object as its `results`
        // non-enumerable: Lampa serialises the activity object into localStorage
        function attach(params, json) {
            if (params && typeof params === 'object') Object.defineProperty(params, '__ruJson', { value: json, writable: true, configurable: true, enumerable: false });
        }

        function run(params, oncomplite, onerror) {
            return orig.call(Lampa.Parser, params, function (json) {
                try { process(json, params); attach(params, json); } catch (e) { console.log('RuTorrents', 'process error', e && e.message); }
                oncomplite(json);
            }, onerror);
        }

        var wrapped = function (params, oncomplite, onerror) {
            var p = prefetched;
            if (p && !params.from_search && searchKey(params) === p.key && Date.now() - p.time < PREFETCH_TTL) {
                prefetched = null;
                var serve = function () {
                    if (!p.json) return run(params, oncomplite, onerror); // the prefetch failed — ask again
                    attach(params, p.json);
                    oncomplite(p.json);
                };
                if (p.done) setTimeout(serve, 0); else p.waiters.push(serve);
                return;
            }
            return run(params, oncomplite, onerror);
        };

        // the card opened → ask the parsers what its «Торренты» button will ask (components/full start.js)
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite' || !e.data || !e.data.movie || !Lampa.Storage.field('parser_use')) return;
            var card = e.data.movie;
            var params = { url: '', component: 'torrents', search: buttonSearch(card), search_one: card.title, search_two: card.original_title, movie: card, page: 1 };
            var p = prefetched = { key: searchKey(params), id: card.id, time: Date.now(), done: false, json: null, waiters: [] };
            run(params, function (json) {
                p.json = json;
                finish(p);
                try { warmUp(card, json); } catch (err) { console.log('RuTorrents', 'warm-up error', err && err.message); }
            }, function () { finish(p); });
        });

        // the card closed (back from it, not into its torrents) → drop its answer and its warm-up
        Lampa.Listener.follow('activity', function (e) {
            if (e.type !== 'destroy' || e.component !== 'full' || !e.object) return;
            if (prefetched && e.object.id == prefetched.id) prefetched = null;
            if (warm && e.object.id == warm.id) stopWarm();
        });
        // another release pressed → the warmed one is not needed; the player started → TorrServer has a reader now
        Lampa.Listener.follow('torrent', function (e) {
            if (e.type === 'onenter' && warm && e.element && e.element.Title !== warm.title) stopWarm();
        });
        if (Lampa.Player && Lampa.Player.listener) Lampa.Player.listener.follow('start', stopWarm);
        wrapped.__ruTorrents = true;
        Lampa.Parser.get = wrapped;

        // Lampa ends every sort with sortWithViewed (already-opened releases pinned on top). After it:
        // keep the pin, then our rank, then the chosen sort's own order (index = stable tie-break).
        var Orig = Lampa.Component && Lampa.Component.get && Lampa.Component.get('torrents');
        if (Orig && !Orig.__ruTorrents) {
            var Comp = function (object) {
                Orig.call(this, object);
                // a film without its own filter starts unfiltered (Lampa falls back to the last filter used anywhere)
                this.getFilterData = function () {
                    var all = Lampa.Storage.get('torrents_filter_data', '{}') || {};
                    return all[this.cardID()] || {};
                };
                var base = this.sortWithViewed;
                if (typeof base !== 'function') return;
                this.sortWithViewed = function () {
                    base.apply(this, arguments);
                    var r = object && object.__ruJson;
                    if (!r || !r.Results) return;
                    r.Results = r.Results.map(function (a, i) { return { a: a, i: i }; }).sort(function (x, y) {
                        return (y.a.viewed ? 1 : 0) - (x.a.viewed ? 1 : 0) || (y.a[RANK] || 0) - (x.a[RANK] || 0) || x.i - y.i;
                    }).map(function (x) { return x.a; });
                };
            };
            Comp.prototype = Orig.prototype;
            Comp.__ruTorrents = true;
            Lampa.Component.add('torrents', Comp);
        }

        // 1.0–1.3 used their own sort key, which Lampa's sort menu doesn't list → back to Lampa's default
        if (Lampa.Storage.get('torrents_sort', 'popular') === 'RuSeeders') Lampa.Storage.set('torrents_sort', 'popular');

        console.log('RuTorrents', 'ready', window.lampa_tv_ru_torrents);
        return true;
    }

    if (!patch()) {
        var tries = 0;
        var t = setInterval(function () { if (patch() || ++tries > 60) clearInterval(t); }, 500);
    }
})();
