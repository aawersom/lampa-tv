// node test/resume-preload.test.cjs
// quick-start 2) preload. A start from the beginning waits for ~10 s of THIS video (file size / runtime × 10, ≥ 3 MB).
// A start that resumes mid-file (Lampa's mark, or MX's own place — 7) does not read the file's start at all: only the
// first bytes are waited for — the release delivers — then MX asks TorrServer for its place itself (TV 2026-11-08: after
// the nightly reboot «Продолжить» stood 44 s on «8 / 241 · 676 Кбит/с» loading S6E5's first seconds; MX began at 44:09).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

function boot(mode, viewed) {
  const follows = {}, timers = [], store = { player_timecode: mode || 'continue' };
  let prefilter = null;
  const Lampa = {
    Listener: { follow: (name, fn) => { (follows[name] = follows[name] || []).push(fn); } },
    Storage: { field: (k) => store[k], get: (k, d) => d, set: () => {} },
    Torserver: { url: () => 'http://ts' },
    Reguest: function () { this.timeout = () => {}; this.silent = (url, ok) => { if (/\/viewed$/.test(url)) ok((viewed || []).map((i) => ({ file_index: i }))); }; },
    Activity: { active: () => ({ card: { name: 'Игра престолов', episode_run_time: [60] } }) },
  };
  const jq = { ajaxPrefilter: (fn) => { prefilter = fn; } };
  new Function('Lampa', 'window', '$', 'setTimeout', 'console', src)(Lampa, { $: jq }, jq, (fn) => timers.push(fn), { log: () => {} });
  const send = (e) => (follows.torrent_file || []).forEach((fn) => fn(e));
  return {
    list(rows) {
      send({ type: 'list_open', params: { movie: { name: 'Игра престолов' } } });
      rows.forEach((el) => send({ type: 'render', element: el, item: { name: el.id }, params: { movie: { name: 'Игра престолов' } } }));
    },
    // the size Lampa's preload screen waits for, as the core reads it from TorrServer's &stat answer
    waits(index, hash) {
      const options = { url: 'http://ts/stream/S06E05.mkv?link=' + (hash || 'abc') + '&index=' + index + '&stat' };
      prefilter(options);
      const out = options.dataFilter(JSON.stringify({ preload_size: 200e6, preloaded_bytes: 0, file_stats: [{ id: 55, length: 3.6e9 }, { id: 56, length: 3.6e9 }] }), 'json');
      return JSON.parse(out).preload_size;
    },
  };
}
const ep = (id, timeline) => ({ id, torrent_hash: 'ABC', season: 6, episode: id - 50, timeline });
const TEN_SECONDS = 3.6e9 / 3600 * 10; // 10 MB

let t = boot();
t.list([ep(55, { percent: 0, time: 0, updated: 0 }), ep(56, { percent: 0, time: 0, updated: 0 })]);
check('from the start → ~10 s of this video, as before', t.waits(55), TEN_SECONDS);

t = boot();
t.list([ep(55, { percent: 74, time: 2648, updated: 900 })]);
check('Lampa mark 44:08 → MX starts there: only the first bytes are waited for', t.waits(55), 1);

t = boot('continue', [55]);
t.list([ep(55, { percent: 0, time: 0, updated: 0 })]);
check('no Lampa mark, but MX streamed this file last (resumes its own place) → first bytes only', t.waits(55), 1);

t = boot();
t.list([ep(55, { percent: 96, time: 3400, updated: 900 })]);
check('finished episode starts over → ~10 s as before', t.waits(55), TEN_SECONDS);

t = boot('again');
t.list([ep(55, { percent: 74, time: 2648, updated: 900 })]);
check('the owner\'s «Начать с начала» → from the start, ~10 s', t.waits(55), TEN_SECONDS);

t = boot();
t.list([ep(55, { percent: 74, time: 2648, updated: 900 })]);
check('another release with the same file number → its own rule (no mark there)', t.waits(55, 'zzz'), TEN_SECONDS);
process.exitCode = failed ? 1 : 0;
