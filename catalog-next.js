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
    window.lampa_tv_catalog_next = '1.4.0';

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
