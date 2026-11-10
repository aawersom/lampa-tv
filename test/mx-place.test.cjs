// node test/mx-place.test.cjs
// quick-start 7) The place inside a torrent file is MX's alone. MX saves it at every stop, per file address — TV off,
// «Домой», Lampa killed by Android included; Lampa's mark moves only when MX's result reaches a living Lampa. The Lampa
// app hands MX a position on every «continue» start: the mark's time, or 1 ms (= from the start) when there is none —
// and MX obeys, dropping its own place. Until 1.14 the app was told «ask» (it then hands no position) only for files of
// the release's LAST session; any other file was started at Lampa's mark (owner, 2026-11-10: the wrong episode started
// by mistake, back to the right one → from the start). Now every start of a torrent file under the owner's «continue»
// tells the app «ask» — as the TorrServe app always started MX. No exception for a mark reset by hand: a reset mark
// stays as it is until a result reaches Lampa, so the next lost result started the episode over again; to start over,
// rewind in MX. Told to the app on EVERY external start, right before it, through its bridge — Lampa's setting
// «Тайм-код» is never written (1.10 wrote it and a page that died before its timer left the owner on «Спрашивать»,
// TV 2026-11-06).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

function boot(viewed, mode, noBridge) {
  const follows = {}, player = {}, store = { player_timecode: mode || 'continue' }, sets = [], timers = [], calls = [];
  const on = (bag) => (name, fn) => { (bag[name] = bag[name] || []).push(fn); };
  const Lampa = {
    Listener: { follow: on(follows) },
    Player: { listener: { follow: on(player) } },
    Storage: { field: (k) => store[k], get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; sets.push(k + '=' + v); } },
    Torserver: { url: () => 'http://ts' },
    Reguest: function () { this.timeout = () => {}; this.silent = (url, ok) => { if (/\/viewed$/.test(url)) ok(viewed.map((i) => ({ file_index: i }))); }; },
    Android: { openPlayer: (link, data) => calls.push('open ' + data.id) },
  };
  const win = noBridge ? {} : { AndroidJS: { storageChange: (json) => { const o = JSON.parse(json); calls.push(o.name + '=' + o.value); } } };
  new Function('Lampa', 'window', '$', 'setTimeout', 'console', src)(Lampa, win, undefined, (fn) => timers.push(fn), { log: () => {} });
  const send = (bag, name, e) => (bag[name] || []).forEach((fn) => fn(e));
  return {
    list: (hash, movie) => { send(follows, 'torrent_file', { type: 'list_open', params: { movie } }); send(follows, 'torrent_file', { type: 'render', element: { torrent_hash: hash, id: 1 }, item: {}, params: { movie } }); },
    // the core: Player.play → 'create' … Preroll → Android.openPlayer → 'external'; timers that are left run too
    play: (data) => { send(player, 'create', { data }); Lampa.Android.openPlayer('http://ts/stream/x?link=' + data.torrent_hash + '&index=' + data.id + '&play', data); send(player, 'external', data); timers.splice(0).forEach((fn) => fn()); },
    store, sets, calls,
  };
}
const series = { name: 'BB' };

// the TV case 2026-11-04: S2E6 (file 13), Lampa's mark older than MX's own place
let t = boot([13]);
t.list('ABC', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('a torrent file under the owner’s «continue» → the app is told «ask» right before the start', t.calls, ['player_timecode=ask', 'open 13']);
t.play({ url: 'http://cdn/film.m3u8', id: 'x', timeline: { hash: '77', percent: 30, time: 500, updated: 1 } });
check('…and the next start, an online source, is told the owner’s «continue» again (no «ask» left behind)', t.calls.slice(2), ['player_timecode=continue', 'open x']);
check('Lampa’s setting «Тайм-код» is never written', [t.store.player_timecode, t.sets], ['continue', []]);

// the owner's case: the last session of the release played another file (14); the right one (13) is started again
t = boot([14]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 0, time: 0, updated: 0 } });
check('a file outside the last session, no Lampa mark (MX’s result never arrived) → «ask»: MX keeps its place, not «from the start»', t.calls, ['player_timecode=ask', 'open 13']);
t = boot([14]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('a file outside the last session, an old Lampa mark → «ask»: the stale mark does not override MX', t.calls, ['player_timecode=ask', 'open 13']);

t = boot([]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('TorrServer knows no streamed file at all (restarted) → still «ask»', t.calls, ['player_timecode=ask', 'open 13']);
t = boot([]);
t.play({ torrent_hash: 'abc', id: 13 });
check('a torrent file started with no list and no mark object → «ask»', t.calls, ['player_timecode=ask', 'open 13']);

t = boot([]); t.list('abc', Object.defineProperty(Object.assign({}, series), 'lampa_tv_play', { value: { file: 12, at: 5, opened: [12] } }));
t.play({ torrent_hash: 'abc', id: 12, timeline: { percent: 40, time: 600, updated: 9 } });
check('«Продолжить» → «ask»', t.calls, ['player_timecode=ask', 'open 12']);

t = boot([13], 'again'); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('the owner chose «Начать с начала» → that mode, untouched', [t.calls, t.sets], [['player_timecode=again', 'open 13'], []]);
t = boot([13], 'ask'); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('the owner chose «Спрашивать» → that mode', t.calls, ['player_timecode=ask', 'open 13']);

// an episode Lampa holds finished: the app marks «100 %» every playlist episode before the one MX stopped at, played or
// not (skipping ahead in MX by mistake) — MX's own place still decides, as in the TorrServe app's flow
t = boot([13]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 95, time: 2700, updated: 100 } });
check('marked finished in Lampa → «ask» (MX’s place decides)', t.calls, ['player_timecode=ask', 'open 13']);

// a mark reset by hand reads {0 %, 0 s, updated}; so does nothing else for sure — and it stays so until a result reaches
// Lampa: honoured, it started the episode over on every start after a lost result
t = boot([13]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 0, time: 0, updated: 200 } });
check('a mark reset by hand → «ask» all the same (no start-over that repeats after a lost result)', t.calls, ['player_timecode=ask', 'open 13']);
// MX left within the first 1 % (the app rounds the percent down): {0 %, 20 s, updated}
t = boot([13]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 0, time: 20, updated: 200 } });
check('a mark of the first seconds (0 %, 20 s) → «ask»: Lampa’s 20 s do not override MX’s 30:00', t.calls, ['player_timecode=ask', 'open 13']);

t = boot([13]); t.list('abc', series);
t.play({ url: 'http://cdn/film.m3u8', id: 'x', timeline: { hash: '77', percent: 30, time: 500, updated: 1 } });
check('an online source → the owner’s mode (its address changes, MX has no place for it)', t.calls, ['player_timecode=continue', 'open x']);

t = boot([13], 'continue', true); t.list('abc', series);
let threw = null;
try { t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } }); } catch (e) { threw = e.message; }
check('no app bridge (not the Lampa app) → the start goes on, nothing written', [threw, t.calls, t.sets], [null, ['open 13'], []]);
process.exitCode = failed ? 1 : 0;
