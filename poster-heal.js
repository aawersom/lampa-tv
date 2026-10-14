/*
 * Lampa: posters heal themselves — owner's TV tweak (Lampa 3.x).
 * A card gives up on its poster for good (components/card onerror: 15-s timer, then «retry» of the same src
 * counts as another error at once → after 3 the `.card__img-broken` stub with the region code and URL).
 * The timers keep running while Lampa is frozen behind the screensaver or the external player, so on return
 * a whole page of posters «times out» in the same millisecond; a Wi-Fi switch does the same.
 * Here a broken poster is loaded again: when Lampa becomes visible, when the network comes back, and every
 * 30 s while broken posters exist. The stub stays only if the new attempt fails too.
 */
(function () {
    'use strict';
    if (window.lampa_tv_poster_heal) return;
    window.lampa_tv_poster_heal = '1.0.0';

    var busy = false;

    function heal() {
        var stubs = document.querySelectorAll('.card__img-broken');
        if (!stubs.length || busy) return;
        busy = true;
        var left = stubs.length;
        var finish = function () { if (--left === 0) busy = false; };
        Array.prototype.forEach.call(stubs, function (stub) {
            var img = stub.previousElementSibling;
            var lines = stub.querySelectorAll('div > div');
            var src = lines.length ? lines[lines.length - 1].textContent.trim() : '';
            if (!img || !img.classList.contains('card__img') || !/^https?:\/\//.test(src)) return finish();
            var probe = new Image();
            var settled = false;
            var once = function (ok) {
                if (settled) return;
                settled = true;
                if (ok) {
                    img.onerror = function () {};
                    img.src = probe.src;
                    if (stub.parentNode) stub.parentNode.removeChild(stub);
                }
                finish();
            };
            setTimeout(function () { once(false); }, 20000); // a hung load must not block the next round
            probe.onload = function () { once(true); };
            probe.onerror = function () { once(false); };
            probe.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'heal=' + Date.now();
        });
    }

    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(heal, 2000); });
    window.addEventListener('online', function () { setTimeout(heal, 2000); });
    setInterval(heal, 30000);
})();
