// node test/deadlines.test.cjs
// A request that never answers must not hold the screen (2026-11-16: ~40 % of connections through the router's tunnel
// hung after TLS; and Lampa's native request can lose its callback — two requests drawing the same slot of 5000):
//  · imdb-filter: a lost IMDb answer ends the page after 20 s (it used to keep that filter page «loading» until Lampa
//    was restarted: the page stayed in `waiting` and every later request for it queued behind);
//  · tmdb-route: a CUB card that does not answer in 10 s comes from TMDB at once (it used to wait out two of the core's
//    30-s timeouts, with all the side requests repeated).
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b)); return src.slice(i, j); };

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}
function clock() {
  let now = 0; const timers = [];
  return {
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    tick: (ms) => { now += ms; timers.forEach((t) => { if (t.fn && t.at <= now) { const f = t.fn; t.fn = null; f(); } }); },
    pending: () => timers.filter((t) => t.fn).length,
  };
}

// ---- imdb-filter ----
{
  const body = cut(read('imdb-filter.js'), '    function imdbPage(c, after, done)', '    // pages come by cursor');
  const run = (answer) => {
    const c = clock(), got = [], logs = [];
    let reply;
    const Lampa = { Reguest: function () { this.timeout = () => {}; this.native = (url, ok, fail) => { reply = { ok, fail }; }; } };
    const imdbPage = new Function('Lampa', 'PAGE', 'IMDB', 'IMDB_HEADERS', 'setTimeout', 'clearTimeout', 'console', body + 'return imdbPage;')(
      Lampa, 20, 'https://imdb', {}, c.setTimeout, c.clearTimeout, { log: (...a) => logs.push(a.join(' ')) });
    imdbPage({ text: '{}', sort: 'POPULARITY' }, null, (res) => got.push(res ? res.items.length : null));
    return { c, got, logs, reply };
  };
  const good = { data: { advancedTitleSearch: { total: 1, pageInfo: { hasNextPage: false }, edges: [{ node: { title: { id: 'tt1', titleText: { text: 'A' }, ratingsSummary: { aggregateRating: 7 } } } }] } } };
  let r = run();
  r.c.tick(19000);
  check('IMDb silent for 19 s: still waiting', r.got, []);
  r.c.tick(1500);
  check('IMDb silent for 20 s: the page ends with «no result», logged', [r.got, r.logs.some((l) => /ImdbFilter/.test(l))], [[null], true]);
  r.reply.ok(good);
  check('a late answer after that is ignored (one result per request)', r.got, [null]);
  r = run();
  r.reply.ok(good);
  check('an answer in time: one result, the guard is gone at once', [r.got, r.c.pending()], [[1], 0]);
  r.c.tick(30000);
  check('…and nothing more comes later', r.got, [1]);
  r = run();
  r.reply.fail();
  r.c.tick(30000);
  check('an error in time: «no result» once', r.got, [null]);
}

// ---- tmdb-route ----
{
  const src = read('tmdb-route.js');
  const run = (script) => {
    const c = clock(), calls = [];
    let result = null, bad = false, n = 0;
    const late = [];
    const cub = { full: function (params, ok, err) { const what = script[n++]; calls.push('cub ' + what); if (what === 'ok') ok({ movie: { id: 1 } }); else if (what === 'fail') err(); else late.push(ok); /* 'hang': answers only when the test says */ } };
    const tmdb = { full: function (params, ok) { calls.push('tmdb'); ok({ movie: { id: 1, from: 'tmdb' } }); } };
    const Lampa = { Storage: { get: () => '', set() {} }, Listener: { follow() {} }, TMDB: { key: () => 'k' }, Api: { sources: { cub, tmdb } } };
    const noop = { addEventListener() {} };
    new Function('window', 'Lampa', '$', 'document', 'location', 'console', 'setTimeout', 'clearTimeout', src)(
      noop, Lampa, { ajax: (o) => o.success({ images: {} }) }, noop, { protocol: 'http:' }, { log() {} }, c.setTimeout, c.clearTimeout);
    let done = 0;
    Lampa.Api.sources.cub.full({ method: 'movie', id: 1 }, (d) => { done++; result = d.movie.from || 'cub'; }, () => { bad = true; });
    return { c, calls, late, get done() { return done; }, get result() { return result; }, get bad() { return bad; } };
  };
  let r = run(['hang']);
  r.c.tick(9000);
  check('CUB card silent for 9 s: still waiting', [r.calls, r.result], [['cub hang'], null]);
  r.c.tick(1500);
  check('CUB card silent for 10 s: the card comes from TMDB at once, CUB is not asked again', [r.calls, r.result], [['cub hang', 'tmdb'], 'tmdb']);
  r.late[0]({ movie: { id: 1 } });
  check('CUB answers after all, late: ignored — the card is delivered once, TMDB\'s', [r.done, r.result], [1, 'tmdb']);
  r = run(['ok']);
  check('CUB answers: its card, no TMDB request, no timer left', [r.calls, r.result, r.c.pending()], [['cub ok'], 'cub', 0]);
  r.c.tick(60000);
  check('…and TMDB is not asked later', r.calls, ['cub ok']);
  r = run(['fail', 'hang']);
  r.c.tick(10500);
  check('CUB fails, the second try hangs: TMDB after 10 s', [r.calls, r.result], [['cub fail', 'cub hang', 'tmdb'], 'tmdb']);
  r = run(['fail', 'ok']);
  check('CUB fails once, then answers: its card (as before)', [r.calls, r.result], [['cub fail', 'cub ok'], 'cub']);
}
process.exitCode = failed ? 1 : 0;
