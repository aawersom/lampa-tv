# lampa-tv

Small Lampa 3.x plugins for the owner's TV.

Installed on the TV (Lampa → Настройки → Расширения): every plugin below except `hide-kp.js` (taken off 2026-10-14,
the Kinopoisk rating was removed with the ko3ik ratings plugin instead). Lampa keeps only the URLs
(`https://aawersom.github.io/lampa-tv/<file>.js`) and downloads each plugin at every start with a `reset=<random>`
parameter, so a pushed change reaches the TV at its next Lampa start (GitHub Pages deploys in about a minute).
A copy of every plugin on the TV, these included, is kept in `D:\Works\lampa-plugins-mirror`.

Versions (2026-11-07, Lampa core 3.4.6): ru-torrents 1.23.0, similar 1.1.2, quick-start 1.11.0, no-dmca 1.1.0, poster-heal 1.4.0,
no-tv-channels 1.0.0, imdb-ratings 1.5.0, tmdb-route 1.3.0, catalog-next 1.6.2, tor-updater 0.1.6-tv.3, imdb-filter 1.0.3.
Tests: `for f in test/*.cjs; do node $f; done`.

- `ru-torrents.js` — torrent list (nothing hidden, each release ranked on its own):
  whatever sort is chosen in «Сортировать», Russian releases come first, then the rest; inside each group
  the film's own year first, then the chosen sort (default «Популярное»: films by seeders, series latest season first).
  The same torrent found by both parsers is shown once, with all its trackers and the larger seeders count.
  A film without its own filter opens unfiltered (no carry-over of the last filter used elsewhere).
  Opening a card already asks the parsers, so «Торренты» opens with the answer ready (one kept; dropped on use, card close or after 5 min).
  The release last opened for that card is added to TorrServer while the card is open (kept alive until the card closes, another release
  is pressed or 20 min pass), so pressing it lists the episodes at once: Game of Thrones 1-8 (243 GB) 12.2 s → 2.2 s on the TV.
  A card whose film/series was opened before (TorrServer keeps the release with its card) gets «Продолжить» next to «Смотреть»:
  plays at once — the episode to watch (in progress, else the next) or the film's file played last — from the release a file was
  started from last (every start from Lampa is noted in that release's own data in TorrServer; none noted → TorrServer's newest of the
  card), instead of «Смотреть» → «Торренты» → release → file; the button says what it plays («Продолжить · S2E5 · 14:20»);
  the warm-up uses the same release. A pressed release keeps the data TorrServer saved with it (TorrServer gives a resting torrent
  the data of Lampa's add instead — the start notes went with it; `node test/ru-torrents-boot.test.cjs`).
  Card buttons: «Смотреть» opens «Торренты» at once, the online source gets its own «Онлайн» button, no «Подписаться» bell.
  Spare parser: jac-red.ru is asked through Lampa's own Jackett request when the configured parsers fail, find nothing or are silent
  6 s (CUB's «engineer» module rewrites it in the settings at every start); one answer reaches Lampa.
  A series' release shows its bitrate: size / running time of the episodes its title says it holds (TMDB season times).
  Lampa's filter menu is built from only the releases that add a voice, tracker or season to it (same menu): opening «Торренты»
  with 880 releases no longer freezes the screen for 1 s (`node test/filter-menu.test.cjs` checks the menu stays the same).
  Filter: Качество, then Сезон — in the menu and in the chosen values next to «Фильтр» (Lampa cuts those at 25 characters).
  Episode list: «S01/101 Name.mkv» (season folder, episode as season×100+N) is read as S1E1 — TMDB names show and Lampa's marks move
  to the right number with their own time; an episode without a TMDB name shows its Russian name from the file or «Серия N», an extra
  its file name without folders and release tags.
- `hide-kp.js` — hides the Kinopoisk rating badge on the movie card; IMDb and TMDB stay.
- `similar.js` — bottom of a movie/series card: «Похожие» (shared TMDB themes + the director), cleaned «Рекомендации»,
  «Зрители IMDb смотрят также» (IMDb «More like this»); «Коллекция» unchanged; no title shown twice.
- `quick-start.js` — a film's file starts at once (no 10 s countdown; film/series taken from the card, not the file name);
  in a series the focus goes to the next episode; Lampa stops waiting for TorrServer's preload once ~10 s of that video are buffered.
  A list opened by «Продолжить» plays at once: the episode started last (or the one MX went on to), unless a newer mark says it was
  finished. MX resumes from its own place when it streamed that very file last (the Lampa app is told the timecode mode «ask» for that
  one start, through its bridge; the owner's setting is never written). MX titles episodes «Сезон 1 Серия 2: Название». «История»
  opens cards again (Lampa 3.4's panel screen is bypassed). The screensaver's video releases the hardware decoder when it stops.
- `no-dmca.js` — no content restrictions: cards blocked «по требованию правообладателя» open (Lampa's blocked-id list is ignored, a CUB stub
  is replaced with the card details from TMDB); the LGBT filter is off (its list is never loaded).
- `poster-heal.js` — each poster always from one of two hosts that let the WebView cache it for a year (nl/de.imagetmdb.com, chosen by
  the poster path, half each — twice the connections, repeat showings from the disk cache); every retry of a poster goes to the next working
  host (the other of nl/de, lampa.byskaz.ru, CUB), never the same twice; a host is set aside for 10 min only when 8 errors in 10 s *and* a
  check with one poster fail; posters Lampa gave up on, or whose retry hangs, are loaded again 3 s after a failure, on return, on network
  return and every 30 s (Cloudflare/OVH hosts only there, last).
- `no-tv-channels.js` — Lampa stops asking the app to rebuild its Android TV home-screen rows (the app bridge's
  `updateChannel` is muted, every other bridge call passes); the app's 15-minute timer is stopped separately (appops).
- `imdb-ratings.js` — poster tiles show the IMDb rating instead of TMDB (asked from IMDb by imdb_id, a row of tiles per request, once more 3 s later if IMDb is silent, no OMDb; TMDB external_ids
  when a list carries no imdb_id; CUB's lagging imdb_rating is shown only until IMDb answers; re-asked daily for titles out less than half a year, every 14 days for others; no number when IMDb is unknown; badge colour by rating: 8+ green, 7 light green, 6 yellow, 5 orange, lower red); on the movie card a known
  IMDb rating is put back when the ratings plugin hides it after a failed lookup; the card shows no TMDB badge.
- `tmdb-route.js` — TMDB API from a host this network can reach: every TMDB API request made through Lampa's request object (Lampa's own and
  plugins' hardcoded api.themoviedb.org URLs, by $.ajax or the Android app's native request; a plugin's own raw $.ajax is not seen) goes to the host picked by asking lampa.byskaz.ru/tmdb/api →
  tmdb-api.rootu.top → tmdbapi.bylampa.online → apitmdb.cub.best → api.themoviedb.org in turn (TMDB itself last: from the TV line it answers, then refuses) (not apitmdb.cub.black: cache-only, redirects misses to the blocked TMDB); picked again at start, when the network returns, when Lampa is visible
  again and after a failed TMDB request (next host first, at most every 30 s). A CUB card whose details CUB's own proxy fails to give (it answered 5 of 12 from the TV line) is asked once more, then loaded from TMDB.
- `catalog-next.js` — card-grid lists («Ещё», filter results, «Рекомендуем», «Релизы», «Избранное»/«История», «Подписки»…) load ahead: two pages as soon as the list opens, and two more whenever the focus gets
  within 6 rows of the last loaded row (fixes Lampa's list stalling at the end of page 1 when scrolled through quickly:
  its scroll asks for a page only when it moves, and ignores the first second); a title CUB sends again on a later page is not shown twice. Main page: own «Продолжить просмотр» first, Lampa's copy and the IPTV channels row of the same title dropped; «Огонь!» goes on after CUB's 100 titles with TMDB's popular well-rated ones of the last years (~650 films / ~650 series); «Рекомендуем посмотреть» keeps 600 recommendations instead of Lampa's 100 and fills them for the whole history after start; search puts the exact title first.
- `tor-updater.js` — a copy of WatherMG's [Lampa Tor Updater](https://github.com/WatherMG/lampa-tor-updater) v0.1.6 (MIT), used instead of
  the original, with three fixes. `episodeMap`: the original deep-copied Lampa's episode-list files through JSON; each file carries the card and the
  shared playlist (every entry with the card again), so a 73-episode list became tens of MB of JSON and the WebView renderer crashed ~3 s after
  the list opened. Now only id/path/length are copied. `writeFollow`: the update check (every 6 h per release, when its list opens) wrote the
  torrent's data it had read before searching the parsers, dropping the start ru-torrents noted there meanwhile (`node test/tor-updater-follow.test.cjs`);
  now it writes into the data TorrServer has at that moment. `applyUpdate` (a release replaced by its update): the start record goes to the
  new torrent read at that moment, its file ids moved by season/episode (`node test/tor-updater-play.test.cjs`). If upstream fixes all three, go back to the original URL.
- `imdb-filter.js` — Lampa's «Фильтр» by IMDb: CUB filters by the TMDB rating and only «от 8» works there (от 6/7 return everything,
  ranges are ignored; 2023 «от 8» = 17 films), while tiles and the card show IMDb. The filter runs on IMDb's advanced search (IMDb rating,
  votes, release dates, genres, original language, title type; by popularity, «В топе» = best rated with ≥ 25 000 votes, «Новинки» = newest
  with ≥ 5 000; lower bars for languages with a small IMDb audience) and each title becomes a TMDB card carrying its IMDb rating
  (2023 «от 8»: 228 films, «от 7»: 1033). The rating menu gets IMDb steps. CUB-only options (high quality, age rating, ongoing) keep
  CUB's list with the rating applied to its IMDb field.
- `tv/ts-watchdog.sh` — not a plugin: a watchdog run on the TV through adb (`adb push tv/ts-watchdog.sh /data/local/tmp/` and
  `adb shell 'setsid nohup sh /data/local/tmp/ts-watchdog.sh >/dev/null 2>&1 &'`; needs the static curl in /data/local/tmp). Once the
  torrserver process dies, the TorrServe app never starts it again (its shell job stays set), so Lampa cannot connect until the app is
  restarted. Every 30 s it asks 127.0.0.1:8090/echo; after two misses it restarts the app, closes the app's window with Back and logs the
  system's recent kill lines to /data/local/tmp/ts-watchdog.log. A restart that does not help doubles the wait (up to 30 min); without
  the curl it stops instead of restarting a working server every minute (`node test/ts-watchdog.test.cjs`, needs Git Bash).
  Lives until the TV reboots (TorrServe starts its server on boot by itself).
  Also needed once: `adb shell pm grant ru.yourok.torrserve android.permission.WRITE_SECURE_SETTINGS` — with the app's «accessibility»
  option on and no such permission it opens the TV's accessibility settings at every server start and its keep-alive service stays off.
