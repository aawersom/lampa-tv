// node test/release-rank.test.cjs
// ru-torrents 2) rank. The parsers match releases by title: one Russian title often names several things (owner,
// 2026-11-09: «Игра на выживание», the 2020 Russian series, also names the US show Survivor and the anime «No Game No
// Life»; Lampa's series sort — highest season first — put Survivor's season 46 on top and the anime above season 1).
// On top of «Russian first»:
//  · a release JacRed files as another kind of thing (info.types, the tracker's category) sinks: a cartoon / anime /
//    TV show / documentary for a live-action series or film, a series for a film. Animated cards take every kind —
//    trackers file cartoons and anime as plain series too (Futurama, Attack on Titan);
//  · a series' release whose title has only years outside the years the series ran (±1) sinks, as films' wrong years do.
// Nothing is hidden.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const body = src.slice(src.indexOf("    var RANK = 'RuRank';"), src.indexOf('    // 4) Prefetch.'));
const { process: rank } = new Function(body + 'return { process: process };')();

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}
// ranked as the torrents list shows them: rank first, the parser's order inside a rank
function order(results, movie) {
  const json = { Results: results.map((r, i) => Object.assign({ MagnetUri: 'magnet:?xt=urn:btih:' + i.toString(16).padStart(8, '0') }, r)) };
  rank(json, { movie });
  return json.Results.map((r, i) => ({ r, i })).sort((a, b) => (b.r.RuRank || 0) - (a.r.RuRank || 0) || a.i - b.i).map((x) => x.r);
}
const rel = (Title, types, Tracker) => ({ Title, Tracker: Tracker || 'rutracker', Seeders: 5, info: types ? { types } : undefined });

// the owner's case, the parser's real answer
const igra = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'jacred-igra-na-vyzhivanie.json'), 'utf8')).Results;
const card = { id: 107703, name: 'Игра на выживание', original_name: 'Игра на выживание', first_air_date: '2020-08-31', last_air_date: '2022-05-23', number_of_seasons: 2, genres: [{ id: 10759, name: 'Боевик и Приключения' }] };
const ranked = order(igra, card);
const kinds = ranked.map((r) => r.info.types.join('+'));
check('«Игра на выживание»: all 20 releases of the series come first', kinds.slice(0, 20).every((k) => k === 'serial'), true);
check('…the anime and Survivor are below them, still listed', kinds.slice(20).sort(), ['anime', 'anime', 'anime', 'tvshow', 'tvshow']);

// a live-action series: another kind of thing sinks (Breaking Bad's «The Movie» is filed as a TV show; its year here kept inside the run, so only the kind decides)
const bb = { id: 1396, name: 'Во все тяжкие', original_name: 'Breaking Bad', first_air_date: '2008-01-20', last_air_date: '2013-09-29', genres: [{ id: 18, name: 'драма' }, { id: 80, name: 'криминал' }] };
check('series: a TV show / cartoon / documentary of the same name sinks below the series',
  order([rel('Во все тяжкие / Breaking Bad: The Movie (2013) WEB-DLRip', ['tvshow']), rel('Во все тяжкие (Мультфильм) (2012)', ['multfilm', 'multserial']), rel('Во все тяжкие (документальный) (2010)', ['docuserial', 'documovie']), rel('Во все тяжкие / Сезон 5 [2012-2013]', ['serial'])], bb).map((r) => r.Title.slice(0, 22)),
  ['Во все тяжкие / Сезон ', 'Во все тяжкие / Breaki', 'Во все тяжкие (Мультфи', 'Во все тяжкие (докумен']);
check('series: years outside the years it ran sink; inside, ±1, or no year stay in order',
  order([rel('Breaking Bad (2024) Remake', ['serial']), rel('Breaking Bad S01 [2008]', ['serial']), rel('Breaking Bad S05 (2014)', ['serial']), rel('Breaking Bad Complete', ['serial'])], bb).map((r) => r.Title),
  ['Breaking Bad S01 [2008]', 'Breaking Bad S05 (2014)', 'Breaking Bad Complete', 'Breaking Bad (2024) Remake']);
check('series still running (no end date): later years are not «outside»',
  order([rel('Show S03 (2025)', ['serial']), rel('Show S01 (2019)', ['serial']), rel('Show (2001) other', ['serial'])], { name: 'Show', original_name: 'Show', first_air_date: '2019-01-01', genres: [] }).map((r) => r.Title),
  ['Show S03 (2025)', 'Show S01 (2019)', 'Show (2001) other']);

// animated cards take every kind: trackers file them as plain series / films too
const futurama = { name: 'Футурама', original_name: 'Futurama', first_air_date: '1999-03-28', last_air_date: '2025-09-15', genres: [{ id: 16, name: 'мультфильм' }, { id: 35, name: 'комедия' }] };
check('cartoon series: «serial», «multserial», «anime» all stay in the parser\'s order',
  order([rel('Футурама 1-7 (1999-2013)', ['multserial']), rel('Футурама (2010)', ['multfilm', 'multserial']), rel('Футурама 8 сезон (2023)', ['serial']), rel('Футурама (2011)', ['anime'])], futurama).map((r) => r.Title),
  ['Футурама 1-7 (1999-2013)', 'Футурама (2010)', 'Футурама 8 сезон (2023)', 'Футурама (2011)']);
const titans = { name: 'Атака титанов', original_name: '進撃の巨人', original_language: 'ja', first_air_date: '2013-04-07', last_air_date: '2023-11-05', genre_ids: [16, 10759] };
check('anime (genre ids only, as in lists): «serial» releases stay',
  order([rel('Атака титанов 4 сезон (2020-2023)', ['serial']), rel('Атака титанов [TV-1] (2013)', ['anime'])], titans).map((r) => r.Title),
  ['Атака титанов 4 сезон (2020-2023)', 'Атака титанов [TV-1] (2013)']);

// documentary and reality series take their trackers' categories
const planet = { name: 'Наша планета', original_name: 'Our Planet', first_air_date: '2019-04-05', last_air_date: '2023-06-14', genres: [{ id: 99, name: 'документальный' }] };
check('documentary series: «docuserial», «tvshow» stay in order with «serial»',
  order([rel('Наша планета (2019) a', ['docuserial', 'documovie']), rel('Наша планета (2019) b', ['tvshow']), rel('Наша планета (2019) c', ['serial'])], planet).map((r) => r.Title.slice(-1)), ['a', 'b', 'c']);
const hero = { name: 'Последний герой', original_name: 'Последний герой', first_air_date: '2001-10-07', last_air_date: '2022-12-25', genres: [{ id: 10764, name: 'реалити-шоу' }] };
check('reality series: «tvshow» stays above another kind', order([rel('Последний герой (2001) x', ['multserial']), rel('Последний герой (2001) y', ['tvshow'])], hero).map((r) => r.Title.slice(-1)), ['y', 'x']);
const running = { name: 'Show', original_name: 'Show', first_air_date: '2019-01-01', last_air_date: '2020-05-01', in_production: true, genres: [] };
check('a series still in production: its last aired date is not its end', order([rel('Show (2001) other', ['serial']), rel('Show S03 (2025)', ['serial'])], running).map((r) => r.Title), ['Show S03 (2025)', 'Show (2001) other']);
check('an empty kind list is «not known» too', order([rel('Show (2019) x', []), rel('Show (2019) y', ['serial'])], running).map((r) => r.Title.slice(-1)), ['x', 'y']);

// films
const saw = { title: 'Пила', original_title: 'Saw', release_date: '2004-10-01', genres: [{ id: 27, name: 'ужасы' }] };
check('film: a series of the same name sinks', order([rel('Пила (сериал) (2004)', ['serial']), rel('Пила / Saw (2004) BDRip', ['movie'])], saw).map((r) => r.Title), ['Пила / Saw (2004) BDRip', 'Пила (сериал) (2004)']);
const madagascar = { title: 'Мадагаскар', original_title: 'Madagascar', release_date: '2005-05-25', genres: [{ id: 16, name: 'мультфильм' }] };
check('cartoon film: «movie», «multfilm+multserial» stay', order([rel('Мадагаскар (2005) BDRip', ['movie']), rel('Мадагаскар (2005) WEB', ['multfilm', 'multserial'])], madagascar).map((r) => r.Title), ['Мадагаскар (2005) BDRip', 'Мадагаскар (2005) WEB']);
const doc = { title: 'Мадагаскар', original_title: 'Madagascar', release_date: '2011-01-01', genres: [{ id: 99, name: 'документальный' }] };
check('documentary film: «documovie» stays above a series', order([rel('Мадагаскар (2011) s', ['serial']), rel('Мадагаскар (2011) d', ['documovie'])], doc).map((r) => r.Title.slice(-1)), ['d', 's']);
check('no kind known (no info, other parsers) → not sunk', order([rel('Пила 2004 x', null), rel('Пила / Saw (2004) y', ['movie'])], saw).map((r) => r.Title), ['Пила 2004 x', 'Пила / Saw (2004) y']);
check('Russian first stays above the kind: a foreign-only right release under a Russian one of the same kind',
  order([rel('Saw (2004) 1080p', ['movie'], 'piratebay'), rel('Пила (2004) BDRip', ['movie'])], saw).map((r) => r.Title), ['Пила (2004) BDRip', 'Saw (2004) 1080p']);
process.exitCode = failed ? 1 : 0;
