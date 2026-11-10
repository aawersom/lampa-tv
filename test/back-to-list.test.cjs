// node test/back-to-list.test.cjs
// quick-start 1) back from MX to the file list still open: the focus goes to where MX stopped. The core leaves the list
// open behind the external player and, back in Lampa, focuses the episode pressed — the one the session STARTED with,
// though MX went on through the playlist (TV 2026-11-10: S6E5 started at 00:28, MX went on; back in the list at 01:51 and
// at 08:27 — OK pressed within a minute both times → S6E5 again, from the start, since the app had marked it watched; the
// owner then skipped S6E5→S6E8 in MX to find the place). Once Lampa is back (the app's Lampa.Timeline.update with MX's
// result, or the page shown again) the focus moves to the episode «Продолжить» would play: the start just made, the
// files TorrServer streamed since, Lampa's fresh marks. Not when the viewer has moved, or the list is closed.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

const GOT = { id: 1399, name: 'Игра престолов', number_of_seasons: 8 };
function boot(viewed, opts) {
  opts = opts || {};
  const follows = {}, timers = [], marks = {}, st = { focus: null, ctrl: 'modal', modes: [] }, doc = { visibilityState: 'visible', on: {} };
  doc.addEventListener = (name, fn) => { doc.on[name] = fn; };
  const Lampa = {
    Listener: { follow: (name, fn) => { (follows[name] = follows[name] || []).push(fn); } },
    Storage: { field: () => 'continue', get: (k, d) => d, set: () => {} },
    Torserver: { url: () => 'http://ts' },
    Reguest: function () { this.timeout = () => {}; this.silent = (url, ok) => { if (/\/viewed$/.test(url)) ok(viewed.list.map((i) => ({ file_index: i }))); }; },
    Modal: { scroll: () => ({ render: () => null }) },
    Controller: { collectionFocus: (item) => { st.focus = item.name; }, enabled: () => ({ name: st.ctrl }) },
    Timeline: { view: (h) => Object.assign({ hash: h, percent: 0, time: 0, updated: 0 }, marks[h] || {}), update: (p) => { marks[p.hash] = Object.assign({}, p, { updated: Date.now() }); } },
    Android: { openPlayer: () => {} },
  };
  const win = { AndroidJS: { storageChange: (json) => st.modes.push(JSON.parse(json).value) } };
  new Function('Lampa', 'window', '$', 'setTimeout', 'console', 'document', src)(Lampa, win, undefined, (fn) => timers.push(fn), { log: () => {} }, opts.noDocument ? undefined : doc);
  const send = (e) => (follows.torrent_file || []).forEach((fn) => fn(e));
  const run = () => { while (timers.length) timers.shift()(); };
  let rows = [];
  return {
    st, marks, Lampa,
    open(movie) {
      rows = [51, 52, 53, 54, 55, 56, 57, 58, 59].map((id, i) => ({ id, name: 'S6E' + (i + 1), season: 6, episode: i + 1, torrent_hash: 'ABC', timeline: Lampa.Timeline.view('h' + id) }));
      send({ type: 'list_open', params: { movie } });
      rows.forEach((el) => send({ type: 'render', element: el, item: { name: el.name, hasClass: (c) => c === 'focus' && st.focus === el.name, trigger: () => {} }, params: { movie } }));
      run();
    },
    // OK on an episode: the core focuses it, starts it (onenter) and hands it to MX
    press(name) {
      const el = rows.find((r) => r.name === name);
      st.focus = name;
      send({ type: 'onenter', element: el, item: { name }, params: {} });
      Lampa.Android.openPlayer('x', el);
    },
    // back from MX: the app hands Lampa MX's result (or not), the page is shown; the core refocuses the pressed row
    back(app) { (app || []).forEach((u) => Lampa.Timeline.update(u)); if (doc.on.visibilitychange) doc.on.visibilitychange(); run(); },
    row: (name) => rows.find((r) => r.name === name),
  };
}

// the night of 2026-11-10: S6E5 pressed, MX went on to S6E8, «Назад» there — the app marks S6E8 30 % and S6E5–S6E7 watched
let viewed = { list: [] }, t = boot(viewed);
t.open(GOT);
t.press('S6E5');
viewed.list = [55, 56, 57, 58];
t.back([{ hash: 'h55', percent: 100 }, { hash: 'h56', percent: 100 }, { hash: 'h57', percent: 100 }, { hash: 'h58', percent: 30, time: 1000 }]);
check('back from MX with «Назад»: the focus moves from S6E5 to S6E8, where MX stopped', t.st.focus, 'S6E8');

// MX left by TV off / «Домой», the app's result lost: TorrServer's streamed files still tell
viewed = { list: [] }; t = boot(viewed);
t.open(GOT); t.press('S6E5');
viewed.list = [55, 56, 57];
t.back([]);
check('no result from MX (TV off): the last file TorrServer streamed (S6E7)', t.st.focus, 'S6E7');
t.st.modes.length = 0;
t.press('S6E7');
check('…and the start of S6E7 lets MX resume its own place (it streamed that file)', t.st.modes, ['ask']);

// «Назад» at the very end of S6E6: Lampa's fresh mark says finished → the next one
viewed = { list: [] }; t = boot(viewed);
t.open(GOT); t.press('S6E5');
viewed.list = [55, 56];
t.back([{ hash: 'h55', percent: 100 }, { hash: 'h56', percent: 98, time: 3300 }]);
check('MX stopped at the end of S6E6 (Lampa\'s fresh mark 98 %) → S6E7', t.st.focus, 'S6E7');

// the viewer moved before Lampa heard back → stays
viewed = { list: [] }; t = boot(viewed);
t.open(GOT); t.press('S6E5');
viewed.list = [55, 56];
t.st.focus = 'S6E2';
t.back([{ hash: 'h56', percent: 40, time: 900 }]);
check('the viewer has moved the focus → it stays', t.st.focus, 'S6E2');

// the list was closed meanwhile → nothing moves
viewed = { list: [] }; t = boot(viewed);
t.open(GOT); t.press('S6E5');
viewed.list = [55, 56];
t.st.ctrl = 'full_start';
t.back([{ hash: 'h56', percent: 40, time: 900 }]);
check('the list is closed → nothing moves', t.st.focus, 'S6E5');

// a list only looked at (nothing started from it) → the page shown again moves nothing
viewed = { list: [55, 56] }; t = boot(viewed);
t.open(GOT);
t.st.focus = 'S6E3';
t.back([]);
check('nothing started from the list → nothing moves', t.st.focus, 'S6E3');

// MX finished S6E5 only (no further file), «Назад» mid-way → stays on S6E5
viewed = { list: [] }; t = boot(viewed);
t.open(GOT); t.press('S6E5');
viewed.list = [55];
t.back([{ hash: 'h55', percent: 50, time: 1500 }]);
check('MX stopped in the episode pressed → the focus stays there', t.st.focus, 'S6E5');

// no page events in this WebView: the app's Timeline.update alone brings it
viewed = { list: [] }; t = boot(viewed, { noDocument: true });
t.open(GOT); t.press('S6E5');
viewed.list = [55, 56];
t.back([{ hash: 'h55', percent: 100 }, { hash: 'h56', percent: 20, time: 600 }]);
check('without visibilitychange: the app\'s Timeline.update moves the focus (S6E6)', t.st.focus, 'S6E6');
process.exitCode = failed ? 1 : 0;
