# lampa-tv

Small Lampa 3.x plugins for the owner's TV.

- `ru-torrents.js` — torrent list (nothing hidden, each release ranked on its own):
  whatever sort is chosen in «Сортировать», Russian releases come first, then the rest; inside each group
  the film's own year first, then the chosen sort (default «Популярное»: films by seeders, series latest season first).
  The same torrent found by both parsers is shown once, with all its trackers and the larger seeders count.
  A film without its own filter opens unfiltered (no carry-over of the last filter used elsewhere).
  Opening a card already asks the parsers, so «Торренты» opens with the answer ready (one kept; dropped on use, card close or after 5 min).
- `hide-kp.js` — hides the Kinopoisk rating badge on the movie card; IMDb and TMDB stay.
- `similar.js` — bottom of a movie/series card: «Похожие» (shared TMDB themes + the director), cleaned «Рекомендации»,
  «Зрители IMDb смотрят также» (IMDb «More like this»); «Коллекция» unchanged; no title shown twice.
- `quick-start.js` — a film's file starts at once (no 10 s countdown; film/series taken from the card, not the file name);
  in a series the focus goes to the next episode; Lampa stops waiting for TorrServer's preload once ~10 s of that video are buffered.
- `no-dmca.js` — no content restrictions: cards blocked «по требованию правообладателя» open (Lampa's blocked-id list is ignored, a CUB stub
  is replaced with the card details from TMDB); the LGBT filter is off (its list is never loaded).
- `poster-heal.js` — posters come from hosts reachable from Russia and abroad (imagetmdb.com → CUB → nl.imagetmdb.com → image.tmdb.org,
  next host after repeated errors); a poster Lampa gave up on («EE» + URL stub) is loaded again, from every host in turn: when Lampa is visible again
  (after the screensaver / external player), when the network returns, and every 30 s while such stubs exist.
- `no-tv-channels.js` — Lampa stops asking the app to rebuild its Android TV home-screen rows (the app bridge's
  `updateChannel` is muted, every other bridge call passes); the app's 15-minute timer is stopped separately (appops).
- `imdb-ratings.js` — poster tiles show the IMDb rating instead of TMDB (card data → cache → OMDb by imdb_id, TMDB external_ids
  when a list carries none; on-screen tiles only, cached 14 days; no number when IMDb is unknown); on the movie card a known
  IMDb rating is put back when the ratings plugin hides it after a failed lookup.
- `tmdb-route.js` — TMDB API from a host this network can reach: every TMDB API request (Lampa's own and plugins' hardcoded
  api.themoviedb.org URLs, $.ajax and the Android app's native requests) goes to the host picked by asking api.themoviedb.org →
  lampa.byskaz.ru/tmdb/api → tmdb-api.rootu.top → tmdbapi.bylampa.online → apitmdb.cub.best in turn (not apitmdb.cub.black: cache-only, redirects misses to the blocked TMDB); picked again at start, when the network returns, when Lampa is visible
  again and after 3 failed TMDB requests in 15 s.
