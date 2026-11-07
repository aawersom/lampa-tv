// node test/tor-updater-play.test.cjs
// tor-updater carryPlay: when a release is replaced by its update, ru-torrents' start record (lampa_tv_play) goes to the new
// torrent with the new torrent's file ids (by season/episode — file indexes differ between the two torrents), and its
// episode list is the new release's. A start that cannot be placed in the new release is not carried.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tor-updater.js'), 'utf8');
const at = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const body = at('    function episodeKey(season, episode)', '    function episodeMap(movie, files)').replace(/\n    function (?!episodeKey)[\s\S]*$/, '\n') +
    at('    function carryPlay(play, oldMap, newMap)', '    async function transferViewed(');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}
let carryPlay;
try { carryPlay = new Function(body + 'return carryPlay;')(); } catch (e) { carryPlay = () => 'no carryPlay'; }

const map = (rows) => new Map(rows.map(([id, s, e]) => [`S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`, { id, season: s, episode: e }]));
// old: S1E1..E3 at files 0..2; new: an extra file came first, so every episode moved by one, and E4 is new
const oldMap = map([[0, 1, 1], [1, 1, 2], [2, 1, 3]]);
const newMap = map([[1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 1, 4]]);
const play = { file: 1, at: 500, eps: [[0, 1, 1], [1, 1, 2], [2, 1, 3]] };

check('the started episode keeps its place in the new release (S1E2: file 1 → 2)', carryPlay(play, oldMap, newMap),
  { file: 2, at: 500, eps: [[1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 1, 4]] });
check('a start on a file the new release lacks is not carried', carryPlay({ file: 9, at: 500, eps: [] }, oldMap, newMap), null);
check('no start record → nothing', carryPlay(undefined, oldMap, newMap), null);
process.exitCode = failed ? 1 : 0;
