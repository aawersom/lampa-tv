// node test/poster-heal.test.cjs
// poster-heal failover: a host that keeps failing hands over to a host that can work on this line, never to
// Cloudflare/OVH (Russian ISPs cut their answers at ~16 KB) — TV 2026-10-24: nl failed while a torrent filled the line,
// the plugin went nl → pl → imagetmdb.com and every poster died.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'poster-heal.js'), 'utf8');

function load() {
  const logs = [];
  const Lampa = { Manifest: { cub_domain: 'cubnotrip.top' }, TMDB: { image: (u) => u, broken: () => {} } };
  const window = { Lampa };
  const document = { addEventListener() {}, querySelectorAll: () => [] };
  function Image() {} // probes never finish: no race winner, the failover choice alone decides
  const noop = () => 0;
  new Function('window', 'Lampa', 'document', 'Image', 'location', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', src)(
    Object.assign(window, { addEventListener() {} }), Lampa, document, Image, { protocol: 'http:' }, { log: (...a) => logs.push(a.join(' ')) },
    noop, noop, noop, noop);
  const host = () => Lampa.TMDB.image('t/p/w300/a.jpg').replace('t/p/w300/a.jpg', '');
  const fail = () => { const h = host(); for (let i = 0; i < 8; i++) Lampa.TMDB.broken(h + 't/p/w300/x' + i + '.jpg'); return host(); };
  return { host, fail, logs, Lampa };
}

let failed = 0;
function check(title, got, want) {
  const ok = got === want;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${got}, want ${want}`));
}

const bad = /\/\/(imagetmdb\.com|pl\.imagetmdb\.com|image\.tmdb\.org)\//;
const p = load();
check('starts on lampa.byskaz.ru', p.host(), 'http://lampa.byskaz.ru/tmdb/img/');
const seen = [];
for (let i = 0; i < 6; i++) seen.push(p.fail());
check('failover never lands on Cloudflare/OVH/image.tmdb.org', seen.filter((h) => bad.test(h)).join(', '), '');
check('byskaz failing → nl', seen[0], 'http://nl.imagetmdb.com/');
check('nl failing → CUB images', seen[1], 'https://imagetmdb.cubnotrip.top/');
check('CUB failing → back to byskaz', seen[2], 'http://lampa.byskaz.ru/tmdb/img/');
check('a failing host is logged', p.logs.filter((l) => /host failing/.test(l)).length, 6);
const s = load();
const h0 = s.host();
for (let i = 0; i < 7; i++) s.Lampa.TMDB.broken(h0 + 't/p/w300/y' + i + '.jpg');
check('7 errors in 10 s are not enough to switch', s.host(), h0);
process.exitCode = failed ? 1 : 0;
