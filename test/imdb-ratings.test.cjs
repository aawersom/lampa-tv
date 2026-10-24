// node test/imdb-ratings.test.cjs
// imdb-ratings tiles: CUB's lagging imdb_rating is shown only until IMDb answers; fresh titles are re-asked daily.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'imdb-ratings.js'), 'utf8');
const body = src.slice(src.indexOf("    var CACHE_KEY"), src.indexOf('    var io = window.IntersectionObserver'));

function setup(store, imdb) {
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
  const fakeTimeout = (fn) => { timers.push(fn); return timers.length; };
  const api = new Function('Lampa', 'setTimeout', 'clearTimeout', 'document', body + '\nfunction whenVisible(card, fn) { fn(); }\nreturn { tile: tile };')(Lampa, fakeTimeout, () => {}, {});
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
process.exitCode = failed ? 1 : 0;
