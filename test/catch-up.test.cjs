// node test/catch-up.test.cjs
// ru-torrents 7a) Lampa's own record of a series catches up with what MX played. Lampa learns a position only when MX
// is left with «Назад» while Lampa lives; Android drops Lampa during a long MX session, TV off, the screensaver — then
// its marks stop (TV 2026-11-08: marks on S6E1, MX had played S6E1→S6E5) and the home tile «Продолжить просмотр» showed
// «1 - Эпизод 1» (an old online watch: the core shows the online «last watched» record when the series' LAST season has
// no marks). At Lampa start, from TorrServer's facts (the start record and the files streamed since):
//  · the episodes MX went past are marked watched (as the core's «Отметить просмотренным»): only streamed ones, only
//    when Lampa has heard nothing of them since that start, never a finished one again;
//  · the «last watched» record (online_watched_last) names the episode «Продолжить» plays — the tile shows it; the
//    online source's own fields (voice) stay, and an online watch after that is not overwritten.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const body = src.slice(src.indexOf('    var WARM_MAX'), src.indexOf('    function addContinue(e)'));
const qs = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');
const pickEpisode = new Function(qs.slice(qs.indexOf('    function percent(el)'), qs.indexOf("    Lampa.Listener.follow('torrent_file', function (e) {")) + 'return pickEpisode;')();

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

const GOT = { id: 1399, name: 'Игра престолов', original_name: 'Game of Thrones', original_title: 'Game of Thrones' };
const EPS = [51, 52, 53, 54, 55, 56].map((id, i) => [id, 6, i + 1]);
const TILE = 'h:Game of Thrones';
const mark = (e) => 'h:6' + e + 'Game of Thrones';

// torrents: [{ hash, movie, play }]; viewed: hash → streamed file ids; marks: hash → Lampa mark; store: Lampa storage
function world(torrents, viewed, marks, store, noPick) {
  const updates = [], writes = [], asked = [];
  store = store || {};
  const Lampa = {
    Torserver: { url: () => 'http://ts' },
    // Lampa's Storage.get parses JSON, the default '{}' too (core get$1)
    Storage: { get: (k, d) => JSON.parse(JSON.stringify(k in store ? store[k] : typeof d === 'string' ? JSON.parse(d) : d)), set: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); writes.push(k); } },
    Utils: { clearCard: (c) => c, hash: (x) => 'h:' + x },
    Timeline: {
      link: (card, season, episode) => ({ card: 'tv_' + card.id, season, episode }),
      view: (h, meta) => Object.assign({ hash: h, percent: 0, time: 0, duration: 0, updated: 0 }, meta || {}, marks[h] || {}),
      update: (v) => { updates.push(v); marks[v.hash] = v; },
    },
    Reguest: function () {
      this.timeout = () => {};
      this.silent = (url, ok, fail, post) => {
        const b = post ? JSON.parse(post) : {};
        asked.push(url);
        if (/\/viewed$/.test(url)) return ok((viewed[b.hash] || []).map((i) => ({ file_index: i })));
        if (b.action === 'list') ok(torrents.map((t) => ({ hash: t.hash, timestamp: t.ts || 1, data: JSON.stringify(Object.assign({ lampa: true, movie: t.movie }, t.play ? { lampa_tv_play: t.play } : {})) })));
      };
    },
  };
  const win = noPick ? {} : { lampa_tv_pick_episode: pickEpisode };
  const api = new Function('Lampa', 'btih', 'setInterval', 'clearInterval', 'window', 'console', body + 'return { catchUp };')(Lampa, (r) => r.hash, () => 1, () => {}, win, { log: () => {} });
  return { api, updates, writes, store, marks, asked };
}
const marked = (w) => w.updates.map((u) => [u.hash.replace('Game of Thrones', ''), u.percent, u.card, u.season, u.episode]);

// the morning of 2026-11-08: started S6E1 (file 51) from Lampa, MX went on to S6E5, Lampa dropped; Lampa's mark: S6E1 30 %
const play = { file: 51, at: 500, eps: EPS };
let w = world([{ hash: 'abc', movie: GOT, play }], { abc: [51, 52, 53, 54, 55] }, { [mark(1)]: { percent: 30, time: 900, updated: 100 } }, { online_watched_last: { [TILE]: { season: 1, episode: 1, voice_name: 'LostFilm' } } });
w.api.catchUp();
check('S6E1–S6E4 (MX went past them) marked watched, with the card link; S6E5 untouched', marked(w), [['h:61', 100, 'tv_1399', 6, 1], ['h:62', 100, 'tv_1399', 6, 2], ['h:63', 100, 'tv_1399', 6, 3], ['h:64', 100, 'tv_1399', 6, 4]]);
check('the tile\'s «last watched» names S6E5; the online voice stays', w.store.online_watched_last[TILE], { season: 6, episode: 5, voice_name: 'LostFilm', lampa_tv_at: 500, lampa_tv_file: 55 });
const n = w.updates.length;
w.writes.length = 0;
w.api.catchUp();
check('run again: nothing written (marks finished, record the same)', [w.updates.length - n, w.writes], [0, []]);

// an online watch after it (S7E1) → the torrent session it came after does not overwrite it
w.store.online_watched_last[TILE].season = 7; w.store.online_watched_last[TILE].episode = 1;
w.api.catchUp();
check('an online watch after the torrent session is not overwritten', [w.store.online_watched_last[TILE].season, w.store.online_watched_last[TILE].episode], [7, 1]);

// Lampa heard of S6E2 after the start (its mark was reset by hand: 0 %, newer than the start) → left alone
w = world([{ hash: 'abc', movie: GOT, play }], { abc: [51, 52, 53] }, { [mark(2)]: { percent: 0, time: 0, updated: 600 } });
w.api.catchUp();
check('a mark newer than the start (Lampa knows better) is not touched', marked(w).map((m) => m[0]), ['h:61']);

// MX skipped S6E2 (not streamed) → only streamed episodes are marked
w = world([{ hash: 'abc', movie: GOT, play }], { abc: [51, 53] }, {});
w.api.catchUp();
check('an episode MX never streamed is not marked', marked(w).map((m) => m[0]), ['h:61']);

// finished already → not written again
w = world([{ hash: 'abc', movie: GOT, play }], { abc: [51, 52] }, { [mark(1)]: { percent: 100, time: 3000, duration: 3000, updated: 100 } });
w.api.catchUp();
check('an episode already finished is not written again', marked(w).map((m) => m[0]), []);

// two releases of the card: only the one started last counts
w = world([{ hash: 'old', movie: GOT, play: { file: 51, at: 100, eps: EPS } }, { hash: 'abc', movie: GOT, play: { file: 54, at: 500, eps: EPS } }], { old: [51, 52, 53], abc: [54] }, {});
w.api.catchUp();
check('only the card\'s release started last: the older one\'s session is not replayed', [marked(w), w.store.online_watched_last[TILE].episode], [[], 4]);

// a film, and a series release with no start record → nothing
w = world([{ hash: 'f', movie: { id: 7, title: 'Фильм', original_title: 'Film' }, play: { file: 1, at: 500 } }, { hash: 'abc', movie: GOT }], { f: [1], abc: [51, 52] }, {});
w.api.catchUp();
check('a film / a release without a start record → nothing', [w.updates.length, w.writes], [0, []]);

// quick-start missing (no episode choice) → nothing
w = world([{ hash: 'abc', movie: GOT, play }], { abc: [51, 52, 53] }, {}, {}, true);
w.api.catchUp();
check('no quick-start → nothing, TorrServer not even asked', [w.updates.length, w.writes, w.asked], [0, [], []]);
process.exitCode = failed ? 1 : 0;
