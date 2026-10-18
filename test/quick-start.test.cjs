// node test/quick-start.test.cjs
// quick-start choose(): which episode / file the file list focuses (or plays, when «Продолжить» marked the open).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');
const body = src.slice(src.indexOf('    function percent(el)'), src.indexOf("    Lampa.Listener.follow('torrent_file'"));
let focused = null, entered = null;
const Lampa = { Modal: { scroll: () => ({ render: () => null }) }, Controller: { collectionFocus: (item) => { focused = item.name; } } };
const choose = new Function('Lampa', body + 'return choose;')(Lampa);

const ep = (name, percent, updated) => ({ item: { name, trigger: () => { entered = name; } }, element: { id: name, episode: 1, timeline: percent === undefined ? undefined : { percent, updated } } });
const series = { name: 'GoT', number_of_seasons: 8 };
let failed = 0;
function check(title, list, movie, wantFocus, wantEnter) {
  focused = null; entered = null;
  choose(list, movie);
  const ok = focused === wantFocus && entered === wantEnter;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — focus ${focused} (want ${wantFocus}), play ${entered} (want ${wantEnter})`));
}

// the owner's case: E01 left at 4 % long ago, E04 finished, E05 at 30 % watched last
const owner = [ep('E01', 4, 100), ep('E02', 0, 0), ep('E03', 0, 0), ep('E04', 95, 300), ep('E05', 30, 400), ep('E06', 0, 0)];
check('watched last E05 unfinished → E05, not E01', owner, series, 'E05', null);
check('same with «Продолжить» → plays E05', owner, Object.defineProperty(Object.assign({}, series), 'lampa_tv_play', { value: {} }), 'E05', 'E05');
// TV 2026-10-18 22:05: skipping E01→E03 in MX marked E01, E02 (100 %) and E03 (1 %) at the same moment
check('same time on several marks → the later episode (E03)', [ep('E01', 100, 500), ep('E02', 100, 500), ep('E03', 1, 500), ep('E04', 4, 300)], series, 'E03', null);
check('watched last E04 finished → E05', [ep('E01', 4, 100), ep('E04', 95, 300), ep('E05', 0, 0)], series, 'E05', null);
check('last episode finished → nothing to play', [ep('E01', 100, 100), ep('E02', 100, 200)], Object.defineProperty(Object.assign({}, series), 'lampa_tv_play', { value: {} }), null, null);
check('nothing watched → first episode', [ep('E01', 0, 0), ep('E02', 0, 0)], series, 'E01', null);
check('marks without time → first unfinished', [ep('E01', 100), ep('E02', 40), ep('E03', 0)], series, 'E02', null);
check('marks without time, all done up to E02 → E03', [ep('E01', 100), ep('E02', 100), ep('E03', 0)], series, 'E03', null);

const film = { title: 'Madagascar' };
const big = (id, length) => ({ item: { name: id, trigger: () => { entered = id; } }, element: { id, length } });
check('film: one file → starts', [big(1, 5e9)], film, null, 1);
check('film collection, «Продолжить» remembers file 3 → plays 3', [big(1, 4e9), big(2, 4e9), big(3, 4e9)], Object.defineProperty(Object.assign({}, film), 'lampa_tv_play', { value: { file: 3 } }), null, 3);
check('film collection, nothing remembered → list stays', [big(1, 4e9), big(2, 4e9)], film, null, null);
process.exitCode = failed ? 1 : 0;
