// node test/imdb-filter.test.cjs
// imdb-filter: what Lampa's «Фильтр» asks (CUB «?cat=…» or TMDB «discover/…») becomes the right IMDb constraints.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'imdb-filter.js'), 'utf8');
const body = src.slice(src.indexOf('    var PAGE = 20;'), src.indexOf('    function imdbPage'));
const { parse, constraints } = new Function(body + '; return { parse: parse, constraints: constraints };')();

let failed = 0;
function check(url, want, wantSort) {
  const f = parse(url);
  const c = constraints(f);
  const miss = want.filter((w) => c.text.indexOf(w) < 0);
  const sortOk = !wantSort || c.sort.indexOf(wantSort) === 0;
  const ok = !miss.length && sortOk;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + url);
  if (!ok) console.log('  missing', miss, sortOk ? '' : 'sort ' + c.sort, '\n  got', c.text);
}

check('?cat=movie&vote=8&airdate=2023&without_genres=16', ['anyTitleTypeIds: ["movie"]', 'aggregateRatingRange: { min: 8 }',
  'ratingsCountRange: { min: 100 }', 'start: "2023-01-01", end: "2023-12-31"', 'excludeGenreIds: ["Animation"]'], 'POPULARITY');
check('?cat=movie&vote=7-8&airdate=2017-2022&genre=18,35&without_genres=16', ['aggregateRatingRange: { min: 7, max: 8 }',
  'start: "2017-01-01", end: "2022-12-31"', 'allGenreIds: ["Drama","Comedy"]']);
check('?cat=movie&vote=1-6&airdate=2024&without_genres=16', ['aggregateRatingRange: { min: 1, max: 6 }']);
check('?cat=tv&vote=8&genre=10765', ['anyTitleTypeIds: ["tvSeries","tvMiniSeries"]', 'anyGenreIds: ["Sci-Fi","Fantasy"]']);
check('?cat=tv&vote=8&genre=10759,80', ['allGenreIds: ["Action","Crime"]']);
check('?cat=movie&genre=16&vote=7', ['allGenreIds: ["Animation"]']);
check('?cat=anime&vote=7.5', ['anyTitleTypeIds: ["tvSeries","tvMiniSeries"]', 'allGenreIds: ["Animation"]', 'anyPrimaryLanguages: ["ja"]',
  'ratingsCountRange: { min: 25 }']);
check('?cat=movie&vote=7&language=ru&without_genres=16', ['anyPrimaryLanguages: ["ru"]', 'ratingsCountRange: { min: 25 }']);
check('?cat=movie&sort=top&without_genres=16', ['ratingsCountRange: { min: 25000 }'], 'USER_RATING, sortOrder: DESC');
check('?cat=movie&sort=now&without_genres=16', ['ratingsCountRange: { min: 1000 }', 'end: "'], 'RELEASE_DATE, sortOrder: DESC');
check('discover/movie?vote_average.gte=8&primary_release_year=2023&without_genres=16&with_original_language=ru|uk',
  ['aggregateRatingRange: { min: 8 }', 'start: "2023-01-01"', 'anyPrimaryLanguages: ["ru","uk"]']);
check('discover/tv?vote_average.gte=6&vote_average.lte=8&first_air_date.lte=2025-12-31&first_air_date.gte=2021-01-01&with_genres=18',
  ['tvSeries', 'aggregateRatingRange: { min: 6, max: 8 }', 'start: "2021-01-01", end: "2025-12-31"', 'allGenreIds: ["Drama"]']);

const cubOnly = ['?cat=movie&vote=8&uhd=true', '?cat=movie&pgrating=12', '?cat=tv&sort=airing'].filter((u) => !parse(u).cubOnly);
if (cubOnly.length) { failed++; console.log('FAIL CUB-only options not detected:', cubOnly); } else console.log('ok   CUB-only options keep CUB');
process.exitCode = failed ? 1 : 0;
