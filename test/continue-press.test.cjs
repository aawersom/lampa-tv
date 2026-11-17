// node test/continue-press.test.cjs
// ru-torrents, «Продолжить» pressed while TorrServer does not answer (its process died — the app does not restart it):
// the viewer is told at once and nothing is opened (the core's file list would spin for 90 s and say «timeout»); the
// failure is logged. A start that could not be noted in TorrServer is logged too — «Продолжить» goes by that note.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const idx = (m) => { const i = src.indexOf(m); if (i < 0) throw new Error('marker not found: ' + m); return i; };
const body = src.slice(idx('    var WARM_MAX'), idx('    // 8) Card buttons'));

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

const CARD = { id: 7, name: 'Series', original_name: 'Series' };
function world() {
  const w = { dead: false, notes: [], opened: [], logs: [], handlers: {}, sets: 0 };
  const torrents = [{ hash: 'abc', timestamp: 1, data: JSON.stringify({ lampa: true, movie: CARD, lampa_tv_play: { file: 2, at: 500, eps: [[1, 1, 1], [2, 1, 2]] } }) }];
  const el = () => { const o = { length: 1, find: () => o, on: (name, fn) => { w.handlers[name] = fn; return o; }, after: () => o, text: () => o }; return o; };
  const none = { length: 0, find: () => none };
  const Lampa = {
    Torserver: { url: () => 'http://ts' },
    Storage: { get: (k, d) => (typeof d === 'string' ? JSON.parse(d) : d), set: () => {} },
    Utils: { clearCard: (c) => c, hash: (x) => 'h:' + x },
    Timeline: { link: () => ({}), view: (h) => ({ hash: h, percent: 0, time: 0, duration: 0, updated: 0 }), update: () => {} },
    Controller: { enabled: () => ({ name: 'full_start' }), collectionAppend: () => {} },
    Noty: { show: (text) => w.notes.push(text) },
    Torrent: { open: (hash) => w.opened.push(hash) },
    Reguest: function () {
      this.timeout = () => {};
      this.silent = (url, ok, fail, post) => {
        if (w.dead) return fail && fail({ status: 0 });
        const b = post ? JSON.parse(post) : {};
        if (/\/viewed$/.test(url)) return ok([{ file_index: 2 }]);
        if (b.action === 'set') { if (w.failSet) return fail && fail({ status: 500 }); w.sets++; return ok(''); }
        ok(torrents);
      };
    },
  };
  const render = { find: (sel) => (sel === '.button--continue' ? none : el()) };
  const api = new Function('Lampa', 'btih', 'setInterval', 'clearInterval', 'window', 'console', '$', 'CONTINUE_ICON',
    body + 'return { addContinue, notePlay };')(Lampa, (r) => r.hash, () => 1, () => {}, {}, { log: (...a) => w.logs.push(a.join(' ')) }, () => el(), '');
  w.api = api;
  w.build = () => api.addContinue({ type: 'complite', data: { movie: CARD }, object: { activity: { render: () => render } } });
  return w;
}

let w = world();
w.build();
w.handlers['hover:enter']();
check('TorrServer answers: the release opens, no notice', [w.opened, w.notes], [['abc'], []]);

w = world();
w.build();
w.dead = true;
w.handlers['hover:enter']();
check('TorrServer silent at the press: nothing opens, the viewer is told once', [w.opened, w.notes.length, /TorrServer/.test(w.notes[0] || '')], [[], 1, true]);
check('…and it is logged', w.logs.some((l) => /TorrServer does not answer/.test(l)), true);
w.dead = false;
w.handlers['hover:enter']();
check('pressed again when TorrServer is back: opens (the 10-s double-press guard was released)', w.opened, ['abc']);

w = world();
w.dead = true;
w.api.notePlay('abc', 2, []);
check('a start that could not be noted in TorrServer is logged', w.logs.some((l) => /start not noted/.test(l)), true);
w = world();
w.api.notePlay('zzz', 2, []);
check('…also when the release is not in TorrServer\'s list', w.logs.some((l) => /start not noted/.test(l)), true);
w = world();
w.api.notePlay('abc', 2, []);
check('a noted start: one write, no failure line', [w.sets, w.logs.filter((l) => /start not noted/.test(l)).length], [1, 0]);
w = world();
w.failSet = true;
w.api.notePlay('abc', 2, []);
check('TorrServer refused the write: logged', w.logs.some((l) => /start not noted: TorrServer refused the write/.test(l)), true);
process.exitCode = failed ? 1 : 0;
