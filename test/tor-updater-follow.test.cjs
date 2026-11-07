// node test/tor-updater-follow.test.cjs
// tor-updater writeFollow: its follow record goes into the torrent's data as it is in TorrServer at the moment of writing.
// The check after a list opens reads the torrent, waits for the parsers (seconds), then writes; a file started meanwhile
// gets ru-torrents' start record (lampa_tv_play) into the same data — writing the data read before lost it.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tor-updater.js'), 'utf8');
const body = src.slice(src.indexOf('    function safeJson(value, fallback)'), src.indexOf('    function clone(value)')) +
    src.slice(src.indexOf('    function torrentData(status)'), src.indexOf('    function selectionMetadata(result)'));

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

function server(data) { // TorrServer with one torrent; get/set as tor-updater's client calls them
  const s = { data: JSON.stringify(data), sets: [] };
  s.ts = {
    get: async (hash) => ({ hash, title: '[LAMPA] BB', poster: 'p', category: 'tv', data: s.data }),
    set: async (hash, status, d) => { s.sets.push({ hash, title: status.title, data: d }); s.data = JSON.stringify(d); },
  };
  return s;
}
const make = (ts) => new Function('ts', 'FOLLOW_KEY', 'FOLLOW_VERSION', body + 'return writeFollow;')(ts, 'torrent_follow', 1);

(async () => {
  const movie = { id: 1396, name: 'BB' };
  // the check read the torrent before the file was started…
  const s = server({ movie, torrent_follow: { release_key: 'k', checked_at: 1 } });
  const stale = await s.ts.get('abc');
  // …then a file was started: ru-torrents noted it in the torrent's data
  s.data = JSON.stringify({ movie, torrent_follow: { release_key: 'k', checked_at: 1 }, lampa_tv_play: { file: 13, at: 500 } });
  await make(s.ts)(stale, { checked_at: 900 });
  const written = s.sets[0].data;
  check('the start noted meanwhile stays', written.lampa_tv_play, { file: 13, at: 500 });
  check('the follow record is updated', written.torrent_follow, { release_key: 'k', checked_at: 900, version: 1 });
  check('the card stays', written.movie, movie);
  check('title kept', s.sets[0].title, '[LAMPA] BB');

  // TorrServer does not answer the fresh read → the status in hand is written, as before
  const s2 = server({ movie, torrent_follow: { release_key: 'k' } });
  const st2 = await s2.ts.get('abc');
  s2.ts.get = async () => { throw new Error('down'); };
  await make(s2.ts)(st2, { checked_at: 7 });
  check('fresh read fails → written from the status in hand', s2.sets[0].data.torrent_follow, { release_key: 'k', checked_at: 7, version: 1 });
  process.exitCode = failed ? 1 : 0;
})();
