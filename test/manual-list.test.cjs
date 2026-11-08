// node test/manual-list.test.cjs
// quick-start 1) a series list opened BY HAND (not «Продолжить») first gets the focus from Lampa's marks; they stop where
// Lampa last heard back from MX (Lampa killed by Android in the background, TV off, the screensaver — TV 2026-11-08: the
// list stood on S6E1 while MX had played up to S6E5). Then TorrServer's facts move it — the start record ru-torrents
// keeps in the release's data and the files streamed since — to the episode «Продолжить» would play. Focus only, no play;
// not when the viewer has moved already, the list is gone, or another release of the card was started later.
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
const torrent = (hash, movie, play) => ({ hash, data: JSON.stringify(Object.assign({ lampa: true, movie }, play ? { lampa_tv_play: play } : {})) });

function boot(torrents, viewed) {
  const follows = {}, timers = [], queue = [], asked = [], st = { focus: null, entered: null, ctrl: 'modal' };
  const Lampa = {
    Listener: { follow: (name, fn) => { (follows[name] = follows[name] || []).push(fn); } },
    Storage: { field: () => 'continue', get: (k, d) => d, set: () => {} },
    Torserver: { url: () => 'http://ts/' },
    // TorrServer answers later (a real request), in order
    Reguest: function () {
      this.timeout = () => {};
      this.silent = (url, ok, bad, body) => {
        asked.push(url.replace('http://ts', '') + ' ' + JSON.parse(body).action);
        queue.push(() => ok(/\/viewed$/.test(url) ? viewed.map((i) => ({ file_index: i })) : torrents));
      };
    },
    Modal: { scroll: () => ({ render: () => null }) },
    Controller: { collectionFocus: (item) => { st.focus = item.name; }, enabled: () => ({ name: st.ctrl }) },
  };
  new Function('Lampa', 'window', '$', 'setTimeout', 'console', src)(Lampa, {}, undefined, (fn) => timers.push(fn), { log: () => {} });
  const send = (e) => (follows.torrent_file || []).forEach((fn) => fn(e));
  return {
    st, asked,
    // the core: list_open, then a render per row (all synchronous), the list is focused on the next tick
    open(movie, rows) {
      send({ type: 'list_open', params: { movie } });
      rows.forEach((el) => send({ type: 'render', element: el, item: { name: el.name, hasClass: (c) => c === 'focus' && st.focus === el.name, trigger: () => { st.entered = el.name; } }, params: { movie } }));
      timers.splice(0).forEach((fn) => fn());
    },
    answer() { while (queue.length) queue.shift()(); },
  };
}

// S6E1..S6E6 = files 51..56; Lampa marks: S6E1 30 % (Lampa's last word), nothing later
const season6 = () => [51, 52, 53, 54, 55, 56].map((id, i) => ({ id, name: 'S6E' + (i + 1), season: 6, episode: i + 1, torrent_hash: 'ABC',
  timeline: id === 51 ? { percent: 30, time: 900, updated: 100 } : { percent: 0, time: 0, updated: 0 } }));
const started55 = { file: 55, at: 500 };

let t = boot([torrent('abc', GOT, started55)], [55]);
t.open(GOT, season6());
check('opened by hand: Lampa marks first (S6E1)', t.st.focus, 'S6E1');
t.answer();
check('…then TorrServer: started S6E5, streamed since → focus S6E5, nothing played', [t.st.focus, t.st.entered], ['S6E5', null]);

t = boot([torrent('abc', GOT, { file: 53, at: 500 })], [53, 54, 55]);
t.open(GOT, season6()); t.answer();
check('started S6E3, MX went on to S6E5 (TV off) → focus S6E5', t.st.focus, 'S6E5');

t = boot([torrent('abc', GOT, started55)], [55]);
t.open(GOT, season6());
t.st.focus = 'S6E2'; // the viewer moved before TorrServer answered
t.answer();
check('the viewer has moved the focus → it stays', t.st.focus, 'S6E2');

t = boot([torrent('abc', GOT, started55)], [55]);
t.open(GOT, season6());
t.st.ctrl = 'full_start'; // the list was closed with «Назад»
t.answer();
check('the list is closed → nothing moves', t.st.focus, 'S6E1');

t = boot([torrent('abc', GOT, started55)], [55]);
t.open(GOT, season6());
{ const now = Date.now; Date.now = () => now() + 1500; try { t.answer(); } finally { Date.now = now; } } // TorrServer answered late
check('TorrServer answered after a second (the viewer may have pressed OK already) → nothing moves', t.st.focus, 'S6E1');

t = boot([Object.assign(torrent('abc', GOT, started55), { data: { lampa: true, movie: GOT, lampa_tv_play: started55 } })], [55]);
t.open(GOT, season6()); t.answer();
check('release data given as an object, not a string → read the same', t.st.focus, 'S6E5');

t = boot([torrent('abc', GOT, started55), torrent('def', GOT, { file: 7, at: 900 })], [55]);
t.open(GOT, season6()); t.answer();
check('another release of the card started later → Lampa marks stay', t.st.focus, 'S6E1');

t = boot([torrent('abc', GOT, started55), torrent('def', { id: 1396, name: 'Во все тяжкие' }, { file: 7, at: 900 })], [55]);
t.open(GOT, season6()); t.answer();
check('a later start of ANOTHER card does not matter', t.st.focus, 'S6E5');

t = boot([torrent('abc', GOT, null)], [55]);
t.open(GOT, season6()); t.answer();
check('no start record in the release → Lampa marks stay', t.st.focus, 'S6E1');

t = boot([torrent('abc', GOT, started55)], [55]);
t.open(Object.defineProperty(Object.assign({}, GOT), 'lampa_tv_play', { value: { file: 55, at: 500, opened: [55] } }), season6());
check('«Продолжить» (marked open) is not asked again: no /torrents request', t.asked.filter((a) => /torrents/.test(a)), []);
check('…and it plays S6E5 at once, as before', [t.st.focus, t.st.entered], ['S6E5', 'S6E5']);

t = boot([torrent('abc', { id: 7, title: 'Фильм' }, { file: 2, at: 500 })], [2]);
t.open({ id: 7, title: 'Фильм' }, [{ id: 1, name: 'a', length: 4e9, torrent_hash: 'abc' }, { id: 2, name: 'b', length: 4e9, torrent_hash: 'abc' }]);
check('a film list → no TorrServer start lookup', t.asked.filter((a) => /torrents/.test(a)), []);
process.exitCode = failed ? 1 : 0;
