/*
 * Lampa: русские раздачи — owner's TV tweak (Lampa 3.x, internal torrent client).
 * 1) Nothing is hidden: all parsers, all releases. Each release (row) is ranked on its own.
 *    Russian = Russian audio in track info, or (no track info and on a Russian/Ukrainian tracker).
 * 2) Sort key `RuSeeders` (selected as the default torrents sort):
 *      Russian releases first, then the rest,
 *      then releases whose year matches the film's year (wrong films with a similar title sink),
 *      then by seeders, descending.
 * Lampa's own sort is `items.sort` descending by item[torrents_sort] (interaction/filter.js),
 * so a computed numeric field is enough. Patched: Parser.get callback (adds the key) and the torrents
 * component's sortWithViewed (already-opened releases stay pinned on top, but also Russian-first).
 */
(function () {
    'use strict';
    if (window.lampa_tv_ru_torrents) return;
    window.lampa_tv_ru_torrents = '1.2.1';

    var KEY = 'RuSeeders';
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

    function process(json, params) {
        if (!json || !json.Results || !json.Results.length) return;
        var movie = (params && params.movie) || {};
        var year = parseInt(String(movie.release_date || movie.first_air_date || '').slice(0, 4), 10) || 0;
        var serial = !!(movie.number_of_seasons || movie.original_name);
        json.Results.forEach(function (x) {
            x[KEY] = russian(x) * 1e10 + yearRank(x, year, serial) * 1e9 + (parseInt(x.Seeders, 10) || 0);
        });
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

        // Lampa pins already-opened releases on top, ordered by seeders only (components/torrents.js
        // sortWithViewed). Keep the pin, but order the pinned ones by our key too.
        var Orig = Lampa.Component && Lampa.Component.get && Lampa.Component.get('torrents');
        if (Orig && !Orig.__ruTorrents) {
            var Comp = function (object) {
                Orig.call(this, object);
                var base = this.sortWithViewed;
                if (typeof base !== 'function') return;
                this.sortWithViewed = function () {
                    base.apply(this, arguments);
                    var r = object && object.__ruJson;
                    if (!r || !r.Results || Lampa.Storage.get('torrents_sort', '') !== KEY) return;
                    var pinned = [], other = [];
                    r.Results.forEach(function (a) { (a.viewed ? pinned : other).push(a); });
                    pinned.sort(function (a, b) { return (b[KEY] || 0) - (a[KEY] || 0); });
                    r.Results = pinned.concat(other);
                };
            };
            Comp.prototype = Orig.prototype;
            Comp.__ruTorrents = true;
            Lampa.Component.add('torrents', Comp);
        }

        // default sort: our key replaces plain «по сидам» / «популярные»; other manual choices are kept
        var s = Lampa.Storage.get('torrents_sort', 'popular');
        if (s === 'Seeders' || s === 'popular') Lampa.Storage.set('torrents_sort', KEY);

        console.log('RuTorrents', 'ready', window.lampa_tv_ru_torrents);
        return true;
    }

    if (!patch()) {
        var tries = 0;
        var t = setInterval(function () { if (patch() || ++tries > 60) clearInterval(t); }, 500);
    }
})();
