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
const win = {};
const marks = {};
function world(torrents, record) {
  const sent = [];
  const store = { lampa_tv_last_release: record || {}, torrents_view: [] };
  const Lampa = {
    Torserver: { url: () => 'http://ts' },
    Storage: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } },
    Utils: { clearCard: (c) => c, hash: (x) => 'h:' + x },
    Timeline: { view: (h) => Object.assign({ hash: h, percent: 0, time: 0, updated: 0 }, marks[h] || {}) },
    Reguest: function () {
      this.timeout = () => {};
      this.silent = (url, ok, fail, post) => {
        const b = post ? JSON.parse(post) : {};
        sent.push(b);
        if (b.action === 'list') ok(torrents.map((t) => ({ hash: t.hash, title: '[LAMPA] ' + t.hash, poster: 'p', category: 'tv', timestamp: t.ts, data: t.data || JSON.stringify(Object.assign({ movie: t.movie }, t.play ? { lampa_tv_play: t.play } : {})) })));
        else if (b.action === 'set') { const t = torrents.find((x) => x.hash === b.hash); if (t) t.data = b.data; ok(''); }
        else if (b.action === 'add') ok({ hash: 'added' });
        else ok({});
      };
    },
  };
  const api = new Function('Lampa', 'btih', 'setInterval', 'clearInterval', 'window', body + 'return { warmUp, continueRelease, rememberOpened, notePlay, continueLabel };')(Lampa, (r) => r.hash, () => 1, () => {}, win);
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

// 1.19.0: a release only LOOKED at moves TorrServer's timestamp; the start noted in a release's data decides
w = world([{ hash: 'aaaa1111', ts: 1000, movie: bb, play: { file: 12, at: 500, eps: [[11, 2, 4], [12, 2, 5]] } }, { hash: 'bbbb2222', ts: 9000, movie: bb }]);
let rec = null;
w.api.continueRelease(bb, (h, t, r) => { chosen = h; rec = r; });
check('a peek at another release (newer timestamp, nothing started) does not move «Продолжить»', [chosen, rec && rec.file], ['aaaa1111', 12]);
w = world([{ hash: 'aaaa1111', ts: 1000, movie: bb, play: { file: 12, at: 500 } }, { hash: 'bbbb2222', ts: 900, movie: bb, play: { file: 3, at: 800 } }]);
w.api.continueRelease(bb, (h) => { chosen = h; });
check('two releases started: the one started last', chosen, 'bbbb2222');
w = world([{ hash: 'aaaa1111', ts: 1000, movie: bb, play: { file: 12, at: 500 } }], { 'tv:1396': { hash: 'aaaa1111', file: 13, at: 700 } });
w.api.continueRelease(bb, (h, t, r) => { rec = r; });
check('a newer localStorage record of the same release tells the file', rec.file, 13);
// notePlay: the start goes into the release's data, Lampa's card and tor-updater's record kept
w = world([{ hash: 'aaaa1111', ts: 1000, movie: bb, data: JSON.stringify({ lampa: true, movie: bb, tor_updater_follow: { k: 1 } }) }]);
w.api.notePlay('aaaa1111', 12, [{ id: 11, season: 2, episode: 4 }, { id: 12, season: 2, episode: 5 }, { id: 99 }]);
const setBody = w.sent.find((b) => b.action === 'set'), d = JSON.parse(setBody.data);
check('notePlay keeps the card and other records, adds the start with the episodes', [d.lampa, d.movie.id, d.tor_updater_follow.k, d.lampa_tv_play.file, JSON.stringify(d.lampa_tv_play.eps), setBody.title, setBody.poster], [true, 1396, 1, 12, '[[11,2,4],[12,2,5]]', '[LAMPA] aaaa1111', 'p']);

// the label is quick-start's own choice over the noted episodes
const qs = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');
win.lampa_tv_pick_episode = new Function(qs.slice(qs.indexOf('    function percent(el)'), qs.indexOf("    Lampa.Listener.follow('torrent_file', function (e) {")) + 'return pickEpisode;')();
const card = { id: 1396, name: 'Во все тяжкие', original_title: 'Breaking Bad' };
const eps = [[11, 2, 4], [12, 2, 5], [13, 2, 6]];
w = world([]);
check('label: started S2E5, MX went on to S2E6, TV off → «S2E6»', w.api.continueLabel(card, { file: 12, at: 500, eps }, [12, 13]), 'S2E6');
marks['h:25Breaking Bad'] = { percent: 40, time: 1390, updated: 900 };
check('label: left MX with «Назад» on S2E5 at 23:10 → «S2E5 · 23:10»', w.api.continueLabel(card, { file: 12, at: 500, eps }, [12]), 'S2E5 · 23:10');
delete marks['h:25Breaking Bad']; marks['h:26Breaking Bad'] = { percent: 30, time: 878, updated: 100 };
check('label: MX went on to S2E6 with an older mark at 14:38 → «S2E6 · 14:38» (where it will start)', w.api.continueLabel(card, { file: 12, at: 500, eps }, [12, 13]), 'S2E6 · 14:38');
delete marks['h:26Breaking Bad'];
check('label: a film / no start known → none', [w.api.continueLabel({ id: 1, title: 'F' }, { file: 1, at: 5 }, []), w.api.continueLabel(card, {}, [])], ['', '']);
marks['h:25Breaking Bad'] = { percent: 30, time: 3725, updated: 900 };
check('label: past an hour → «1:02:05»', w.api.continueLabel(card, { file: 12, at: 500, eps }, [12]), 'S2E5 · 1:02:05');
process.exitCode = failed ? 1 : 0;
