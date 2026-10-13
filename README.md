# lampa-tv

Small Lampa 3.x plugins for the owner's TV.

- `ru-torrents.js` — torrent list (nothing hidden, each release ranked on its own):
  whatever sort is chosen in «Сортировать», Russian releases come first, then the rest; inside each group
  the film's own year first, then the chosen sort (default «Популярное»: films by seeders, series latest season first).
  The same torrent found by both parsers is shown once, with all its trackers and the larger seeders count.
  A film without its own filter opens unfiltered (no carry-over of the last filter used elsewhere).
- `hide-kp.js` — hides the Kinopoisk rating badge on the movie card; IMDb and TMDB stay.
- `similar.js` — bottom of a movie/series card: «Похожие» (shared TMDB themes + the director), cleaned «Рекомендации»,
  «Зрители IMDb смотрят также» (IMDb «More like this»); «Коллекция» unchanged; no title shown twice.
- `quick-start.js` — a film's file starts at once (no 10 s countdown; film/series taken from the card, not the file name);
  in a series the focus goes to the next episode; Lampa stops waiting for TorrServer's preload once ~10 s of that video are buffered.
- `no-dmca.js` — cards blocked «по требованию правообладателя» open: Lampa's blocked-id list is ignored, a CUB stub
  is replaced with the card details straight from TMDB. Own small version of the idea of levende's anti-dmca.js.
