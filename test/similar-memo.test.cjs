// node test/similar-memo.test.cjs
// similar: TMDB answers are kept for the session (a keyword's list serves every card sharing it), but not without end —
// a card scrolled to its rows leaves ~26 answers (~300 KB), and Lampa lives for days on a 3 GB TV.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'similar.js'), 'utf8');
const body = src.slice(src.indexOf('    var MIN_VOTES'), src.indexOf('    // IMDb answers only to its own site'));

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

let asked = 0;
const Lampa = {
  TMDB: { api: (p) => p, key: () => 'k' }, Storage: { field: () => 'ru' },
  Reguest: function () { this.timeout = () => {}; this.silent = (url, ok) => { asked++; ok({ url }); }; },
};
const t = new Function('Lampa', body + 'return { tmdb: tmdb, size: function () { return Object.keys(memo).length; } };')(Lampa);

t.tmdb('discover/movie?with_keywords=1', () => {});
t.tmdb('discover/movie?with_keywords=1', () => {});
check('the same path within a session is asked once', asked, 1);
for (let i = 0; i < 2000; i++) t.tmdb('find/tt' + i, () => {});
check('2000 answers later the session keeps at most a few hundred', t.size() <= 300, true);
process.exitCode = failed ? 1 : 0;
