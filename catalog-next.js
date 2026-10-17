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
 * Here: a list that opens asks for its second page as soon as it may (1 s after build); every Down press that leaves
 * the focus 6 rows or fewer above the last loaded row (cards on screen plus those loaded and not yet drawn) asks for
 * two more pages, one after the other. Pages are asked through the list's own onEnd, so its guards (one request at a
 * time, not past the last page) still hold.
 */
(function () {
    'use strict';
    if (window.lampa_tv_catalog_next) return;
    window.lampa_tv_catalog_next = '1.1.0';

    var AHEAD_ROWS = 6, PAGES = 2;

    function list() {
        var active = Lampa.Activity.active();
        var comp = active && active.activity && active.activity.component;
        if (!active || active.component !== 'category_full' || !comp || !comp.scroll || typeof comp.scroll.onEnd !== 'function') return null;
        return comp;
    }

    function whenIdle(comp, fn) { // the list is built and has no page request in flight
        var tries = 0;
        (function check() {
            if (comp.destroyed || ++tries > 100) return;
            var ready = comp.items && comp.items.length && Date.now() - (comp.builded_time || 0) > 1100 && !comp.next_wait;
            if (ready) fn(); else setTimeout(check, 200);
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
        if (e.type !== 'start' || e.component !== 'category_full') return;
        setTimeout(function () {
            var comp = list();
            if (comp && !comp.__morePreloaded && comp.object.page === 1) { comp.__morePreloaded = true; more(comp, 1); }
        }, 300);
    });

    Lampa.Keypad.listener.follow('down', function () {
        if (Lampa.Controller.enabled().name !== 'content') return;
        setTimeout(function () { // after Lampa has moved the focus
            var comp = list();
            if (!comp) return;
            var left = rowsLeft(comp);
            if (left >= 0 && left <= AHEAD_ROWS) more(comp, PAGES);
        }, 50);
    });
})();
