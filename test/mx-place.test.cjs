// node test/mx-place.test.cjs
// quick-start 7) MX resumes its own place: for a start of a file MX itself streamed last, the Lampa app is told «ask»
// (it then hands MX no position); every other start tells it the owner's own mode. Told to the app on EVERY external
// start, right before it, through its bridge — Lampa's setting «Тайм-код» is never written (1.10 wrote it and a page
// that died before its timer left the owner on «Спрашивать», TV 2026-11-06).
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

// the TV case: S2E6 (file 13) streamed last session, Lampa's mark older
let t = boot([13]);
t.list('ABC', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('MX streamed this file last → the app is told «ask» right before the start', t.calls, ['player_timecode=ask', 'open 13']);
t.play({ torrent_hash: 'abc', id: 14, timeline: { percent: 0, time: 0, updated: 0 } });
check('…and the next start is told the owner\'s «continue» again (no «ask» left behind)', t.calls.slice(2), ['player_timecode=continue', 'open 14']);
check('Lampa\'s setting «Тайм-код» is never written', [t.store.player_timecode, t.sets], ['continue', []]);

t = boot([13]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 14, timeline: { percent: 0, time: 0, updated: 0 } });
check('a file MX did not play → the owner\'s mode (Lampa mark as before)', t.calls, ['player_timecode=continue', 'open 14']);

t = boot([]); t.list('abc', Object.defineProperty(Object.assign({}, series), 'lampa_tv_play', { value: { file: 12, at: 5, opened: [12] } }));
t.play({ torrent_hash: 'abc', id: 12, timeline: { percent: 40, time: 600, updated: 9 } });
check('«Продолжить»: the started file (play.file/opened) counts before TorrServer answers', t.calls, ['player_timecode=ask', 'open 12']);

t = boot([13], 'again'); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('the owner chose «Начать с начала» → that mode, untouched', [t.calls, t.sets], [['player_timecode=again', 'open 13'], []]);

t = boot([13]); t.list('abc', series);
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 95, time: 2700, updated: 100 } });
t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 0, time: 0, updated: 200 } });
check('finished, or its mark reset by hand → the owner\'s mode', t.calls, ['player_timecode=continue', 'open 13', 'player_timecode=continue', 'open 13']);

t = boot([13]); t.list('abc', series);
t.play({ url: 'http://cdn/film.m3u8', id: 'x', timeline: { hash: '77', percent: 30, time: 500, updated: 1 } });
check('an online source → the owner\'s mode', t.calls, ['player_timecode=continue', 'open x']);

t = boot([13], 'continue', true); t.list('abc', series);
let threw = null;
try { t.play({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } }); } catch (e) { threw = e.message; }
check('no app bridge (not the Lampa app) → the start goes on, nothing written', [threw, t.calls, t.sets], [null, ['open 13'], []]);
process.exitCode = failed ? 1 : 0;
