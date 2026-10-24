// node test/catalog-next.test.cjs
// catalog-next: «Огонь!» goes on after CUB's 5 pages with TMDB titles CUB did not give; the recommendations cache keeps 600
// trimmed entries and fills the whole history, oldest first.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'catalog-next.js'), 'utf8');

const store = {};
const cubPage = (p) => ({ page: p, total_pages: 5, results: Array.from({ length: 20 }, (_, i) => ({ id: 1000 + (p - 1) * 20 + i, title: 'cub' })) });
const tmdbAsked = [];
const tmdbPage = (p) => ({ page: p, total_pages: 12, results: Array.from({ length: 20 }, (_, i) => ({ id: p === 1 ? 1000 + i : 5000 + p * 20 + i, title: 'tmdb' })) });
const Lampa = {
  Api: { sources: {
    cub: { list: (params, ok) => ok(cubPage(params.page || 1)) },
    tmdb: { list: (params, ok) => { tmdbAsked.push(params.page + ' ' + params.url.split('?')[0]); ok(tmdbPage(params.page)); } },
  } },
  Storage: {
    get: (k, d) => (k in store ? store[k] : JSON.parse(d)), set: (k, v) => { store[k] = v; }, field: () => 'ru',
    cache(name, max, empty) { const r = this.get(name, JSON.stringify(empty)); return r.length > max ? r.slice(r.length - max) : r; },
  },
  Listener: { follow() {} }, Keypad: { listener: { follow() {} } }, Lang: { translate: (k) => k },
  ContentRows: null, Activity: { active: () => null }, Controller: { enabled: () => ({}) },
};
// history newest first, as Favorite.get gives it; every title has 30 recommendations (more than fit for 30 titles × 30 > 600)
const history = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, source: 'cub', title: 'h' + i }));
const recAsked = [];
Lampa.Favorite = { get: () => history };
Lampa.TMDB = { api: (u) => u, key: () => 'k' };
Lampa.Reguest = function () { this.timeout = () => {}; this.silent = (u, ok) => { const id = +u.split('/')[1]; recAsked.push(id); ok({ results: Array.from({ length: 30 }, (_, i) => ({ id: id * 1000 + i, title: 'r', overview: 'x'.repeat(500), release_date: '2024-01-01' })) }); }; };
const timers = [];
const window = {};
new Function('window', 'Lampa', 'setTimeout', 'document', src)(window, Lampa, (fn, ms) => { timers.push([fn, ms]); return timers.length; }, { querySelectorAll: () => [] });

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}
const ask = (url, page) => { let out; Lampa.Api.sources.cub.list({ url, page }, (j) => { out = j; }); return out; };

const p1 = ask('top/fire/movie', 1);
check('page 1 is CUB, total pages 5 + 45', [p1.results[0].title, p1.total_pages], ['cub', 50]);
for (let p = 2; p <= 5; p++) ask('top/fire/movie', p);
const p6 = ask('top/fire/movie', 6);
check('page 6 comes from TMDB discover page 1', tmdbAsked[0], '1 discover/movie');
check('TMDB titles CUB already gave are skipped (page 1 of TMDB = all CUB ids → next TMDB page)', [p6.results.length, p6.results[0].title, tmdbAsked[1]], [20, 'tmdb', '2 discover/movie']);
check('page 6 keeps the list going, page count now from TMDB', [p6.page, p6.total_pages], [6, 17]);
const tv = ask('top/fire/tv', 1);
check('series «Огонь!» too', tv.total_pages, 50);
const other = ask('?sort=now_playing', 1);
check('other CUB lists untouched', other.total_pages, 5);

store.recomends_list = Array.from({ length: 450 }, (_, i) => ({ id: i }));
check('recommendations cache keeps up to 600, not 100', Lampa.Storage.cache('recomends_list', 100, []).length, 450);
check('other caches keep their limit', (store.x = Array.from({ length: 50 }, (_, i) => i), Lampa.Storage.cache('x', 10, []).length), 10);
// second opening of «Огонь!» in the same session: TMDB titles shown the first time come again
const tmdbBefore = tmdbAsked.length;
for (let p = 1; p <= 5; p++) ask('top/fire/movie', p);
const again6 = ask('top/fire/movie', 6);
check('second opening: page 6 has TMDB titles again, no extra requests', [again6.results.length, again6.results[0].title, tmdbAsked.length - tmdbBefore], [20, 'tmdb', 2]);
check('page count follows TMDB once known (5 + 12, not 5 + 45)', [ask('top/fire/movie', 1).total_pages, again6.total_pages], [17, 17]);

// Lampa itself saving the list (core search()) keeps it trimmed too
Lampa.Storage.set('recomends_list', [{ id: 1, title: 'a', overview: 'long', adult: false, source: 'tmdb' }]);
check('entries trimmed to what a tile needs', store.recomends_list, [{ id: 1, title: 'a', source: 'tmdb' }]);

// the fill after start: oldest history first, so the newest history's recommendations survive the 600 cut
store.recomends_list = [];
const fill = timers.find((t) => t[1] === 60000)[0];
fill();
while (timers.some((t) => t[1] === 1500)) { const i = timers.findIndex((t) => t[1] === 1500); const [fn] = timers.splice(i, 1)[0]; fn(); }
check('asked oldest history first', [recAsked[0], recAsked[recAsked.length - 1], recAsked.length], [129, 100, 30]);
const kept = store.recomends_list;
check('600 kept, the newest history among them, no overview', [kept.length, kept.some((r) => Math.floor(r.id / 1000) === 100), kept.some((r) => r.overview)], [600, true, false]);
process.exitCode = failed ? 1 : 0;
