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
