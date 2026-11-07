// node test/caches.test.cjs
// Session caches and shared lists:
//  similar — the rows built for a card are kept for the session, but not without end (Lampa lives for days on the TV);
//  catalog-next — filling «Рекомендуем посмотреть» takes minutes; recommendations the core adds meanwhile stay in the list.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// ---- similar: rows of the cards seen ----
{
  const src = read('similar.js');
  const body = src.slice(src.indexOf('    var waiting = null;'), src.indexOf("    Lampa.Listener.follow('full'"));
  let built = 0;
  const t = new Function('build', 'swap', 'console', body + 'return { start: start, size: function () { return Object.keys(done).length; } };')(
    (e, method, cb) => { built++; cb([{ title: 'x', results: [] }]); }, () => {}, { log: () => {} });
  const card = (id) => ({ object: { method: 'movie' }, data: { movie: { id } } });
  t.start(card(1)); t.start(card(1));
  check('similar: a card seen again this session is not built again', built, 1);
  for (let i = 2; i < 500; i++) t.start(card(i));
  check('similar: 500 cards later the kept rows stay bounded', t.size() <= 60, true);
}

// ---- catalog-next: «Рекомендуем посмотреть» ----
{
  const src = read('catalog-next.js');
  const body = src.slice(src.indexOf("    var RECS = 'recomends_list'"), src.indexOf('    setTimeout(recsFill, 60000);'));
  const stored = { recomends_list: [{ id: 1 }], lampa_tv_recs_done: {} };
  const timers = [];
  let core = null; // the core's own addition, made while the fill runs
  const Lampa = {
    Storage: {
      cache: (name, max, def) => (stored[name] || def || []).slice(),
      set: (name, v) => { stored[name] = JSON.parse(JSON.stringify(v)); },
      get: (name, def) => stored[name] || def, field: () => 'ru',
    },
    Favorite: { get: () => [{ id: 10, source: 'tmdb' }, { id: 11, source: 'tmdb' }] },
    TMDB: { api: (p) => p, key: () => 'k' },
    Reguest: function () { this.timeout = () => {}; this.silent = (url, ok) => { const id = /movie\/(\d+)/.exec(url)[1]; ok({ results: [{ id: 100 + +id, release_date: '2024-01-01' }] }); }; },
  };
  const recsFill = new Function('Lampa', 'setTimeout', body + 'return recsFill;')(Lampa, (fn) => timers.push(fn));
  recsFill();
  // the core adds title 50 between the plugin's two requests
  stored.recomends_list = stored.recomends_list.concat([{ id: 50 }]);
  while (timers.length) timers.shift()();
  const ids = stored.recomends_list.map((r) => r.id).sort((a, b) => a - b);
  check('catalog-next: the core\'s addition made during the fill stays', ids.indexOf(50) >= 0, true);
  check('catalog-next: the fill\'s own additions are there, once each', ids, [1, 50, 110, 111]);
}
process.exitCode = failed ? 1 : 0;
