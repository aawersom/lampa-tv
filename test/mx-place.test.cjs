// node test/mx-place.test.cjs
// quick-start 7) one start in the Lampa app's «ask» timecode mode (no position to MX → MX resumes its own place) when MX
// streamed this very file of this release in its last session; the owner's mode is back right after the app took it.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

function boot(viewed, mode) {
  const follows = {}, player = {}, store = { player_timecode: mode || 'continue' }, sets = [], timers = [];
  const on = (bag) => (name, fn) => { (bag[name] = bag[name] || []).push(fn); };
  const Lampa = {
    Listener: { follow: on(follows) },
    Player: { listener: { follow: on(player) } },
    Storage: { field: (k) => store[k], get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; sets.push(k + '=' + v); } },
    Torserver: { url: () => 'http://ts' },
    Reguest: function () { this.timeout = () => {}; this.silent = (url, ok) => { if (/\/viewed$/.test(url)) ok(viewed.map((i) => ({ file_index: i }))); }; },
  };
  const win = {};
  new Function('Lampa', 'window', '$', 'setTimeout', 'console', src)(Lampa, win, undefined, (fn) => timers.push(fn), { log: () => {} });
  const send = (bag, name, e) => (bag[name] || []).forEach((fn) => fn(e));
  return {
    list: (hash, movie) => { send(follows, 'torrent_file', { type: 'list_open', params: { movie } }); send(follows, 'torrent_file', { type: 'render', element: { torrent_hash: hash, id: 1 }, item: {}, params: { movie } }); },
    create: (data) => send(player, 'create', { data }),
    external: () => { send(player, 'external', {}); timers.splice(0).forEach((fn) => fn()); },
    store, sets,
  };
}
const series = { name: 'BB' };

// the TV case: S2E6 (file 13) streamed last session, Lampa's mark older
let t = boot([13]);
t.list('ABC', series);
t.create({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('MX streamed this file last → «ask» for this start', t.store.player_timecode, 'ask');
t.external();
check('…and back to «continue» once the app took it', [t.store.player_timecode, t.sets], ['continue', ['player_timecode=ask', 'player_timecode=continue']]);

t = boot([13]); t.list('abc', series);
t.create({ torrent_hash: 'abc', id: 14, timeline: { percent: 0, time: 0, updated: 0 } });
check('a file MX did not play → Lampa mark as before (no switch)', t.sets, []);

t = boot([]); t.list('abc', Object.defineProperty(Object.assign({}, series), 'lampa_tv_play', { value: { file: 12, at: 5, opened: [12] } }));
t.create({ torrent_hash: 'abc', id: 12, timeline: { percent: 40, time: 600, updated: 9 } });
check('«Продолжить»: the started file (play.file/opened) counts before TorrServer answers', t.store.player_timecode, 'ask');

t = boot([13], 'again'); t.list('abc', series);
t.create({ torrent_hash: 'abc', id: 13, timeline: { percent: 30, time: 878, updated: 100 } });
check('the owner chose «Начать с начала» → left alone', t.sets, []);

t = boot([13]); t.list('abc', series);
t.create({ torrent_hash: 'abc', id: 13, timeline: { percent: 95, time: 2700, updated: 100 } });
t.create({ torrent_hash: 'abc', id: 13, timeline: { percent: 0, time: 0, updated: 200 } });
check('finished, or its mark reset by hand → no switch', t.sets, []);
process.exitCode = failed ? 1 : 0;
