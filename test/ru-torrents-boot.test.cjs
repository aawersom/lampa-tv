// node test/ru-torrents-boot.test.cjs
// The whole ru-torrents booted on a fake Lampa:
//  13) the core's add of a pressed release keeps the data TorrServer saved with it (TorrServer gives a resting torrent the
//      data sent — MatriX.146 AddTorrent — so the start notes and tor-updater's record went with every press);
//   5) the warm-up stops when the external player (MX) starts — the core sends 'external' then, never 'start'.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// torrents: TorrServer's list; answer(body) → what TorrServer answers; null = no answer, 'fail' = error
function boot(torrents, opts) {
  opts = opts || {};
  const follows = {}, player = {}, sent = [], added = [], intervals = [], cleared = [];
  const on = (bag) => (name, fn) => { (bag[name] = bag[name] || []).push(fn); };
  const store = { parser_use: true, parser_torrent_type: 'torrserver', parse_lang: 'df' };
  const Lampa = {
    Listener: { follow: on(follows) },
    Player: { listener: { follow: on(player) } },
    Storage: { field: (k) => store[k], get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } },
    Lang: { translate: (k) => k },
    Select: { show: () => {} },
    Utils: { clearCard: (c) => c, hash: (s) => s },
    Controller: { enabled: () => ({ name: 'x' }) },
    Parser: { get: (params, ok) => ok({ Results: opts.results || [] }) },
    Torserver: {
      url: () => 'http://ts',
      hash: function (object, success) { added.push({ via: 'hash', data: object.data }); success({ hash: 'h' }); },
      add: function (object, success) { added.push({ via: 'add', data: object.data }); success({ hash: 'h' }); },
    },
    Reguest: function () {
      this.timeout = () => {};
      this.silent = (url, ok, err, body) => {
        const b = body ? JSON.parse(body) : {};
        sent.push(b.action + (b.hash ? ' ' + b.hash : ''));
        if (opts.down) return err();
        if (b.action === 'list') ok(torrents);
        else if (b.action === 'add') ok({ hash: 'warm' });
        else ok({});
      };
    },
  };
  new Function('Lampa', 'window', '$', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console', src)(
    Lampa, { Lampa }, undefined, (fn) => { fn(); return 0; }, () => {}, (fn) => { intervals.push(fn); return intervals.length; },
    (id) => cleared.push(id), { log: process.env.DBG ? console.log : () => {} });
  const send = (bag, name, e) => (bag[name] || []).forEach((fn) => fn(e));
  return { Lampa, sent, added, intervals, cleared, follows, player, send };
}

const movie = { id: 1396, name: 'BB', original_title: 'BB', title: 'BB' };
const HASH = '0123456789abcdef0123456789abcdef01234567';
const magnet = 'magnet:?xt=urn:btih:' + HASH.toUpperCase() + '&dn=BB';
const saved = { lampa: true, movie: { id: 1396, name: 'old' }, lampa_tv_play: { file: 13, at: 500 }, torrent_follow: { release_key: 'k' } };

// 13) a release saved in TorrServer is pressed
let t = boot([{ hash: HASH, title: '[LAMPA] BB', data: JSON.stringify(saved) }]);
t.Lampa.Torserver.hash({ link: magnet, title: 'BB', data: { lampa: true, movie } }, () => {}, () => {});
check('pressed release: the start note and tor-updater record go with Lampa\'s add', t.added[0] && t.added[0].data,
  { lampa: true, movie, lampa_tv_play: { file: 13, at: 500 }, torrent_follow: { release_key: 'k' } });
t.Lampa.Torserver.add({ link: magnet, title: 'BB', data: { lampa: true, movie } }, () => {}, () => {});
check('the core\'s other add (Torserver.add) too', t.added[1] && t.added[1].data.lampa_tv_play, { file: 13, at: 500 });

t = boot([]);
t.Lampa.Torserver.hash({ link: magnet, title: 'BB', data: { lampa: true, movie } }, () => {}, () => {});
check('a release TorrServer never had: Lampa\'s data as is', t.added[0] && t.added[0].data, { lampa: true, movie });

t = boot([], { down: true });
t.Lampa.Torserver.hash({ link: magnet, title: 'BB', data: { lampa: true, movie } }, () => {}, () => {});
check('TorrServer list fails: the add goes on with Lampa\'s data', t.added[0] && t.added[0].data, { lampa: true, movie });

t = boot([{ hash: HASH, data: JSON.stringify(saved) }]);
t.Lampa.Torserver.hash({ link: 'http://tracker/file.torrent', title: 'BB', data: { lampa: true, movie } }, () => {}, () => {});
check('a .torrent link (hash not known before the add): as is, no list asked', [t.added[0] && t.added[0].data, t.sent], [{ lampa: true, movie }, []]);

// 5) the warm-up stops when MX starts
t = boot([], { results: [{ Title: 'BB S1', MagnetUri: magnet, viewed: true, hash: 'v' }] });
t.Lampa.Storage.set('torrents_view', ['v']);
t.send(t.follows, 'full', { type: 'complite', data: { movie }, object: { activity: { render: () => ({ find: () => ({ length: 0, remove: () => {}, first: () => ({ length: 0 }) }) }) } } });
check('the card\'s release is warmed (added, kept alive)', [t.sent.indexOf('add') >= 0, t.intervals.length], [true, 1]);
t.send(t.player, 'external', {});
check('MX starts (core sends «external») → the warm-up stops', t.cleared, [1]);
process.exitCode = failed ? 1 : 0;
