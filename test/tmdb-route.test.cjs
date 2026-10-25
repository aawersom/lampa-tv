// node test/tmdb-route.test.cjs
// tmdb-route: a CUB card whose details CUB's proxy fails to give is asked once more, then loaded from TMDB.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tmdb-route.js'), 'utf8');

function load(cubAnswers) {
  const calls = [];
  const Lampa = {
    Storage: { get: () => '', set() {} }, Listener: { follow() {} }, TMDB: { key: () => 'k' },
    Api: { sources: {
      // core full$1: a failed main request still completes — with the side parts only, no `movie` (2026-10-24 review);
      // onerror only for DMCA cards and a 200 answer carrying status_code
      cub: { full: (params, ok, err) => { const a = cubAnswers.shift(); calls.push('cub ' + a); a === 'ok' ? ok({ movie: { source: 'cub' } }) : a === 'dmca' ? err() : ok({ persons: [] }); } },
      tmdb: { full: (params, ok, err) => { calls.push('tmdb ' + params.source); cubAnswers[0] === 'dmca' ? err() : ok({ movie: { source: 'tmdb' } }); } },
    } },
  };
  const $ = { ajax() {} };
  const noop = { addEventListener() {} };
  new Function('window', 'Lampa', '$', 'document', 'location', 'console', src)(noop, Lampa, $, noop, { protocol: 'http:' }, { log() {} });
  let result = null, failed = false;
  Lampa.Api.sources.cub.full({ method: 'movie', id: 550, source: 'cub' }, (j) => { result = j.movie && j.movie.source; }, () => { failed = true; });
  return { calls, result, failed };
}

let bad = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}
let r = load(['ok']);
check('CUB answers → CUB card, nothing else asked', [r.calls, r.result], [['cub ok'], 'cub']);
r = load(['fail', 'ok']);
check('CUB fails once → asked again, CUB card', [r.calls, r.result], [['cub fail', 'cub ok'], 'cub']);
r = load(['fail', 'fail']);
check('CUB fails twice → TMDB card', [r.calls, r.result, r.failed], [['cub fail', 'cub fail', 'tmdb tmdb'], 'tmdb', false]);
r = load(['dmca', 'dmca', 'dmca']);
check('DMCA card → onerror in the end, no loop', [r.calls.length, r.result, r.failed], [3, null, true]);
process.exitCode = bad ? 1 : 0;

// host order: mirrors first, TMDB itself last; every TMDB URL goes to the picked host; one network error re-picks
{
  const asked = [], follows = {};
  let answers = { 'lampa.byskaz.ru': true };
  const L = { Storage: { get: () => 'https://api.themoviedb.org/3/', set() {} }, Listener: { follow: (n, f) => { follows[n] = f; } }, TMDB: { key: () => 'k' }, Api: { sources: {} } };
  const $ = { ajax: (o) => { const h = o.url.split('/')[2]; asked.push(h); answers[h] ? o.success({ images: {} }) : o.error(); } };
  const noop = { addEventListener() {} };
  new Function('window', 'Lampa', '$', 'document', 'location', 'console', src)(noop, L, $, noop, { protocol: 'http:' }, { log() {} });
  check('start: byskaz asked first and picked (not TMDB itself, saved from before)', asked, ['lampa.byskaz.ru']);
  const e = { params: { url: 'https://api.themoviedb.org/3/movie/1/recommendations?api_key=k' } };
  follows.request_before(e);
  check('TMDB URL moved to the picked host', e.params.url, 'http://lampa.byskaz.ru/tmdb/api/3/movie/1/recommendations?api_key=k');
  answers = { 'tmdb-api.rootu.top': true };
  const realNow = Date.now; Date.now = () => realNow() + 60000; // past the 30-s pause
  follows.request_error({ params: { url: e.params.url }, error: { status: 0 } });
  Date.now = realNow;
  const e2 = { params: { url: 'https://api.themoviedb.org/3/movie/2?api_key=k' } };
  check('one network error → the mirrors after byskaz first', asked.slice(1), ['tmdb-api.rootu.top']);
  // byskaz answers /configuration but fails real requests: the error must not pick it again
  answers = { 'lampa.byskaz.ru': true, 'tmdbapi.bylampa.online': true };
  const asked2 = asked.length;
  Date.now = () => realNow() + 120000;
  follows.request_before(e2);
  follows.request_error({ params: { url: e2.params.url }, error: { status: 0 } });
  Date.now = realNow;
  check('a host that answers the probe but fails requests is not picked again', asked.slice(asked2), ['tmdbapi.bylampa.online']);
  process.exitCode = bad ? 1 : 0;
}
