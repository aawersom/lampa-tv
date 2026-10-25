// node test/poster-heal.test.cjs
// poster-heal: each poster from one of the cacheable hosts (nl/de, by its path), every retry of it from the next host,
// a failing host set aside — never Cloudflare/OVH/image.tmdb.org for a card (TV line: 10–11 s a poster / DNS 127.0.0.1).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'poster-heal.js'), 'utf8');

function load(dead) {
  const checks = [];
  const logs = [];
  const Lampa = { Manifest: { cub_domain: 'cubnotrip.top' }, TMDB: { image: (u) => u, broken: () => {} } };
  const window = { Lampa, addEventListener() {} };
  const document = { addEventListener() {}, querySelectorAll: () => [] };
  // a host check: a dead host errors, a live one loads (synchronously; the plugin sets onload/onerror before src)
  function Image() {}
  Object.defineProperty(Image.prototype, 'src', { set(u) { if (!u) return; checks.push(u); const bad = (dead || []).some((h) => u.indexOf(h) === 0); this.naturalWidth = bad ? 0 : 92; bad ? this.onerror && this.onerror() : this.onload && this.onload(); }, get() { return ''; } });
  const noop = () => 0;
  new Function('window', 'Lampa', 'document', 'Image', 'location', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', src)(
    window, Lampa, document, Image, { protocol: 'http:' }, { log: (...a) => logs.push(a.join(' ')) }, noop, noop, noop, noop);
  const host = (p) => Lampa.TMDB.image(p).replace(p, '');
  return { Lampa, host, logs, checks };
}

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

const NL = 'http://nl.imagetmdb.com/', DE = 'http://de.imagetmdb.com/', BY = 'http://lampa.byskaz.ru/tmdb/img/', CUB = 'https://imagetmdb.cubnotrip.top/';
const posters = Array.from({ length: 200 }, (_, i) => `t/p/w300/poster${i}.jpg`);
let t = load();
const first = posters.map((p) => t.host(p));
check('every poster from nl or de (both cache for a year)', first.every((h) => h === NL || h === DE), true);
const nl = first.filter((h) => h === NL).length;
check('split about half and half', nl > 70 && nl < 130, true);
check('the same poster always from the same host (cache hits)', posters.map((p) => t.host(p)), first);
check('Lampa’s double slash normalised', t.Lampa.TMDB.image('t/p/w300//poster1.jpg'), first[1] + 't/p/w300/poster1.jpg');

// one poster fails: each of Lampa's retries goes to the next host
const p = posters[0], order = [t.host(p)];
for (let i = 0; i < 4; i++) { t.Lampa.TMDB.broken(order[order.length - 1] + p); order.push(t.host(p)); }
const other = order[0] === NL ? DE : NL;
check('retries: the other cacheable host, byskaz, CUB, then round again', order, [order[0], other, BY, CUB, order[0]]);
check('other posters keep their host', posters.slice(1, 50).map((x) => t.host(x)), first.slice(1, 50));
check('never Cloudflare/OVH/image.tmdb.org for a card', order.concat(first).some((h) => /pl\.imagetmdb|\/\/imagetmdb\.com|image\.tmdb\.org/.test(h)), false);

// back from the player: Lampa's 15-s timer fails a whole screen at once, nl and de are fine → nothing set aside
t = load([]);
const screen = posters.slice(0, 20);
screen.forEach((x) => t.Lampa.TMDB.broken(t.host(x) + x));
check('burst of timeouts with live hosts: nl and de stay in', posters.slice(100, 140).every((x) => [NL, DE].includes(t.host(x))), true);
// nl really dead: 8 errors → checked → set aside, its posters go to de
t = load([NL]);
const onNl = posters.filter((x) => t.host(x) === NL);
for (let i = 0; i < 8; i++) t.Lampa.TMDB.broken(NL + onNl[i]);
check('nl dead → set aside, its untouched posters from de', onNl.slice(10, 30).map((x) => t.host(x)).every((h) => h === DE), true);
check('logged', t.logs.some((l) => /set aside/.test(l)), true);
t = load([]);
const atStart = t.checks.length;
for (let i = 0; i < 7; i++) t.Lampa.TMDB.broken(NL + onNl[i]);
check('7 errors in 10 s: no check yet; the 8th checks nl', [t.checks.length - atStart, (t.Lampa.TMDB.broken(NL + onNl[7]), t.checks.length - atStart)], [0, 1]);
// a retry never goes to the host that just failed, even when that failure set it aside
t = load([BY]);
const q = posters[3], seen = [t.host(q)];
for (let i = 0; i < 2; i++) { t.Lampa.TMDB.broken(seen[seen.length - 1] + q); seen.push(t.host(q)); }
for (let i = 0; i < 8; i++) t.Lampa.TMDB.broken(BY + posters[150 + i]);
t.Lampa.TMDB.broken(seen[seen.length - 1] + q); seen.push(t.host(q));
check('no host twice in a row for one poster', seen.every((h, i) => i === 0 || h !== seen[i - 1]), true);
process.exitCode = failed ? 1 : 0;
