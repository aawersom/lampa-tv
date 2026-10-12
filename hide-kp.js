/*
 * Lampa: no Kinopoisk rating — owner's TV tweak (Lampa 3.x).
 * Hides the KP badge on the movie card (`.rate--kp`, filled by Lampa core or nb557 rating.js); IMDb and TMDB stay.
 */
(function () {
    'use strict';
    if (window.lampa_tv_hide_kp) return;
    window.lampa_tv_hide_kp = '1.0.0';

    var style = document.createElement('style');
    style.textContent = '.full-start__rate.rate--kp{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
})();
