// node test/spare-parser.test.cjs
// ru-torrents 12) spare parser: jac-red.ru is asked through Lampa's own Parser.jackett when the configured parsers fail,
// find nothing, or have not answered in SPARE_AFTER; one answer reaches Lampa.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const body = src.slice(src.indexOf('        var SPARE = '), src.indexOf('        function run(params, oncomplite, onerror)'));

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// main/spare: { ok: json } | { err: 'x' } | { never: true }, `after` = ms; a fake clock runs the timers in order
function scenario(main, spare, type) {
  let now = 0; const queue = []; const calls = [];
  const later = (ms, fn) => { const t = { at: now + ms, fn, off: false }; queue.push(t); return t; };
  const answer = (spec, ok, err) => { if (spec.never) return; later(spec.after || 0, () => (spec.ok ? ok(spec.ok) : err(spec.err))); };
  const Lampa = {
    Storage: { field: () => type || 'jackett' },
    Parser: { jackett: (params, base, key, rank, ok, err) => { calls.push('spare ' + base); answer(spare, ok, err); } },
  };
  const orig = (params, ok, err) => { calls.push('main'); answer(main, ok, err); };
  const ask = new Function('Lampa', 'orig', 'setTimeout', 'clearTimeout', 'console', body + 'return ask;')(
    Lampa, orig, (fn, ms) => later(ms, fn), (t) => { if (t) t.off = true; }, { log: () => {} });
  const got = [];
  ask({ search: 'x' }, (json) => got.push('ok:' + json.Results.length), (e) => got.push('err:' + e));
  while (queue.length) { queue.sort((a, b) => a.at - b.at); const t = queue.shift(); now = t.at; if (!t.off) t.fn(); }
  return { got, calls };
}
const R = (n) => ({ Results: new Array(n).fill({}) });

check('jac.red answers → its results, spare never asked', scenario({ ok: R(5), after: 500 }, { ok: R(9) }), { got: ['ok:5'], calls: ['main'] });
check('jac.red fails → spare asked, its results', scenario({ err: 'down', after: 300 }, { ok: R(7), after: 400 }), { got: ['ok:7'], calls: ['main', 'spare http://jac-red.ru'] });
check('jac.red finds nothing → spare asked', scenario({ ok: R(0), after: 300 }, { ok: R(4), after: 400 }), { got: ['ok:4'], calls: ['main', 'spare http://jac-red.ru'] });
check('both find nothing → the empty answer (no error)', scenario({ ok: R(0), after: 300 }, { ok: R(0), after: 400 }), { got: ['ok:0'], calls: ['main', 'spare http://jac-red.ru'] });
check('both fail → Lampa\'s error', scenario({ err: 'down', after: 300 }, { err: 'down2', after: 400 }), { got: ['err:down'], calls: ['main', 'spare http://jac-red.ru'] });
check('jac.red silent 6 s → spare asked and used', scenario({ never: true }, { ok: R(3), after: 500 }), { got: ['ok:3'], calls: ['main', 'spare http://jac-red.ru'] });
check('jac.red slow but first after the spare started → jac.red, once', scenario({ ok: R(6), after: 6200 }, { ok: R(3), after: 900 }), { got: ['ok:6'], calls: ['main', 'spare http://jac-red.ru'] });
check('spare first after 6 s, jac.red later → spare, once', scenario({ ok: R(6), after: 9000 }, { ok: R(3), after: 100 }), { got: ['ok:3'], calls: ['main', 'spare http://jac-red.ru'] });
check('spare empty first, jac.red later with results → jac.red', scenario({ ok: R(6), after: 9000 }, { ok: R(0), after: 100 }), { got: ['ok:6'], calls: ['main', 'spare http://jac-red.ru'] });
check('parser type is not Jackett → Lampa as is', scenario({ err: 'down', after: 300 }, { ok: R(7) }, 'torrserver'), { got: ['err:down'], calls: ['main'] });
process.exitCode = failed ? 1 : 0;
