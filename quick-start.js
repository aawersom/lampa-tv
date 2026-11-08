/*
 * Lampa: quicker start of a torrent — owner's TV tweak (Lampa 3.x, TorrServer).
 * 1) File list: a film (one video file, or one file holding ≥ 85% of the video bytes — the rest are samples/extras)
 *    starts at once instead of Lampa's 10-second countdown; in a series the focus goes to the episode to watch next
 *    (the one watched last if unfinished, else the next one; nothing watched → the first) — the choice stays with the viewer.
 *    Lampa's marks lag when Lampa never heard back from MX; once TorrServer answers, a list opened by hand moves the focus
 *    to the episode «Продолжить» would play (its start record and the files streamed since — see 3).
 * 2) Preload: Lampa waits until TorrServer has PreloadCache % of its cache (one size for every file). Here the wait
 *    ends once ~10 seconds of THIS video are buffered (file size / runtime × 10 s); never more than TorrServer's own
 *    preload size. A start that resumes mid-file waits for the first bytes only: MX reads from its place, not the start.
 *    Done by trimming `preload_size` in TorrServer's `&stat` answers that Lampa polls (torrent.js preload).
 * 3) A list opened by «Продолжить» (ru-torrents, marked lampa_tv_play) plays at once: the episode chosen as in 1), or the film
 *    file played last; nothing to choose (all watched, several equal files never played) → the list stays. A session that
 *    ended without «Назад» in MX left Lampa no marks: then the episode started last (or the one MX went on to) plays,
 *    from Lampa's last mark of it. No record of the start in that release: the latest file TorrServer streamed.
 * 4) Lampa's video screensaver releases the hardware video decoder when it closes (it kept it, see below).
 * 5) «История» is the bookmark list again (Lampa 3.4 with CUB sync made it a screen of panels): OK opens the card.
 * 6) MX shows «Сезон 1 Серия 2: Название» for an episode. The core hands the external player only the episode's
 *    name (title = fname), so MX never said which season/episode plays. Every playlist entry is labelled too,
 *    so the title stays right when MX moves to the next file on its own.
 * 7) MX resumes from its own place (saved at every stop — TV off, «Домой» too) when it played this very file last: for that
 *    start the Lampa app is told the timecode mode «ask», which hands MX no position; every other start, the owner's
 *    own mode. Lampa's setting itself is never written.
 */
(function () {
    'use strict';
    if (window.lampa_tv_quick_start) return;
    window.lampa_tv_quick_start = '1.12.0';

    var BUFFER_SECONDS = 10;
    var MIN_BYTES = 3 * 1024 * 1024;

    // ---- 1) file list ----
    var rendered = [];

    function percent(el) { return (el.timeline && el.timeline.percent) || 0; }

    function choose(list, movie) {
        if (!list.length) return;
        // «Продолжить» (ru-torrents) marks its open: play at once — the episode to watch, or the film's file played last
        var play = movie && movie.lampa_tv_play;
        // the card says film or series; file names lie («1. Мадагаскар [HD1080].mkv» parses as episode 1)
        var serial = movie ? !!(movie.name || movie.number_of_seasons) : list.some(function (r) { return r.element.episode; });
        if (!serial) {
            var last = play && play.file !== undefined ? list.filter(function (r) { return r.element.id === play.file; })[0] : null;
            if (last) return last.item.trigger('hover:enter');
            var total = 0, main = list[0];
            list.forEach(function (r) { total += r.element.length || 0; if ((r.element.length || 0) > (main.element.length || 0)) main = r; });
            if (list.length === 1 || (main.element.length || 0) >= total * 0.85) main.item.trigger('hover:enter');
            return;
        }
        var p = pickEpisode(list, play), target = p.target;
        if (play) console.log('QuickStart', 'continue →', target ? 'S' + (target.element.season || '-') + 'E' + (target.element.episode || '-') + ' file ' + target.element.id : 'nothing to play', p.started ? 'started ' + play.file : 'no start record', 'streamed', p.opened.join(','), target && target.element.timeline && target.element.timeline.time ? 'from ' + target.element.timeline.time + ' s (Lampa mark)' : 'from the start');
        if (target && Lampa.Modal && Lampa.Modal.scroll) Lampa.Controller.collectionFocus(target.item, Lampa.Modal.scroll().render());
        if (target && play) target.item.trigger('hover:enter');
    }

    // The episode «Продолжить» plays: the choice only, no side effects — ru-torrents labels the button with it, so the
    // label and the play are one decision.
    function pickEpisode(list, play) {
        // the episode watched LAST (timeline `updated`), unfinished → it, finished → the next one. Not the first unfinished
        // one: an old half-watched episode pulled the viewer back (owner, 2026-10-18: E01 at 4 % reopened after E04–E05).
        var target = null, last = null, lastWatched = -1;
        list.forEach(function (r, i) {
            var t = r.element.timeline, p = percent(r.element);
            // equal times: the later episode (skipping through episodes in MX marks them all at once when the player closes)
            if (p > 0 && t && t.updated && (!last || t.updated >= last.element.timeline.updated)) last = r;
            if (!target && p > 0 && p < 90) target = r;
            if (p >= 90) lastWatched = i;
        });
        if (last) target = percent(last.element) < 90 ? last : list[list.indexOf(last) + 1] || null;
        else {
            // marks without a time (older ones): the first unfinished, else the one after the last finished
            if (!target && lastWatched >= 0 && lastWatched + 1 < list.length) target = list[lastWatched + 1];
            if (!target && lastWatched < 0) target = list[0]; // nothing watched yet: the first episode, not the season folder row
        }
        // «Продолжить» knows the file started last from Lampa and when (play.file/at) and the files TorrServer streamed since
        // (play.opened) — the episodes really played in that session. Only their marks count: returning from MX the Lampa
        // app may mark other playlist episodes «100 %» that never played (TV, 2026-10-23: S2E6 marked while S2E2 played).
        //  · a played episode has a mark newer than the start (MX left with «Назад»): the newest one, unfinished → it,
        //    finished → the next one;
        //  · no such mark (TV off, «Домой», screensaver — Lampa never heard back): the started episode, or a later one MX went
        //    on to, from Lampa's last mark of it. Not MX's own memory: the Lampa app always hands MX a position — the mark's
        //    time, or 1 ms when there is none (lampa-app MainActivity, playerTimeCode «continue»), so MX starts there
        //    (TV 2026-11-04: MX knew 15:28, got position=1, started over). 1.6–1.9.0 cleared that mark → the next
        //    «Продолжить» started the episode over; nothing is cleared now.
        var started = play && play.at ? list.filter(function (r) { return r.element.id === play.file; })[0] : null;
        var opened = play && play.opened || [];
        if (!started && play && opened.length) {
            // no record of the start in THIS release (the record was lost, or points to another release — TV 2026-10-28):
            // the files TorrServer streamed since the last start from Lampa still tell where the viewer was — the latest
            // of them, or the next one if Lampa saw it finished. Marks of the other episodes can be older than that session.
            var latest = null;
            list.forEach(function (r) { if (opened.indexOf(r.element.id) >= 0) latest = r; });
            if (latest) {
                target = percent(latest.element) >= 90 ? list[list.indexOf(latest) + 1] || null : latest;
            }
        }
        if (started) {
            var from = list.indexOf(started), fresh = null;
            var played = list.filter(function (r) { return r === started || opened.indexOf(r.element.id) >= 0; });
            played.forEach(function (r) {
                var t = r.element.timeline;
                if (percent(r.element) > 0 && t && t.updated >= play.at && (!fresh || t.updated >= fresh.element.timeline.updated)) fresh = r;
            });
            if (fresh) target = percent(fresh.element) < 90 ? fresh : list[list.indexOf(fresh) + 1] || null;
            else {
                target = started;
                played.forEach(function (r) { if (list.indexOf(r) > from) target = r; });
            }
        }
        return { target: target, started: started, opened: opened };
    }

    Lampa.Listener.follow('torrent_file', function (e) {
        if (e.type === 'list_open') {
            rendered = [];
            // list_open is sent before the list is built; the whole build is synchronous, so the next tick sees it finished
            var movie = e.params && e.params.movie, rows = rendered;
            setTimeout(function () {
                try {
                    choose(rows.slice(), movie);
                    if (!(movie && movie.lampa_tv_play)) focusByFacts(rows, movie);
                } catch (err) { console.log('QuickStart', err && err.message); }
            }, 0);
        } else if (e.type === 'render') {
            rendered.push({ item: e.item, element: e.element });
            if (rendered.length === 1 && e.element && e.element.torrent_hash) learnStreamed(e.element.torrent_hash, e.params && e.params.movie);
        }
    });

    // A series list opened BY HAND is focused by Lampa's marks first — they stop where Lampa last heard back from MX: Android
    // drops Lampa in the background during a long MX session (its answer then goes to nobody), TV off, the screensaver
    // (TV 2026-11-08: the list stood on S6E1, MX had played up to S6E5). TorrServer knows what was played: the start record
    // ru-torrents keeps in the release's data and the files streamed since. Once it answers, the focus moves to the episode
    // «Продолжить» would play — the focus only; not when the viewer has moved it, the list is closed, or another release
    // of the card was started later (this one's facts are older than the marks then).
    function focusByFacts(rows, movie) {
        var first = rows[0] && rows[0].element, url = Lampa.Torserver && Lampa.Torserver.url && Lampa.Torserver.url();
        if (!url || !first || !first.torrent_hash || !movie || !(movie.name || movie.number_of_seasons) || !Lampa.Modal || !Lampa.Modal.scroll) return;
        var hash = String(first.torrent_hash).toLowerCase(), base = url.replace(/\/$/, ''), net = new Lampa.Reguest();
        var was = pickEpisode(rows).target; // what choose() focused
        // TorrServer, which has just sent the list, answers in tens of ms; a later answer may find the viewer already past
        // the list (OK pressed, the episode starting) — the focus is not moved then
        var shown = Date.now();
        net.timeout(1000);
        net.silent(base + '/torrents', function (all) {
            var rec = startOf(all, hash, movie);
            if (!rec || !was) return;
            net.silent(base + '/viewed', function (viewed) {
                if (Date.now() - shown > 1000 || rows !== rendered || Lampa.Controller.enabled().name !== 'modal' || !was.item.hasClass('focus')) return;
                var opened = (Array.isArray(viewed) ? viewed : []).map(function (v) { return v.file_index; });
                var target = pickEpisode(rows, { file: rec.file, at: rec.at, opened: opened }).target;
                if (!target || target === was) return;
                console.log('QuickStart', 'list → S' + target.element.season + 'E' + target.element.episode, 'file ' + target.element.id, '(TorrServer: started ' + rec.file + ', streamed ' + opened.join(',') + '; Lampa marks said S' + was.element.season + 'E' + was.element.episode + ')');
                Lampa.Controller.collectionFocus(target.item, Lampa.Modal.scroll().render());
            }, function () {}, JSON.stringify({ action: 'list', hash: hash }));
        }, function () {}, JSON.stringify({ action: 'list' }));
    }
    // { file, at } of the last start of this release from Lampa (ru-torrents lampa_tv_play), unless another release of the
    // same card was started later
    function startOf(all, hash, movie) {
        var mine = null, others = 0; // the latest start of the card's other releases
        (Array.isArray(all) ? all : []).forEach(function (t) {
            var d;
            try { d = (typeof t.data === 'string' ? JSON.parse(t.data || '{}') : t.data) || {}; } catch (err) { d = {}; }
            var rec = d.lampa_tv_play, at = rec && rec.at || 0;
            if (String(t.hash).toLowerCase() === hash) mine = at ? rec : null;
            else if (d.movie && d.movie.id == movie.id && !!d.movie.name === !!movie.name && at > others) others = at;
        });
        return mine && mine.at >= others ? mine : null; // equal: a release tor-updater replaced carries the same record
    }

    // for ru-torrents: the button «Продолжить» says which episode it plays (same choice as the list makes)
    window.lampa_tv_pick_episode = pickEpisode;

    // ---- 7) MX resumes from ITS OWN place when it played this very file last ----
    // The Lampa app hands MX a position on every start: Lampa's mark, which moves only when MX is left with «Назад» (TV off,
    // «Домой», the screensaver — the mark stays where it was). In the app's «ask» mode (Lampa's «Тайм-код: спросить») it
    // hands none, and MX resumes from its own record — it saves the place at every stop, per file address (TV
    // 2026-11-04: MX knew 15:28, Lampa 14:38). So for one start the mode is «ask» when MX streamed this very file of this
    // release in its last session (TorrServer's list of streamed files of the release, reset at every start from Lampa),
    // and the next start is told the owner's own setting again. Not when the owner's setting is other than «continue»,
    // the episode is finished, or its mark was reset by hand.
    // The mode is told to the APP for each start, right before it (its bridge AndroidJS.storageChange — what the app's own
    // Lampa.Storage listener calls); Lampa's setting «Тайм-код» is never written. 1.10 wrote the setting and put it back
    // by a timer: a page the app reloaded behind MX lost the timer and left the owner on «Спрашивать» (TV 2026-11-06).
    // The app re-reads the real setting on every page load (lampa-app MainActivity.syncStorage) — nothing can stick.
    var streamed = {}; // release hash → file ids MX played in its last session
    function learnStreamed(hash, movie) {
        hash = String(hash).toLowerCase();
        var play = movie && movie.lampa_tv_play;
        streamed[hash] = (play && play.opened || []).concat(play && play.at ? [play.file] : []);
        var url = Lampa.Torserver && Lampa.Torserver.url && Lampa.Torserver.url();
        if (!url) return;
        var net = new Lampa.Reguest();
        net.timeout(3000);
        net.silent(url.replace(/\/$/, '') + '/viewed', function (list) {
            (Array.isArray(list) ? list : []).forEach(function (v) { if (streamed[hash].indexOf(v.file_index) < 0) streamed[hash].push(v.file_index); });
        }, function () {}, JSON.stringify({ action: 'list', hash: hash }));
    }
    function mxHasPlace(d) {
        var tl = d && d.timeline;
        if (!d || !d.torrent_hash || !tl || (streamed[String(d.torrent_hash).toLowerCase()] || []).indexOf(d.id) < 0) return false;
        return (tl.percent || 0) < 90 && !(!tl.percent && tl.updated);
    }
    function tellAppMode(d) {
        var app = window.AndroidJS, own = Lampa.Storage.field('player_timecode');
        if (!app || typeof app.storageChange !== 'function') return;
        var mode = own === 'continue' && mxHasPlace(d) ? 'ask' : own;
        app.storageChange(JSON.stringify({ name: 'player_timecode', value: mode }));
        if (mode !== own) console.log('QuickStart', 'MX resumes its own place: file', d.id, '(Lampa mark ' + Math.round(d.timeline.time || 0) + ' s)');
    }

    // ---- 2) preload ----
    function runtimeSeconds() {
        var a = Lampa.Activity.active() || {};
        var m = a.movie || a.card || {};
        var min = m.runtime || (m.episode_run_time && m.episode_run_time[0]) || (m.last_episode_to_air && m.last_episode_to_air.runtime) || 0;
        return min * 60;
    }

    // MX starts mid-file — at Lampa's mark, or at its own place (7) — and asks TorrServer for that place itself: the file's
    // start is not what it reads. Only the first bytes are waited for then (the release delivers at all). TV 2026-11-08:
    // after the nightly reboot TorrServer was cold, «Продолжить» stood 44 s on «8 / 241 · 676 Кбит/с» loading S6E5's
    // first seconds, and MX began at 44:09.
    function resumes(url) {
        var hash = String((/[?&]link=([^&]+)/.exec(url) || [])[1]).toLowerCase(), idx = parseInt((/[?&]index=(\d+)/.exec(url) || [])[1], 10);
        var el = rendered.map(function (r) { return r.element; }).filter(function (d) { return d && d.id === idx && String(d.torrent_hash).toLowerCase() === hash; })[0];
        var tl = el && el.timeline || {};
        if (!el || Lampa.Storage.field('player_timecode') !== 'continue' || (tl.percent || 0) >= 90) return false;
        return tl.time > 0 || mxHasPlace(el);
    }

    function enough(stat, url) {
        if (resumes(url)) return 1;
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

    // ---- 4) the screensaver lets the video decoder go ----
    // Lampa's Aerial screensaver removes its <video> from the page while it plays (screensaver destroy → html.remove()):
    // the hardware decoder (OMX.MTK.VIDEO.DECODER.AVC) and its memory stayed taken by Lampa for good (TV, 2026-10-19). MX
    // then got only a second decoder instance (HEVC.kick) that failed on the next file → software decoding, jerky picture;
    // and Lampa, bigger by ~70 MB, was the first app Android dropped during playback → Lampa restarted after the video.
    // On «stop» the video is still on the page: stopped and emptied there, the decoder is released at once.
    if (Lampa.Screensaver && Lampa.Screensaver.listener) {
        Lampa.Screensaver.listener.follow('stop', function () {
            var root = Lampa.Screensaver.html && Lampa.Screensaver.html[0];
            [].forEach.call(root ? root.querySelectorAll('video') : [], function (v) {
                try { v.pause(); v.removeAttribute('src'); v.load(); } catch (err) { /* already gone */ }
            });
        });
    }

    // ---- 5) «История» opens cards, as before Lampa 3.4 ----
    // With CUB sync Lampa 3.4 shows «История» as a new screen (watch_history): OK on a card opens a panel (progress, seasons,
    // days) instead of the card (owner, 2026-10-28: «как и раньше просто переходить в карточку»). Both ways in — the menu
    // and the remote's colour key — ask Favorite.historyActivity(); the old screen is the bookmark list «history».
    if (Lampa.Favorite && typeof Lampa.Favorite.historyActivity === 'function') {
        Lampa.Favorite.historyActivity = function () {
            return { component: 'favorite', type: 'history', title: Lampa.Lang.translate('title_history') };
        };
    }

    // ---- 6) MX: «Сезон 1 Серия 2: Название» ----
    // Torrent elements carry .season/.episode (core Arrays.extend in the file list); online_mod writes season and
    // episode into the title itself («S1 / Серия 2 - Название») and sends no .episode — such titles pass unchanged.
    function mxTitle(el) {
        if (!el || !el.episode) return;
        var name = String(el.title || '').trim();
        if (/сезон\s*\d|\d+\s*сезон|серия\s*\d|\d+\s*серия|s\d{1,2}\s*e\d/i.test(name)) {
            if (!/^серия\s*\d{1,4}$/i.test(name)) return; // the numbers are already there (online_mod, a replay)
            name = ''; // the bare «Серия N» placeholder would repeat the label
        }
        el.title = (el.season ? 'Сезон ' + el.season + ' ' : '') + 'Серия ' + el.episode + (name ? ': ' + name : '');
    }

    if (Lampa.Android && Lampa.Android.openPlayer) {
        var toPlayer = Lampa.Android.openPlayer;
        Lampa.Android.openPlayer = function (link, data) {
            try {
                if (data) { mxTitle(data); (data.playlist || []).forEach(mxTitle); }
            } catch (err) { console.log('QuickStart', 'mx title', err && err.message); }
            try { tellAppMode(data); } catch (err) { console.log('QuickStart', 'mx place', err && err.message); }
            return toPlayer.apply(this, arguments);
        };
    }

    console.log('QuickStart', 'ready', window.lampa_tv_quick_start);
})();
