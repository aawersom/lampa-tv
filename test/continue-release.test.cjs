// node test/continue-release.test.cjs
// ru-torrents 5) warm-up and 7) «Продолжить»: both take the card's release TorrServer opened last, not the localStorage
// record — TV 2026-10-28: the warm-up added an old release (by the record / Lampa's marks), which made it the newest in
// TorrServer, and «Продолжить» played it.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const body = src.slice(src.indexOf('    var WARM_MAX'), src.indexOf('    function addContinue(e)'));

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// TorrServer: the card's releases with their timestamps (seconds); a request log
function world(torrents, record) {
  const sent = [];
  const store = { lampa_tv_last_release: record || {}, torrents_view: [] };
  const Lampa = {
    Torserver: { url: () => 'http://ts' },
    Storage: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } },
    Utils: { clearCard: (c) => c },
    Reguest: function () {
      this.timeout = () => {};
      this.silent = (url, ok, fail, post) => {
        const b = post ? JSON.parse(post) : {};
        sent.push(b);
        if (b.action === 'list') ok(torrents.map((t) => ({ hash: t.hash, title: '[LAMPA] ' + t.hash, timestamp: t.ts, data: JSON.stringify({ movie: t.movie }) })));
        else if (b.action === 'add') ok({ hash: 'added' });
        else ok({});
      };
    },
  };
  const api = new Function('Lampa', 'btih', 'setInterval', 'clearInterval', body + 'return { warmUp, continueRelease, rememberOpened };')(Lampa, (r) => r.hash, () => 1, () => {});
  return { api, sent };
}
const bb = { id: 1396, name: 'Во все тяжкие' };
const other = { id: 1399, name: 'Игра престолов' };
const parser = { Results: [{ hash: '8f165de6', MagnetUri: 'magnet:8f16', Title: 'avi', viewed: true }, { hash: '6f94a740', MagnetUri: 'magnet:6f94', Title: 'BD' }] };

// the evening of 2026-10-28: BD release 6f94 opened last night, the .avi 8f16 earlier; the record points at 8f16
let w = world([{ hash: '8f165de6', ts: 1000, movie: bb }, { hash: '6f94a740', ts: 2000, movie: bb }, { hash: 'ffff0000', ts: 9000, movie: other }], { 'tv:1396': { hash: '8f165de6', file: 8, at: 1 } });
let chosen = null;
w.api.continueRelease(bb, (h) => { chosen = h; });
check('«Продолжить»: the release TorrServer opened last for this card (not the record, not another card)', chosen, '6f94a740');
w.api.warmUp(bb, parser);
check('warm-up asks TorrServer for that same release, adds nothing', w.sent.filter((b) => b.action !== 'list').map((b) => b.action + ' ' + (b.hash || b.link)), ['get 6f94a740']);

// a card with nothing in TorrServer: the warm-up still picks from the parser's answer as before
w = world([{ hash: 'ffff0000', ts: 9000, movie: other }], { 'tv:1396': { hash: '6f94a740', file: 12, at: 1 } });
let none = false;
w.api.continueRelease(bb, () => {}, () => { none = true; });
check('nothing in TorrServer for the card → none (no «Продолжить»)', none, true);
w.api.warmUp(bb, parser);
check('…and the warm-up adds the recorded release from the parser answer', w.sent.filter((b) => b.action === 'add').map((b) => b.link), ['magnet:6f94']);

// a film and a series with the same TMDB id are different cards
w = world([{ hash: 'aaaa', ts: 5000, movie: { id: 1396, title: 'Film' } }, { hash: 'bbbb', ts: 100, movie: bb }]);
w.api.continueRelease(bb, (h) => { chosen = h; });
check('film with the same id is not the series', chosen, 'bbbb');
process.exitCode = failed ? 1 : 0;
