// node test/series-bitrate.test.cjs
// ru-torrents 11) a series' release: how many episodes the title says it holds, and their running time.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const body = src.slice(src.indexOf('    function releaseEpisodes(title)'), src.indexOf('    var BITRATE_MAX'));
const { releaseEpisodes, releaseMinutes } = new Function(body + 'return { releaseEpisodes, releaseMinutes };')();
let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}
// titles of real releases on the owner's TV
[
  ['Во все тяжкие (1-5 сезоны: 1-62 серии из 62) / Breaking Bad / 2008-2013 / ПД (Кубик в Кубе)', 62],
  ['Во все тяжкие / Breaking Bad [S01-05] (2008-2013) BDRip 1080p | P, P2, A | LostFilm', 0],
  ['Во все тяжкие / Breaking Bad / Сезон: 1 / Серии: 1-7 (7) (Винс Гиллиган, Адам Бернштейн)', 7],
  ['Во все тяжкие / Breaking Bad (2008) BDRip [H.264/1080p] (сезон 1, серии 1-7 из 7)', 7],
  ['Игра Престолов (1-8 сезоны: 1-73 серии из 73) / Game Of Thrones / 2011-2019 / ДБ, ПМ', 73],
  ['Пацаны / The Boys [05x01-02 из 08] (2026) WEB-DL 1080p | HDrezka Studio', 2],
  ['Гангстерленд / MobLand [01x01-09 из 10] (2025) WEB-DL 1080p', 9],
  ['Уэнсдэй (2 сезон: 1-8 серии из 8) / Wednesday / 2025 / 4 x ДБ, СТ / 4K, HEVC, HDR', 8],
  ['Carrie S01 (2026) 1080p WEBRip x265 DDP 5.1 ESub | 1337x', 0],
  ['Game.of.Thrones.S02E07.A.Man.Without.Honor.1080p.BluRay', 1],
  ['Show S01E01-E08 1080p', 8],
  ['Сериал [1- из 10] WEB-DL', 10],
  ['Сериал [12 из 12] WEB-DL', 12],
  ['Сериал / 5 серия / 2024', 1],
].forEach(([t, n]) => check(`${t.slice(0, 60)} → ${n}`, releaseEpisodes(t), n));
const data = { 1: { episodes: [{ runtime: 50 }, { runtime: 50 }, { runtime: null }] }, 2: { episodes: [{ runtime: 40 }, { runtime: 60 }] } };
check('whole seasons by title: the sum of the known times', releaseMinutes('Show [S01-02] BDRip', [1, 2], data), 200);
check('episodes by title: count × the average', releaseMinutes('Show (1-2 сезоны: 1-10 серии из 10)', [1, 2], data), 500);
check('a season TMDB did not answer → unknown', releaseMinutes('Show [S01-03]', [1, 2, 3], data), 0);
check('no season, no episodes in the title (Lampa assumes S1) → unknown', releaseMinutes('Show (2008-2013) Complete BDRip', [1], data), 0);
process.exitCode = failed ? 1 : 0;
