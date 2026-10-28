// node test/mx-title.test.cjs
// quick-start mxTitle(): the title MX gets for an episode is «Сезон 1 Серия 2: Название».
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'quick-start.js'), 'utf8');
const body = src.slice(src.indexOf('    function mxTitle'), src.indexOf('    if (Lampa.Android'));
const mxTitle = new Function(body + 'return mxTitle;')();

let failed = 0;
function check(title, el, want) {
  mxTitle(el);
  const got = el && el.title;
  const ok = got === want;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got «${got}», want «${want}»`));
}

check('episode with a TMDB name', { season: 1, episode: 2, title: 'Пилот' }, 'Сезон 1 Серия 2: Пилот');
check('no season parsed', { episode: 2, title: 'Имя' }, 'Серия 2: Имя');
check('bare «Серия N» placeholder (ru-torrents cleanName)', { season: 3, episode: 7, title: 'Серия 7' }, 'Сезон 3 Серия 7');
check('no name at all', { season: 1, episode: 4, title: '' }, 'Сезон 1 Серия 4');
check('string numbers from the parser', { season: '2', episode: '11', title: 'Имя' }, 'Сезон 2 Серия 11: Имя');
check('name merely contains the word «серия»', { season: 1, episode: 3, title: 'Серия убийств' }, 'Сезон 1 Серия 3: Серия убийств');
check('online_mod short label passes unchanged', { episode: 2, title: 'S1 / Серия 2 - Пилот' }, 'S1 / Серия 2 - Пилот');
check('online_mod full label passes unchanged', { episode: 2, title: 'Сезон 1 / Серия 2 - Пилот' }, 'Сезон 1 / Серия 2 - Пилот');
check('«2 серия» in the file name passes unchanged', { season: 1, episode: 2, title: '2 серия' }, '2 серия');
check('labelling twice changes nothing', { season: 1, episode: 2, title: 'Сезон 1 Серия 2: Пилот' }, 'Сезон 1 Серия 2: Пилот');
check('a film (no episode) is untouched', { title: 'Мадагаскар' }, 'Мадагаскар');

const film = { title: 'Мадагаскар' };
mxTitle(film);
if (film.episode !== undefined) { failed++; console.log('FAIL mxTitle must not add fields'); }

process.exit(failed ? 1 : 0);
