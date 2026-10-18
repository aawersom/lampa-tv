/*
 * Lampa: quicker start of a torrent — owner's TV tweak (Lampa 3.x, TorrServer).
 * 1) File list: a film (one video file, or one file holding ≥ 85% of the video bytes — the rest are samples/extras)
 *    starts at once instead of Lampa's 10-second countdown; in a series the focus goes to the episode to watch next
 *    (the one in progress, else the one after the last watched, else the first) — the choice stays with the viewer.
 * 2) Preload: Lampa waits until TorrServer has PreloadCache % of its cache (one size for every file). Here the wait
 *    ends once ~10 seconds of THIS video are buffered (file size / runtime × 10 s); never more than TorrServer's own
 *    preload size. Done by trimming `preload_size` in TorrServer's `&stat` answers that Lampa polls (torrent.js preload).
 * 3) «Продолжить» on the card of a film/series opened before: the file list of the release used last, in one press.
 */
(function () {
    'use strict';
    if (window.lampa_tv_quick_start) return;
    window.lampa_tv_quick_start = '1.1.0';

    var BUFFER_SECONDS = 10;
    var MIN_BYTES = 3 * 1024 * 1024;

    // ---- 1) file list ----
    var rendered = [];

    function percent(el) { return (el.timeline && el.timeline.percent) || 0; }

    function choose(list, movie) {
        if (!list.length) return;
        // the card says film or series; file names lie («1. Мадагаскар [HD1080].mkv» parses as episode 1)
        var serial = movie ? !!(movie.name || movie.number_of_seasons) : list.some(function (r) { return r.element.episode; });
        if (!serial) {
            var total = 0, main = list[0];
            list.forEach(function (r) { total += r.element.length || 0; if ((r.element.length || 0) > (main.element.length || 0)) main = r; });
            if (list.length === 1 || (main.element.length || 0) >= total * 0.85) main.item.trigger('hover:enter');
            return;
        }
        var target = null, lastWatched = -1;
        list.forEach(function (r, i) {
            var p = percent(r.element);
            if (!target && p > 0 && p < 90) target = r;
            if (p >= 90) lastWatched = i;
        });
        if (!target && lastWatched >= 0 && lastWatched + 1 < list.length) target = list[lastWatched + 1];
        if (!target && lastWatched < 0) target = list[0]; // nothing watched yet: the first episode, not the season folder row
        if (target && Lampa.Modal && Lampa.Modal.scroll) Lampa.Controller.collectionFocus(target.item, Lampa.Modal.scroll().render());
    }

    Lampa.Listener.follow('torrent_file', function (e) {
        if (e.type === 'list_open') {
            rendered = [];
            // list_open is sent before the list is built; the whole build is synchronous, so the next tick sees it finished
            var movie = e.params && e.params.movie;
            setTimeout(function () { try { choose(rendered.slice(), movie); } catch (err) { console.log('QuickStart', err && err.message); } }, 0);
        } else if (e.type === 'render') rendered.push({ item: e.item, element: e.element });
    });

    // ---- 2) preload ----
    function runtimeSeconds() {
        var a = Lampa.Activity.active() || {};
        var m = a.movie || a.card || {};
        var min = m.runtime || (m.episode_run_time && m.episode_run_time[0]) || (m.last_episode_to_air && m.last_episode_to_air.runtime) || 0;
        return min * 60;
    }

    function enough(stat, url) {
        var idx = parseInt((/[?&]index=(\d+)/.exec(url) || [])[1], 10);
        var file = (stat.file_stats || []).filter(function (f) { return f.id === idx; })[0];
        var sec = runtimeSeconds();
        if (!file || !file.length || !sec) return 0;
        return Math.max(MIN_BYTES, Math.round(file.length / sec * BUFFER_SECONDS));
    }

    if (window.$ && $.ajaxPrefilter) {
        $.ajaxPrefilter(function (options) {
            var url = options.url || '';
            if (!/\/stream\/[^?]*\?link=[^&]+&index=\d+&(stat|preload)\b/.test(url)) return;
            var before = options.dataFilter;
            options.dataFilter = function (data, type) {
                if (before) data = before(data, type);
                try {
                    var stat = typeof data === 'string' ? JSON.parse(data) : data;
                    var need = enough(stat, url);
                    if (need && stat.preload_size && need < stat.preload_size) {
                        stat.preload_size = need;
                        return typeof data === 'string' ? JSON.stringify(stat) : stat;
                    }
                } catch (err) { /* not JSON — leave as is */ }
                return data;
            };
        });
    }

    // ---- 3) «Продолжить» on the card ----
    // TorrServer keeps every release Lampa opened with its card (data.movie; kept across restarts with «Сохранять в базу»).
    // The card of such a film/series gets «Продолжить» next to «Смотреть»: it opens the file list of the release used last
    // (Lampa's own «Мои торренты» path), where 1) starts the film or puts the focus on the episode to watch.
    // Instead of «Смотреть» → «Торренты» → release → episode.
    var ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 4.5v15L15 12z" fill="currentColor"/><rect x="16.5" y="4.5" width="3.5" height="15" rx="1" fill="currentColor"/></svg>';

    function lastRelease(card, done) {
        var url = Lampa.Torserver && Lampa.Torserver.url && Lampa.Torserver.url();
        if (!url || !card || !card.id) return;
        var net = new Lampa.Reguest(); // own request object: Lampa.Torserver's calls clear each other
        net.timeout(5000);
        net.silent(url.replace(/\/$/, '') + '/torrents', function (list) {
            var best = null;
            (Array.isArray(list) ? list : []).forEach(function (t) {
                var m = null;
                try { m = (typeof t.data === 'string' ? JSON.parse(t.data || '{}') : t.data || {}).movie; } catch (err) { /* not Lampa's */ }
                if (m && m.id == card.id && !!m.name === !!card.name && (!best || t.timestamp > best.timestamp)) best = t;
            });
            if (best) done(best.hash);
        }, function () {}, JSON.stringify({ action: 'list' }));
    }

    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie || !e.object || !e.object.activity) return;
        var card = e.data.movie, render = e.object.activity.render();
        lastRelease(card, function (hash) {
            var play = render.find('.button--play');
            if (!play.length || render.find('.button--continue').length) return;
            var btn = $('<div class="full-start__button selector button--continue">' + ICON + '<span>Продолжить</span></div>');
            btn.on('hover:enter', function () { Lampa.Torrent.open(hash, card); });
            play.after(btn);
            // the card's buttons are collected when it gets the focus; this one comes later
            if (Lampa.Controller.enabled().name === 'full_start') Lampa.Controller.collectionAppend(btn);
        });
    });

    console.log('QuickStart', 'ready', window.lampa_tv_quick_start);
})();
