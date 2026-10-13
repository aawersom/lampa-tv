/*
 * Lampa: open cards blocked on copyright-holder request — owner's TV tweak (Lampa 3.x).
 * Lampa hides such cards two ways:
 *   1) window.lampa_settings.dcma — a list of blocked ids loaded from CUB; Api.full refuses them (utils dcma());
 *   2) CUB answers the card details with a stub {blocked: true}; the card shows «недоступно» (components/full).
 * Here: the list is always empty, and a stubbed card gets its details straight from TMDB (the CUB TMDB proxy
 * would answer with the same stub). Cards hidden by the LGBT setting are left alone.
 */
(function () {
    'use strict';
    if (window.lampa_tv_no_dmca) return;
    window.lampa_tv_no_dmca = '1.0.0';

    window.lampa_settings = window.lampa_settings || {};
    try {
        Object.defineProperty(window.lampa_settings, 'dcma', { get: function () { return false; }, set: function () {}, configurable: true });
    } catch (e) { window.lampa_settings.dcma = false; }

    var APPEND = 'content_ratings,release_dates,external_ids,keywords,alternative_titles,images';

    function fromTmdb(params, done) {
        var method = params.method === 'tv' ? 'tv' : 'movie';
        var url = 'https://api.themoviedb.org/3/' + method + '/' + params.id + '?api_key=' + Lampa.TMDB.key() +
            '&language=' + (Lampa.Storage.field('tmdb_lang') || 'ru') + '&append_to_response=' + APPEND;
        var net = new Lampa.Reguest();
        net.timeout(10000);
        net.silent(url, function (json) { done(json && json.id ? json : null); }, function () { done(null); });
    }

    function patch() {
        var sources = window.Lampa && Lampa.Api && Lampa.Api.sources;
        if (!sources || !sources.cub || !sources.cub.full || !Lampa.TMDB) return false;
        if (sources.cub.full.__noDmca) return true;
        var orig = sources.cub.full;
        var full = function (params, oncomplite, onerror) {
            return orig.call(this, params, function (data) {
                var movie = data && data.movie;
                if (!movie || !movie.blocked || movie.lgbt) return oncomplite(data);
                console.log('NoDMCA', 'stub from CUB, details from TMDB:', params.method, params.id);
                fromTmdb(params, function (json) {
                    if (json) { json.source = movie.source || 'tmdb'; data.movie = json; }
                    oncomplite(data); // TMDB unreachable → Lampa shows its usual «недоступно»
                });
            }, onerror);
        };
        full.__noDmca = true;
        sources.cub.full = full;
        return true;
    }

    if (!patch()) {
        var tries = 0;
        var timer = setInterval(function () { if (patch() || ++tries > 60) clearInterval(timer); }, 500);
    }
})();
