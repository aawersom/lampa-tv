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
      cub: { full: (params, ok, err) => { const a = cubAnswers.shift(); calls.push('cub ' + a); a === 'ok' ? ok({ source: 'cub' }) : err(); } },
      tmdb: { full: (params, ok) => { calls.push('tmdb ' + params.source); ok({ source: 'tmdb' }); } },
    } },
  };
  const $ = { ajax() {} };
  const noop = { addEventListener() {} };
  new Function('window', 'Lampa', '$', 'document', 'location', 'console', src)(noop, Lampa, $, noop, { protocol: 'http:' }, { log() {} });
  let result = null, failed = false;
  Lampa.Api.sources.cub.full({ method: 'movie', id: 550, source: 'cub' }, (j) => { result = j.source; }, () => { failed = true; });
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
process.exitCode = bad ? 1 : 0;
