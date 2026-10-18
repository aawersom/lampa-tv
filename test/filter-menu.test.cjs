// node test/filter-menu.test.cjs
// ru-torrents filterMenu: Lampa's filter menu (voices / trackers / seasons and their order) built from the stand-in releases
// must equal the menu built from all releases. `menu` replicates the loop of components/torrents.js buildFilterd (Lampa 3.3.7).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'ru-torrents.js'), 'utf8');
const VOICES = JSON.parse(/var VOICES = (\[.*?\]);/.exec(src)[1]);
const body = src.slice(src.indexOf('    var VOICES_LOW'), src.indexOf('    function patch()'));
const filterMenu = new Function('VOICES', body + 'return filterMenu;')(VOICES);

function menu(results, voices) {
  const voice = ['any', 'dub', 'poly', 'two', 'amateur'], tracker = ['any'], seasons = [];
  results.forEach((element) => {
    const title = element.Title.toLowerCase();
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i].toLowerCase();
      if (title.indexOf(v) >= 0 && voice.indexOf(voices[i]) == -1) voice.push(voices[i]);
      if (!element.info) element.info = { voices: voices.filter((x) => title.indexOf(x.toLowerCase()) >= 0) }; // TitleParser.voices
      if (element.info.voices && element.info.voices.map((x) => x.toLowerCase()).indexOf(v) >= 0 && voice.indexOf(voices[i]) == -1) voice.push(voices[i]);
    }
    element.Tracker.split(',').forEach((t) => { if (tracker.indexOf(t.trim()) === -1) tracker.push(t.trim()); });
    element.general.seasons.forEach((s) => { if (seasons.indexOf(s + '') == -1) seasons.push(s + ''); });
  });
  return JSON.stringify({ voice, tracker, seasons });
}

const copy = (x) => JSON.parse(JSON.stringify(x));
let failed = 0;
function check(name, results, voices = VOICES) {
  const full = menu(copy(results), voices);
  const filled = copy(results); menu(filled, voices); // what Lampa fills into releases without info
  const sub = filterMenu(results);
  const part = menu(copy(sub), voices);
  const sameInfo = results.every((e, i) => JSON.stringify(e.info) === JSON.stringify(filled[i].info));
  const ok = full === part && sameInfo;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + results.length + ' → ' + sub.length);
  if (!ok) { console.log('  all   ', full.slice(0, 300)); console.log('  menu  ', part.slice(0, 300)); console.log('  info filled like Lampa:', sameInfo); }
}

const got = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'got-880-results.json'), 'utf8'));
const rel = (Title, Tracker, voices, seasons) => ({ Title, Tracker, info: voices && { voices }, general: { seasons } });
check('Game of Thrones, 880 releases (TV, 2026-10-18)', got);
check('same, reversed order', got.slice().reverse());
check('every 7th without info', got.map((e, i) => (i % 7 ? e : Object.assign({}, e, { info: undefined }))));
check('voice only in info, voice only in title', [rel('A', 'x', ['LostFilm'], [1]), rel('B lostfilm', 'x', [], [1]), rel('C кравец', 'y, z', ['Кравец'], [2, 3])]);
check('a voice never matches across two titles', [rel('xx Lost', 'a', [], [1]), rel('Film yy', 'a', [], [1])]);
check('a voice Lampa added later, known only from info', [rel('A', 'x', [], [1]), rel('B', 'x', ['NewStudio2027'], [1])], VOICES.concat('NewStudio2027'));
check('no releases', []);
process.exitCode = failed ? 1 : 0;
