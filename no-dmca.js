/*
 * Lampa: no content restrictions — owner's TV tweak (Lampa 3.x). Owner: «снимаем все ограничения полностью».
 * Copyright-holder blocks, two ways in Lampa:
 *   1) window.lampa_settings.dcma — a list of blocked ids loaded from CUB; Api.full refuses them (utils dcma());
 *   2) CUB answers the card details with a stub {blocked: true}; the card shows «недоступно» (components/full).
 *   → the list reads as empty; a stubbed card gets its details straight from TMDB (the CUB TMDB proxy
 *     would answer with the same stub).
 * LGBT filter: Lampa marks a card by CUB's list or TMDB keywords (on by setting or by a RU/BY IP) and blocks it,
 *   blurs its poster. Every check needs window.lampa_settings.lgbt (the list) → it reads as empty, and the list
 *   is never downloaded (disable_features.lgbt — what cub.red/plugin/lgbt did; that plugin is no longer needed).
 * CUB's ads (owner, 2026-11-18: «убери рекламу cub»): pre-roll adverts before a video that is not a torrent, banners
 *   in Lampa's own player. Requests to the hosts CUB's ad lists name fail at once — see 3) below. Works for adverts
 *   played by the core's own VAST player (vender/vast: XMLHttpRequest/fetch of this page); an advert CUB marks
 *   `vast_api: 3` goes through Google's IMA frame and is not reached from here (none on 2026-11-18).
 */
(function () {
    'use strict';
    if (window.lampa_tv_no_dmca) return;
    window.lampa_tv_no_dmca = '1.2.0';

    window.lampa_settings = window.lampa_settings || {};
    window.lampa_settings.disable_features = window.lampa_settings.disable_features || {};
    window.lampa_settings.disable_features.lgbt = true;
    ['dcma', 'lgbt'].forEach(function (name) {
        try {
            Object.defineProperty(window.lampa_settings, name, { get: function () { return false; }, set: function () {}, configurable: true });
        } catch (e) { window.lampa_settings[name] = false; }
    });

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
                if (!movie || !movie.blocked) return oncomplite(data);
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

    console.log('NoDMCA', 'ready', window.lampa_tv_no_dmca);
    if (!patch()) {
        var tries = 0;
        var timer = setInterval(function () { if (patch() || ++tries > 60) clearInterval(timer); }, 500);
    }

    // ---- 3) CUB's ads ----
    // Before a video that is not a torrent the core plays CUB's pre-roll adverts — a 3.8-s «Реклама» splash, then up to
    // two videos, «skip» after 15 s each (TV 2026-11-18, online source) — and shows banners in its own player. Its own
    // switches are closed to plugins: Account.hasPremium and VPN.code are read-only, the ad list (/api/ad/get/…) is
    // loaded before any plugin runs and kept inside the core. So the adverts are stopped where they come from: CUB's
    // lists name the hosts (the VAST addresses); a request from Lampa's page to such a host is sent to a closed local
    // port and fails at once, and the core's own error path (video(): 'error' → the next advert → ended) starts the
    // video. The hosts are kept between starts: the lists are asked for here seconds after the core has them. CUB's own
    // domains and Lampa's address are never blocked.
    // The splash is the core's too, shown whenever it has an advert to play. It reads the list again every hour
    // (VastManager.init: Timer.add(1 h, load)); that request is answered with an empty list, so from then on the core
    // has no adverts — no splash, no wait. Only the first hour after a Lampa start is left to the hosts above.
    var AD_KEY = 'lampa_tv_ad_hosts', DEAD = 'http://127.0.0.1:9/', EMPTY = 'data:application/json,{"ad":[]}', adHosts = {};
    var MINE = 'lampa_tv=1'; // marks the plugin's own reading of the lists: it must reach CUB
    function ownHosts() {
        var own = [typeof location !== 'undefined' && location.hostname || ''];
        try { own = own.concat(Lampa.Manifest.cub_domain, Lampa.Manifest.cub_mirrors || []); } catch (e) {}
        return own;
    }
    function isAdList(url) {
        if (typeof url !== 'string' || url.indexOf(MINE) >= 0 || !/\/api\/ad\/get\/[a-z]+$/.test(url.split('?')[0])) return false;
        if (ownHosts().indexOf(hostOf(url)) < 0) return false;
        console.log('NoAds', 'the core re-reads its ad list: answered with an empty one');
        return true;
    }
    function hostOf(url) {
        var m = /^(?:https?:)?\/\/([^\/:?#]+)/i.exec(typeof url === 'string' ? url : '');
        return m ? m[1].toLowerCase() : '';
    }
    function isAd(url) {
        var host = hostOf(url);
        if (!host || adHosts[host] !== true) return false;
        console.log('NoAds', 'blocked a request to', host);
        return true;
    }
    function keep(hosts) {
        var own = ownHosts();
        (Array.isArray(hosts) ? hosts : []).forEach(function (host) {
            if (typeof host === 'string' && host && own.indexOf(host) < 0) adHosts[host] = true;
        });
    }
    try { keep(Lampa.Storage.get(AD_KEY, '[]')); } catch (e) {}

    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (isAdList(url)) arguments[1] = EMPTY;
        else if (isAd(url)) arguments[1] = DEAD;
        return open.apply(this, arguments);
    };
    if (typeof window.fetch === 'function') {
        var realFetch = window.fetch;
        window.fetch = function (input) {
            if (isAd(typeof input === 'string' ? input : input && input.url)) return Promise.reject(new TypeError('NoAds: blocked'));
            return realFetch.apply(this, arguments);
        };
    }

    function learn() {
        if (!window.Lampa || !Lampa.Reguest || !Lampa.Manifest || !Lampa.Manifest.cub_domain) return false;
        ['preroll', 'banner'].forEach(function (api) {
            var net = new Lampa.Reguest();
            net.timeout(10000);
            net.silent(Lampa.Utils.protocol() + Lampa.Manifest.cub_domain + '/api/ad/get/' + api + '?' + MINE, function (json) {
                var list = json && Array.isArray(json.ad) ? json.ad : [];
                keep(list.map(function (ad) { return hostOf(ad && ad.url); }));
                try { Lampa.Storage.set(AD_KEY, Object.keys(adHosts)); } catch (e) {}
            }, function () {});
        });
        return true;
    }
    if (!learn()) {
        var learnTries = 0;
        var learnTimer = setInterval(function () { if (learn() || ++learnTries > 60) clearInterval(learnTimer); }, 500);
    }
})();
