// node test/catalog-next.test.cjs
// catalog-next: «Огонь!» goes on after CUB's 5 pages with TMDB titles not shown yet; the recommendations cache keeps 600.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'catalog-next.js'), 'utf8');

const store = {};
const cubPage = (p) => ({ page: p, total_pages: 5, results: Array.from({ length: 20 }, (_, i) => ({ id: 1000 + (p - 1) * 20 + i, title: 'cub' })) });
const tmdbAsked = [];
const tmdbPage = (p) => ({ page: p, total_pages: 300, results: Array.from({ length: 20 }, (_, i) => ({ id: p === 1 ? 1000 + i : 5000 + p * 20 + i, title: 'tmdb' })) });
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
  ContentRows: null, Favorite: null, Activity: { active: () => null }, Controller: { enabled: () => ({}) },
};
const window = {};
new Function('window', 'Lampa', 'setTimeout', 'document', src)(window, Lampa, () => 0, { querySelectorAll: () => [] });

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
check('page 6 keeps the list going', [p6.page, p6.total_pages], [6, 50]);
const tv = ask('top/fire/tv', 1);
check('series «Огонь!» too', tv.total_pages, 50);
const other = ask('?sort=now_playing', 1);
check('other CUB lists untouched', other.total_pages, 5);

store.recomends_list = Array.from({ length: 450 }, (_, i) => ({ id: i }));
check('recommendations cache keeps up to 600, not 100', Lampa.Storage.cache('recomends_list', 100, []).length, 450);
check('other caches keep their limit', (store.x = Array.from({ length: 50 }, (_, i) => i), Lampa.Storage.cache('x', 10, []).length), 10);
process.exitCode = failed ? 1 : 0;
