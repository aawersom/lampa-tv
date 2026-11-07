// node test/ru-torrents-flow.test.cjs
// ru-torrents booted on a fake Lampa with a clock and TorrServer/parser answers that come when the test says:
// the windows where a late answer, a second press or a «Назад» meets work still in flight.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// ts(body) → TorrServer's answer to a request (sync); undefined → the request waits in `held` for the test
function boot(ts, opts) {
  opts = opts || {};
  let now = 0, seq = 0;
  const timers = [], held = [], parses = [], hashes = [], opened = [], follows = {}, player = {};
  let clears = 0;
  const later = (fn, ms, every) => { const t = { id: ++seq, at: now + (ms || 0), fn, every, off: false }; timers.push(t); return t.id; };
  const stop = (id) => timers.forEach((t) => { if (t.id === id) t.off = true; });
  const tick = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => !t.off && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      if (due.every) due.at += due.every; else due.off = true;
      due.fn();
    }
    now = end;
  };
  const on = (bag) => (name, fn) => { (bag[name] = bag[name] || []).push(fn); };
  const store = Object.assign({ parser_use: true, parser_torrent_type: 'torserver', parse_lang: 'df', parse_timeout: '6' }, opts.store || {});
  const el = () => { const h = {}; const e = { on: (n, f) => { (h[n] = h[n] || []).push(f); return e; }, find: () => ({ text: () => {}, length: 1 }), fire: (n) => (h[n] || []).forEach((f) => f()) }; return e; };
  const buttons = [];
  const $ = () => { const e = el(); buttons.push(e); return e; };
  const Lampa = {
    Listener: { follow: on(follows) },
    Player: { listener: { follow: on(player) } },
    Storage: { field: (k) => store[k], get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } },
    Lang: { translate: (k) => k },
    Select: { show: (p) => { (opts.shown || []).push(p); } },
    Utils: { clearCard: (c) => c, hash: (s) => s, calcBitrate: () => 0 },
    Controller: { enabled: () => ({ name: 'x' }), collectionAppend: () => {} },
    Timeline: { view: () => ({}) },
    Activity: { active: () => ({}) },
    Torrent: { open: (h, movie) => opened.push(h) },
    Parser: { get: (params, ok, err) => parses.push({ params, ok, err }) },
    Torserver: {
      url: () => 'http://ts',
      hash: (object, success) => { hashes.push(object.link); success({ hash: 'h' }); },
      add: (object, success) => { hashes.push(object.link); success({ hash: 'h' }); },
      clear: () => { clears++; },
    },
    Reguest: function () {
      this.timeout = () => {};
      this.silent = (url, ok, err, body) => {
        const b = body ? JSON.parse(body) : {};
        const r = { url, b, ok, err };
        const a = ts(b, url);
        if (a === undefined) held.push(r); else if (a === 'fail') err(); else ok(a);
      };
    },
  };
  new Function('Lampa', 'window', '$', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', src)(
    Lampa, { Lampa }, $, (fn, ms) => later(fn, ms), stop, (fn, ms) => later(fn, ms, ms), stop, { log: process.env.DBG ? console.log : () => {} });
  const send = (bag, name, e) => (bag[name] || []).forEach((fn) => fn(e));
  const render = { find: (sel) => sel === '.button--play' ? { length: 1, after: () => {} } : { length: 0, remove: () => {}, first: () => ({ length: 0 }) } };
  const openCard = (card) => send(follows, 'full', { type: 'complite', data: { movie: card }, object: { id: card.id, activity: { render: () => render } } });
  const closeCard = (card) => send(follows, 'activity', { type: 'destroy', component: 'full', object: { id: card.id } });
  const answer = (pred, value) => { const i = held.findIndex(pred); if (i < 0) return false; const r = held.splice(i, 1)[0]; if (value === 'fail') r.err(); else r.ok(value); return true; };
  return { Lampa, tick, held, parses, hashes, opened, buttons, timers: () => timers.filter((t) => !t.off), openCard, closeCard, answer, clears: () => clears, send, player, follows, store };
}

const HASH = '0123456789abcdef0123456789abcdef01234567';
const magnet = 'magnet:?xt=urn:btih:' + HASH + '&dn=BB';
const A = { id: 1396, name: 'BB', original_title: 'BB', title: 'Во все тяжкие', number_of_seasons: 5 };
const B = { id: 1399, name: 'GoT', original_title: 'GoT', title: 'Игра престолов', number_of_seasons: 8 };
const viewedRelease = { Title: 'BB S1', MagnetUri: magnet, viewed: true, hash: 'v' };
const keepAlive = (t) => t.timers().filter((x) => x.every === 15000).length;

// 1) the parsers answer after the card was left: no warm-up for it (it would stop another card's and run 20 min)
let t = boot((b) => (b.action === 'list' ? [] : b.action === 'add' ? { hash: 'w' } : {}), { store: { torrents_view: ['v'] } });
t.openCard(A);
t.closeCard(A);
t.parses[0].ok({ Results: [viewedRelease] });
check('1) answer after the card closed → no warm-up', keepAlive(t), 0);
t = boot((b) => (b.action === 'list' ? [] : b.action === 'add' ? { hash: 'w' } : {}), { store: { torrents_view: ['v'] } });
t.openCard(A);
t.parses[0].ok({ Results: [viewedRelease] });
check('1) answer while the card is open → warm-up', keepAlive(t), 1);

// 6) TorrServer's list fails: the warm-up must not add (an add over a resting torrent replaces its saved data)
t = boot((b) => (b.action === 'list' ? 'fail' : b.action === 'add' ? { hash: 'w' } : {}), { store: { torrents_view: ['v'] } });
t.openCard(A);
t.parses[0].ok({ Results: [viewedRelease] });
check('6) list failed → the warm-up adds nothing', keepAlive(t), 0);

// 4) the card's prefetch never answers (Parser.clear() of a search dropped it): «Торренты» asks again after a while
t = boot(() => []);
t.openCard(A);
const got = [];
t.Lampa.Parser.get({ movie: A, search: 'BB', page: 1 }, (json) => got.push(json.Results.length), () => got.push('err'));
check('4) «Торренты» while the prefetch is out: it waits', [t.parses.length, got], [1, []]);
t.tick(60000);
check('4) prefetch silent too long → asked again', t.parses.length, 2);
if (t.parses[1]) t.parses[1].ok({ Results: [viewedRelease, { Title: 'BB S2', MagnetUri: 'magnet:?xt=urn:btih:' + 'f'.repeat(40) }] }); // two releases (one btih would be merged into one row)
check('4) …and that answer reaches «Торренты»', got, [2]);

// 20) the search key falls back like the core's: no original title → the title
t = boot(() => []);
const noOrig = { id: 7, title: 'Фильм', original_title: '', release_date: '2020' };
t.openCard(noOrig);
t.parses[0].ok({ Results: [] });
t.Lampa.Parser.get({ movie: noOrig, search: 'Фильм', page: 1 }, () => {}, () => {});
check('20) empty original title: «Торренты» (search = title) takes the prefetched answer', t.parses.length, 1);

// 3) «Назад» on Lampa's loading screen while the saved data is being read: the add is not sent
t = boot((b) => (b.action === 'list' ? undefined : {}));
t.Lampa.Torserver.hash({ link: magnet, title: 'BB', data: { lampa: true, movie: A } }, () => {}, () => {});
t.Lampa.Torserver.clear();
t.answer((r) => r.b.action === 'list', []);
check('3) Torserver.clear() meanwhile → the add is dropped', t.hashes, []);
t = boot((b) => (b.action === 'list' ? undefined : {}));
t.Lampa.Torserver.hash({ link: magnet, title: 'BB', data: { lampa: true, movie: A } }, () => {}, () => {});
t.answer((r) => r.b.action === 'list', []);
check('3) no «Назад» → the add goes', t.hashes, [magnet]);

// 5) skipping Lampa's source menu keeps the watch context (the season of an episode's «Смотреть»)
const shown = [];
t = boot(() => [], { shown });
const picked = [];
const torrentBtn = { hasClass: (c) => c === 'view--torrent', trigger: () => picked.push('bare trigger') };
t.Lampa.Select.show({ title: 'settings_rest_source', items: [{ btn: torrentBtn }], onSelect: (a) => picked.push(a.btn === torrentBtn ? 'onSelect' : '?') });
check('5) «Торренты» taken through the menu\'s own onSelect (context kept)', [picked, shown.length], [['onSelect'], 0]);

// 2, 16) «Продолжить»: two OK presses before the release opens → opened once; a superseded release is never the one
const play = (at) => ({ file: 3, at, eps: [] });
const list = [
  { hash: 'OLD', timestamp: 10, data: JSON.stringify({ movie: A, lampa_tv_play: play(500), torrent_follow: { superseded_by: 'new' } }) },
  { hash: 'NEW', timestamp: 20, data: JSON.stringify({ movie: A, lampa_tv_play: play(500), torrent_follow: {} }) },
];
let hold = false;
t = boot((b, url) => (hold && b.action === 'list' ? undefined : b.action === 'list' && /torrents$/.test(url) ? list : []));
t.openCard(A);
t.parses[0].ok({ Results: [] });
const btn = t.buttons[t.buttons.length - 1];
hold = true;
btn.fire('hover:enter');
btn.fire('hover:enter');
while (t.answer((r) => r.b.action === 'list', list)) { /* both presses' lists */ }
check('2) two presses → the release opens once', t.opened.length, 1);
check('16) the superseded release (same start time) is not opened', t.opened, ['new']);
t.tick(10000);
hold = false;
btn.fire('hover:enter');
check('2) a later press opens it again', t.opened.length, 2);

// 14) merged rows keep the trackers' own spelling (Lampa's filter menu is case-sensitive)
t = boot(() => []);
t.openCard(B);
const twice = { Results: [{ Title: 'GoT', MagnetUri: magnet, Tracker: 'RuTracker', Seeders: 5 }, { Title: 'GoT', MagnetUri: magnet, Tracker: 'Kinozal', Seeders: 9 }] };
t.parses[0].ok(twice);
check('14) merged trackers keep their case', twice.Results[0].Tracker, 'RuTracker, Kinozal');
process.exitCode = failed ? 1 : 0;
