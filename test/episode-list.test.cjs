// node test/episode-list.test.cjs
// ru-torrents 9) filter order — Качество, Сезон, then Lampa's order; 10) episode list — «S01/101 Pilot.mkv» is S1E1 (marks
// follow), names without TMDB are clean and alike across trackers.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const pure = src.slice(src.indexOf('    var FILTER_ORDER'), src.indexOf('    var torserver = Lampa.Torserver;'));
const wraps = src.slice(src.indexOf('    var torserver = Lampa.Torserver;'), src.indexOf('    // 6) Filter menu without the freeze'));
const fn = new Function(pure + 'return { filterOrder, orderedFilter, packedEpisode, cleanName };')();

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// 9) filter
const menu = ['reset', 'quality', 'hdr', 'dv', 'sub', 'voice', 'lang', 'season', 'tracker', 'year', '_3d'].map((s) => ({ stype: s === 'reset' ? undefined : s, title: s }));
fn.filterOrder(menu);
check('menu: Качество, then Сезон, rest in Lampa order', menu.map((x) => x.title), ['reset', 'quality', 'season', 'hdr', 'dv', 'sub', 'voice', 'lang', 'tracker', 'year', '_3d']);
const sortMenu = [{ title: 'Популярное' }, { title: 'Сиды' }];
fn.filterOrder(sortMenu);
check('other menus untouched', sortMenu.map((x) => x.title), ['Популярное', 'Сиды']);
check('chosen values: quality first, then season', Object.keys(fn.orderedFilter({ season: ['2'], voice: ['Дубляж'], quality: ['1080p'] })), ['quality', 'season', 'voice']);

// 10a) packed episode numbers
const bb = ['Breaking Bad/S01/101 Pilot -- Пилот.mkv', 'Breaking Bad/S01/102 Cat\'s in the Bag...-- Кот уже в мешке....mkv', 'Breaking Bad/S01/107 A No-Rough-Stuff-Type Deal.mkv',
  'Breaking Bad/S02/205 Breakage -- Бой товара.mkv', 'Breaking Bad/S02/213 ABQ.mkv', 'Breaking Bad/Bonus/Delited Scene.mkv'].map((p) => ({ path: p }));
check('S01/101 → episode 1', fn.packedEpisode(bb[0].path, bb), 1);
check('S02/213 → episode 13', fn.packedEpisode(bb[4].path, bb), 13);
check('extras folder untouched', fn.packedEpisode(bb[5].path, bb), 0);
const anime = ['One Piece/Season 1/101.mkv', 'One Piece/Season 1/102.mkv', 'One Piece/Season 1/099.mkv'].map((p) => ({ path: p }));
check('a folder not all S×100+N (real episode 101) untouched', fn.packedEpisode(anime[0].path, anime), 0);
const plain = ['Show/Season 2/07. Name.mkv', 'Show/Season 2/08. Name.mkv'].map((p) => ({ path: p }));
check('ordinary «07. Name» untouched', fn.packedEpisode(plain[0].path, plain), 0);

// 10b) names when TMDB has none: alike for every tracker
const names = [
  ['Breaking Bad/S01/101 Pilot -- Пилот.mkv', 1, 'Пилот'],
  ['Breaking Bad/S01/106 Crazy Handful of Nothin\x27-- Блеф на пустой руке.mkv', 6, 'Блеф на пустой руке'],
  ['Breaking Bad/S01/102 Cat\x27s in the Bag...-- Кот уже в мешке....mkv', 2, 'Кот уже в мешке'],
  ['Game.of.Thrones.S02E07.A.Man.Without.Honor.1080p.BluRay.x264.mkv', 7, 'Серия 7'],
  ['Igra.prestolov.S02E07.WEB-DL.1080p.LostFilm.mkv', 7, 'Серия 7'],
  ['Сезон 2/07. Человек без чести.mkv', 7, 'Человек без чести'],
  ['The Boys - 5x01 - Fifteen Inches of Sheer Dynamite.mkv', 1, 'Серия 1'],
  ['Пацаны.S05E01.Пятнадцать дюймов.WEB-DL.1080p.HDRezka.mkv', 1, 'Пятнадцать дюймов'],
  ['[SubsPlease] Frieren - 07 (1080p) [ABC123].mkv', 7, 'Серия 7'],
  ['07 серия.mkv', 7, 'Серия 7'],
  ['Wednesday/Season 2/Wednesday S02E03 2160p NF WEB-DL DDP5.1 Atmos DV HDR H.265.mkv', 3, 'Серия 3'],
];
names.forEach(([p, ep, want]) => check(`«${p.split('/').pop().slice(0, 44)}» → «${want}»`, fn.cleanName(p, ep), want));
check('a film whose title starts with a number keeps it', fn.cleanName('1917.2019.BDRip.1080p.mkv', 0), '1917 2019');
check('extra file: name only, no folders', fn.cleanName('Breaking Bad/Bonus/Making of Breaking Bad.mkv', 0), 'Making of Breaking Bad');

// wrappers: Lampa's parse with the packed fix + mark moved with its own time; template names
const marks = { old: { percent: 40, time: 1200, duration: 3000, profile: 7, updated: 1111 } };
const updates = [];
const Lampa = {
  Torserver: { parse: (d) => ({ season: 1, episode: 101, by_title: true, hash_string: '1101Breaking Bad', hash: 'old' }) },
  Template: { get: (name, vars) => ({ name, vars }) },
  Utils: { hash: (s) => 'h:' + s },
  Timeline: { view: (h) => marks[h] || { percent: 0, updated: 0 }, update: (p) => { updates.push(p); marks[p.hash] = p; },
    link: (card, season, episode) => ({ card: 'tv_' + card.id, season, episode }) },
};
new Function('Lampa', 'console', pure + wraps)(Lampa, { log: (...a) => { throw new Error(a.join(' ')); } });
const r = Lampa.Torserver.parse({ path: bb[0].path, files: bb, movie: { id: 1396, original_title: 'Breaking Bad' } });
check('parse: S1E1, hash of S1E1', [r.season, r.episode, r.hash], [1, 1, 'h:11Breaking Bad']);
check('mark moved with its own time, not «now», under the card key', updates.map((u) => [u.hash, u.percent, u.updated, u.received, u.card, u.episode]), [['h:11Breaking Bad', 40, 1111, true, 'tv_1396', 1]]);
Lampa.Torserver.parse({ path: bb[0].path, files: bb, movie: { id: 1396, original_title: 'Breaking Bad' } });
check('moved once: a newer mark under the new number is not overwritten', updates.length, 1);
marks['h:11Breaking Bad'] = { percent: 0, time: 0, updated: 999999999999 }; // «Сбросить тайм-код» on S1E1
Lampa.Torserver.parse({ path: bb[0].path, files: bb, movie: { id: 1396, original_title: 'Breaking Bad' } });
check('a reset of the moved episode stays (the old mark does not come back)', [updates.length, marks['h:11Breaking Bad'].percent], [1, 0]);
const tmdbNamed = Lampa.Template.get('torrent_file_serial', { path: bb[0].path, path_human: 'Breaking Bad/S01/101 Pilot -- Пилот', episode: 1, fname: 'Пилот' });
check('TMDB name kept', tmdbNamed.vars.fname, 'Пилот');
const rawNamed = Lampa.Template.get('torrent_file_serial', { path: 'GoT/Game.of.Thrones.S02E07.1080p.mkv', path_human: 'Game.of.Thrones.S02E07.1080p', episode: 7, fname: '7 / Game.of.Thrones.S02E07.1080p' });
check('raw «7 / path» replaced', rawNamed.vars.fname, 'Серия 7');
const extra = Lampa.Template.get('torrent_file', { path: 'Breaking Bad/Bonus/Making of Breaking Bad.mkv', path_human: 'Breaking Bad/Bonus/Making of Breaking Bad', title: 'Breaking Bad/Bonus/Making of Breaking Bad' });
check('extra: folders dropped', extra.vars.title, 'Making of Breaking Bad');
process.exitCode = failed ? 1 : 0;
