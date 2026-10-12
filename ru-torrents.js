/*
 * Lampa: русские раздачи — owner's TV tweak (Lampa 3.x, internal torrent client).
 * Nothing is hidden: all parsers, all releases. Each release (row) is ranked on its own.
 * 1) The same torrent (same btih) found by both parsers becomes one row with all its trackers.
 * 2) Whatever sort is chosen in «Сортировать», on top of it:
 *      Russian releases first, then the rest,
 *      then releases whose year matches the film's year (wrong films with a similar title sink);
 *    inside each group the chosen sort stays (default «Популярное»: films by seeders,
 *    series latest season first). Russian = Russian audio in track info, or (no track info and
 *    on a Russian/Ukrainian tracker).
 * Patched: Parser.get callback (merge + rank) and the torrents component's sortWithViewed, which Lampa
 * calls after every sort (components/torrents.js sortResults). Already-opened releases stay pinned on top.
 */
(function () {
    'use strict';
    if (window.lampa_tv_ru_torrents) return;
    window.lampa_tv_ru_torrents = '1.4.0';

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

    function patch() {
        if (!window.Lampa || !Lampa.Parser || !Lampa.Parser.get || Lampa.Parser.get.__ruTorrents) return false;
        var orig = Lampa.Parser.get;
        var wrapped = function (params, oncomplite, onerror) {
            return orig.call(this, params, function (json) {
                try {
                    process(json, params);
                    // the torrents component keeps exactly this object as its `results`
                    // non-enumerable: Lampa serialises the activity object into localStorage
                    if (params && typeof params === 'object') Object.defineProperty(params, '__ruJson', { value: json, writable: true, configurable: true, enumerable: false });
                } catch (e) { console.log('RuTorrents', 'process error', e && e.message); }
                oncomplite(json);
            }, onerror);
        };
        wrapped.__ruTorrents = true;
        Lampa.Parser.get = wrapped;

        // Lampa ends every sort with sortWithViewed (already-opened releases pinned on top). After it:
        // keep the pin, then our rank, then the chosen sort's own order (index = stable tie-break).
        var Orig = Lampa.Component && Lampa.Component.get && Lampa.Component.get('torrents');
        if (Orig && !Orig.__ruTorrents) {
            var Comp = function (object) {
                Orig.call(this, object);
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
