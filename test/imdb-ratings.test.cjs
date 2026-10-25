// node test/imdb-ratings.test.cjs
// imdb-ratings tiles: CUB's lagging imdb_rating is shown only until IMDb answers; fresh titles are re-asked daily.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'imdb-ratings.js'), 'utf8');
const body = src.slice(src.indexOf("    var CACHE_KEY"), src.indexOf('    var io = window.IntersectionObserver'));

function setup(store, imdb, omdbCalls) {
  const timers = [];
  const requests = [];
  const Lampa = {
    Storage: { get: (k, d) => (k in store ? store[k] : d === '' ? '' : JSON.parse(d)), set: (k, v) => { store[k] = v; } },
    Reguest: function () {
      this.timeout = () => {};
      this.native = (url, ok, err, post) => { const ids = JSON.parse(JSON.parse(post).query.match(/\[.*\]/)[0]); requests.push(ids); imdb ? ok({ data: { titles: ids.map((id) => ({ id, ratingsSummary: { aggregateRating: imdb[id] } })) } }) : err(); };
    },
    TMDB: { api: (u) => u, key: () => 'k' },
  };
  Lampa.Reguest.prototype.silent = function (url, ok) { if (omdbCalls) omdbCalls.push(url); ok({ imdbRating: '5.5' }); };
  if (omdbCalls) store.ratings_omdb_key = 'key';
  const fakeTimeout = (fn) => { timers.push(fn); return timers.length; };
  const api = new Function('Lampa', 'setTimeout', 'clearTimeout', 'document', 'console', body + '\nfunction whenVisible(card, fn) { fn(); }\nreturn { tile: tile };')(Lampa, fakeTimeout, () => {}, {}, { log() {} });
  const run = () => { while (timers.length) timers.shift()(); };
  return { api, run, requests };
}
function card(data) {
  const vote = { style: {}, classList: { add() {} }, setAttribute() {}, textContent: '' };
  return { card_data: data, vote, querySelector: (s) => (s === '.card__vote' ? vote : null) };
}
const day = 864e5, ago = (d) => new Date(Date.now() - d * day).toISOString().slice(0, 10);
let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// Клэйфейс, a week out: CUB says 9.0, IMDb 7.6
let store = {};
let t = setup(store, { tt1: 7.6 });
let c = card({ id: 1, imdb_id: 'tt1', imdb_rating: 9.0, release_date: ago(7) });
t.api.tile(c);
check('CUB value shown at once', c.vote.textContent, '9.0');
t.run();
check('then IMDb’s value', [c.vote.textContent, t.requests.length], ['7.6', 1]);
const again = card({ id: 1, imdb_id: 'tt1', imdb_rating: 9.0, release_date: ago(7) });
t.api.tile(again);
t.run();
check('same day: IMDb’s value from the cache, nothing asked', [again.vote.textContent, t.requests.length], ['7.6', 1]);

store = {};
t = setup(store, null);
c = card({ id: 2, imdb_id: 'tt2', imdb_rating: 6.4, release_date: ago(30) });
t.api.tile(c);
t.run();
check('IMDb silent → CUB value stays', c.vote.textContent, '6.4');

store = { lampa_tv_imdb_cache: { tt3: { r: '8.1', t: Date.now() - 5 * day, v: 2 }, tt4: { r: '7.0', t: Date.now() - 2 * day, v: 2 }, tt5: { r: '9.9', t: Date.now() } } };
t = setup(store, { tt3: 8.2, tt4: 7.3, tt5: 6.0 });
const old = card({ id: 3, imdb_id: 'tt3', release_date: '2010-05-01' });
const recent = card({ id: 4, imdb_id: 'tt4', release_date: ago(20) });
const legacy = card({ id: 5, imdb_id: 'tt5', imdb_rating: 9.9, release_date: '2015-01-01' });
[old, recent, legacy].forEach((x) => t.api.tile(x));
t.run();
check('old film asked 5 days ago → not asked again', old.vote.textContent, '8.1');
check('fresh film asked 2 days ago → asked again', recent.vote.textContent, '7.3');
check('entry stored from CUB by 1.3 (no v:2) → asked', legacy.vote.textContent, '6.0');
check('one request for the screen', t.requests.map((r) => r.join(',')), ['tt4,tt5']);
// cache: entries older than 4 weeks go, at most 4000 stay (newest)
store = { lampa_tv_imdb_cache: {} };
for (let i = 0; i < 4100; i++) store.lampa_tv_imdb_cache['tt' + (1000 + i)] = { r: '7.0', t: Date.now() - i * 1000, v: 2 };
store.lampa_tv_imdb_cache.ttold = { r: '7.0', t: Date.now() - 30 * day, v: 2 };
t = setup(store, {});
t.api.tile(card({ id: 9, imdb_id: 'tt1000', release_date: '2010-01-01' }));
const kept = store.lampa_tv_imdb_cache;
check('cache pruned to the newest 4000, month-old entry gone', [Object.keys(kept).length, 'tt1000' in kept, 'ttold' in kept, 'tt5099' in kept], [4000, true, false, false]);

// IMDb silent: asked once more 3 s later, never OMDb; tiles keep what they show; for 2 min tiles with a number wait
store = {};
const omdbCalls = [];
t = setup(store, null, omdbCalls);
const withCub = card({ id: 10, imdb_id: 'tt10', imdb_rating: 7.1, release_date: ago(10) });
const empty = card({ id: 11, imdb_id: 'tt11', release_date: ago(10) });
[withCub, empty].forEach((x) => t.api.tile(x));
t.run();
check('IMDb silent: one retry, no OMDb, CUB value kept', [t.requests.length, omdbCalls.length, withCub.vote.textContent, empty.vote.style.display], [2, 0, '7.1', 'none']);
const later = card({ id: 12, imdb_id: 'tt12', imdb_rating: 6.0, release_date: ago(10) });
const laterEmpty = card({ id: 13, imdb_id: 'tt13', release_date: ago(10) });
[later, laterEmpty].forEach((x) => t.api.tile(x));
t.run();
check('within 2 min: only the tile with no number is asked', [t.requests.slice(2).map((r) => r.join(',')), later.vote.textContent], [['tt13', 'tt13'], '6.0']);
process.exitCode = failed ? 1 : 0;

// movie card: Lampa wrote CUB's 9.0 into a visible badge; IMDb's answer (7.6) replaces it
{
  const store2 = { lampa_tv_imdb_cache: { tt7: { r: '7.6', t: Date.now(), v: 2 } } };
  const follows = [], timers2 = [];
  const badge = { classList: { contains: () => false, remove() {} }, children: [{ textContent: '9.0' }] };
  const doc = { body: { querySelectorAll: () => [] }, head: { appendChild() {} }, createElement: () => ({}), querySelector: () => badge };
  const L = { Storage: { get: (k, d) => (k in store2 ? store2[k] : d === '' ? '' : JSON.parse(d)), set() {} }, Listener: { follow: (n, f) => follows.push(f) }, TMDB: {} };
  new Function('window', 'Lampa', 'document', 'setTimeout', 'clearTimeout', 'MutationObserver', 'console', src)(
    {}, L, doc, (fn) => timers2.push(fn), () => {}, function () { this.observe = () => {}; }, { log() {} });
  follows[0]({ type: 'complite', data: { movie: { imdb_id: 'tt7', imdb_rating: 9.0, release_date: ago(5) } }, body: [doc] });
  timers2.forEach((fn) => fn());
  check('card badge: IMDb 7.6 replaces CUB 9.0 even when visible', badge.children[0].textContent, '7.6');
  process.exitCode = failed ? 1 : 0;
}

// a tile callback that throws must not count as IMDb not answering (no second request, no double settle)
{
  const store3 = {};
  const t3 = setup(store3, { tt20: 7.0 });
  const c20 = card({ id: 20, imdb_id: 'tt20', release_date: ago(10) });
  c20.vote.setAttribute = () => { throw new Error('paint broke'); };
  t3.api.tile(c20);
  try { t3.run(); } catch (e) { /* the throw reaches the caller, as in the WebView */ }
  check('a throwing tile callback: no second request (not taken for IMDb silence)', t3.requests.length, 1);
  process.exitCode = failed ? 1 : 0;
}
