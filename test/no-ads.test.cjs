// node test/no-ads.test.cjs
// no-dmca.js 3) CUB's ads. Before a video that is not a torrent, Lampa plays CUB's pre-roll adverts (TV 2026-11-18: two
// in a row, 15 s each before «skip»). The core guards its own switches (Account.hasPremium and VPN.code are read-only,
// the ad list is loaded before any plugin runs), so the adverts are stopped where they come from: a request to a host
// CUB's ad lists name fails at once, and the core's own error path goes straight on to the video.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'no-dmca.js'), 'utf8');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// lists: what CUB answers for /api/ad/get/<api>; stored: hosts remembered from the session before
function world(lists, stored) {
  const w = { opened: [], fetched: [], logs: [], store: {}, asked: [] };
  if (stored) w.store.lampa_tv_ad_hosts = stored;
  function XHR() {}
  XHR.prototype.open = function (method, url) { w.opened.push(url); };
  const window = { lampa_settings: {}, XMLHttpRequest: XHR, fetch: (url) => { w.fetched.push(typeof url === 'string' ? url : url.url); return Promise.resolve('real'); } };
  const Lampa = {
    Manifest: { cub_domain: 'cub.example', cub_mirrors: ['cub.example', 'mirror.example'] },
    Utils: { protocol: () => 'http://' },
    Storage: { get: (k, d) => (k in w.store ? JSON.parse(JSON.stringify(w.store[k])) : typeof d === 'string' ? JSON.parse(d) : d), set: (k, v) => { w.store[k] = JSON.parse(JSON.stringify(v)); }, field: () => 'ru' },
    TMDB: { key: () => 'k' },
    Api: { sources: { cub: { full: () => {} } } },
    Reguest: function () {
      this.timeout = () => {};
      // like jQuery, the request goes through XMLHttpRequest.open — the plugin's own wrapper sees it
      this.silent = (url, ok, fail) => { new XHR().open('GET', url, true); url = w.opened.pop(); w.asked.push(url); const api = url.split('?')[0].split('/').pop(); if (lists && lists[api]) ok(lists[api]); else if (fail) fail(); };
    },
  };
  window.Lampa = Lampa;
  new Function('window', 'Lampa', 'XMLHttpRequest', 'location', 'console', 'setInterval', 'clearInterval', src)(
    window, Lampa, XHR, { hostname: 'lampa.mx' }, { log: (...a) => w.logs.push(a.join(' ')) }, () => 0, () => {});
  w.open = (url) => { new XHR().open('GET', url, true); return w.opened[w.opened.length - 1]; };
  w.fetch = (url) => window.fetch(url).then((v) => v, (e) => 'rejected');
  return w;
}
const AD = 'https://bid.ads.example/vast?id=1&cb=2', DEAD = 'http://127.0.0.1:9/';
const LISTS = { preroll: { ad: [{ name: 'a', url: AD }, { name: 'b', url: 'http://bid.ads.example/other' }] }, banner: { ad: [{ name: 'c', url: 'https://banner.example/x' }] } };

(async () => {
  let w = world(LISTS);
  check('both of CUB\'s ad lists are asked for, on the CUB domain', w.asked, ['http://cub.example/api/ad/get/preroll?lampa_tv=1', 'http://cub.example/api/ad/get/banner?lampa_tv=1']);
  check('a request to a host from the pre-roll list goes nowhere', w.open(AD), DEAD);
  check('…and to a host from the banner list', w.open('https://banner.example/x?1'), DEAD);
  check('…and it is logged', w.logs.some((l) => /NoAds/.test(l) && /bid\.ads\.example/.test(l)), true);
  check('fetch to an ad host is rejected, nothing leaves', [await w.fetch(AD), w.fetched], ['rejected', []]);
  check('everything else is untouched', [w.open('http://cub.example/api/card/1'), w.open('http://127.0.0.1:8090/torrents'), w.open('./personal.lampa'), w.open('https://api.themoviedb.org/3/movie/1'), await w.fetch('https://lampa.mx/x')],
    ['http://cub.example/api/card/1', 'http://127.0.0.1:8090/torrents', './personal.lampa', 'https://api.themoviedb.org/3/movie/1', 'real']);
  check('the hosts are kept for the next start (the lists arrive seconds after it)', w.store.lampa_tv_ad_hosts, ['bid.ads.example', 'banner.example']);

  w = world(null, ['bid.ads.example']);
  check('the lists did not load: the hosts remembered from before still work', [w.open(AD), w.store.lampa_tv_ad_hosts], [DEAD, ['bid.ads.example']]);

  w = world({ preroll: { ad: [{ url: 'http://cub.example/promo' }, { url: 'http://mirror.example/x' }, { url: 'http://lampa.mx/y' }, { url: 'not a url' }, {}] } });
  check('CUB\'s own domains and Lampa\'s address are never blocked, whatever the list says', [w.open('http://cub.example/api/x'), w.open('http://mirror.example/api/x'), w.open('http://lampa.mx/app.min.js'), w.store.lampa_tv_ad_hosts || []],
    ['http://cub.example/api/x', 'http://mirror.example/api/x', 'http://lampa.mx/app.min.js', []]);

  // the core asks CUB for its ad list again every hour (VastManager.init: Timer.add(1 h, load)); that request gets an
  // empty list, the core has no adverts left — and no «Реклама» splash either. Until then (the list of the start is
  // loaded before any plugin runs) the adverts are stopped by the hosts above.
  w = world(LISTS);
  const EMPTY = 'data:application/json,{"ad":[]}';
  check('the core\'s hourly re-read of the ad list gets an empty one — on any CUB mirror, both lists',
    [w.open('http://cub.example/api/ad/get/preroll'), w.open('https://mirror.example/api/ad/get/banner')], [EMPTY, EMPTY]);
  check('the plugin\'s own reading of the lists is not answered by itself', w.asked, ['http://cub.example/api/ad/get/preroll?lampa_tv=1', 'http://cub.example/api/ad/get/banner?lampa_tv=1']);
  check('the core\'s request with a query of its own is answered too', w.open('http://cub.example/api/ad/get/preroll?v=2'), EMPTY);
  check('…and it is logged', w.logs.some((l) => /NoAds/.test(l) && /empty/.test(l)), true);
  check('a path that only looks alike on another host is left alone', w.open('https://other.example/api/ad/get/preroll'), 'https://other.example/api/ad/get/preroll');

  w = world({ preroll: { ad: 'oops' }, banner: null });
  check('a list in another format: nothing blocked, nothing breaks', [w.open(AD), w.store.lampa_tv_ad_hosts || []], [AD, []]);
  process.exitCode = failed ? 1 : 0;
})();
