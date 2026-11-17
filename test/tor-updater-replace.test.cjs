// node test/tor-updater-replace.test.cjs
// tor-updater, a release replaced by its update (tv fixes 4–6):
//  4) the files MX streamed by itself (TorrServer /viewed marks, which carry no timecode) go to the new release;
//  5) a start made on the OLD release after the replacement (its list stays on screen) is carried before the old release is
//     removed; a start that cannot be placed in the new release keeps the old release;
//  6) a superseded release that is being streamed is not removed; an external player (MX) marks its release busy.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tor-updater.js'), 'utf8');
const idx = (m) => { const i = src.indexOf(m); if (i < 0) throw new Error('marker not found: ' + m); return i; };
const at = (a, b) => src.slice(idx(a), idx(b));
const body = at('    function carryPlay(play, oldMap, newMap)', '    async function applyUpdate(') +
    at('    async function cleanupPersistedSuperseded()', '    function currentSession(hash)') +
    at('    function onPlayerStart(data)', '    function onPlayerDestroy()');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

const map = (rows) => new Map(rows.map(([id, s, e]) => [`S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`, { id, season: s, episode: e }]));
const oldMap = map([[0, 1, 1], [1, 1, 2], [2, 1, 3]]);
const newMap = map([[1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 1, 4]]);

// a fake TorrServer: torrents by hash { data, stat }, viewed marks by hash; every write is logged
function world(torrents, viewed, canClear) {
  const calls = [];
  const ts = {
    get: async (hash) => { if (!torrents[hash]) throw new Error('no torrent'); return { hash, data: JSON.stringify(torrents[hash].data), stat: torrents[hash].stat }; },
    set: async (hash, status, data) => { calls.push(['set', hash, data.lampa_tv_play || null]); torrents[hash].data = data; },
    remove: async (hash) => { calls.push(['rem', hash]); delete torrents[hash]; },
    viewed: async (hash) => viewed[hash] || [],
    setViewed: async (hash, id, timecode) => { calls.push(['viewed', hash, id, timecode]); },
    list: async () => Object.keys(torrents).map((hash) => ({ hash, data: JSON.stringify(torrents[hash].data), stat: torrents[hash].stat })),
  };
  if (canClear) ts.remViewed = async (hash) => { calls.push(['viewed-clear', hash]); };
  const runtime = { activePlayerHash: null, listHash: null, pendingCleanup: new Map() };
  const api = new Function('ts', 'runtime', 'FOLLOW_KEY', 'torrentData', 'log', 'warn', 'debug',
    body + 'return { transferViewed, cleanupOld, cleanupPersistedSuperseded, onPlayerStart };')(
    ts, runtime, 'torrent_follow', (s) => { try { return JSON.parse(s && s.data || '{}'); } catch (e) { return {}; } }, () => {}, () => {}, () => {});
  return { calls, runtime, api, torrents };
}
const run = async (title, fn, want) => { let got; try { got = await fn(); } catch (e) { got = 'threw: ' + e.message; } check(title, got, want); };

(async () => {
  // 4) marks made by streaming have no timecode
  await run('files MX streamed (marks without a timecode) go to the new release', async () => {
    const w = world({ old: { data: {} }, neu: { data: {} } }, { old: [{ file_index: 1, timecode: 0 }, { file_index: 2 }, { file_index: 9, timecode: 0 }] });
    await w.api.transferViewed('old', 'neu', oldMap, newMap);
    return w.calls;
  }, [['viewed', 'neu', 2, 0], ['viewed', 'neu', 3, 0]]);

  // 5) a start made on the old release after the replacement
  await run('a newer start on the old release is carried to the new one, then the old release goes', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 2, at: 900 } } }, neu: { data: { lampa_tv_play: { file: 2, at: 500 }, torrent_follow: { k: 1 } } } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap });
    const done = await w.api.cleanupOld('old');
    return [done, w.calls, w.torrents.neu && w.torrents.neu.data.torrent_follow];
  }, [true, [['set', 'neu', { file: 3, at: 900, eps: [[1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 1, 4]] }], ['rem', 'old']], { k: 1 }]);

  await run('files streamed on the old release since the replacement go along', async () => {
    const w = world({ old: { data: {} }, neu: { data: {} } }, { old: [{ file_index: 2, timecode: 0 }] });
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap });
    await w.api.cleanupOld('old');
    return w.calls;
  }, [['viewed', 'neu', 3, 0], ['rem', 'old']]);

  await run('a newer start that has no place in the new release keeps the old release', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 7, at: 900 } } }, neu: { data: { lampa_tv_play: { file: 2, at: 500 } } } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap });
    return [await w.api.cleanupOld('old'), w.calls];
  }, [false, []]);

  await run('after a Lampa restart (no episode maps) a newer start keeps the old release too', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 2, at: 900 }, torrent_follow: { superseded_by: 'neu' } }, stat: 5 }, neu: { data: { lampa_tv_play: { file: 2, at: 500 } }, stat: 5 } }, {});
    await w.api.cleanupPersistedSuperseded();
    return w.calls;
  }, []);

  await run('the start already on the new release: the old one is removed, nothing rewritten', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 1, at: 500 } } }, neu: { data: { lampa_tv_play: { file: 2, at: 500 } } } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap });
    return [await w.api.cleanupOld('old'), w.calls];
  }, [true, [['rem', 'old']]]);

  // 6) a release in use
  await run('at Lampa start a superseded release that is being streamed stays; a resting one goes', async () => {
    const w = world({
      play: { data: { torrent_follow: { superseded_by: 'neu' } }, stat: 3 }, rest: { data: { torrent_follow: { superseded_by: 'neu' } }, stat: 5 },
      neu: { data: {}, stat: 5 } }, {});
    await w.api.cleanupPersistedSuperseded();
    return w.calls;
  }, [['rem', 'rest']]);

  await run('the release MX plays is busy: not removed', async () => {
    const w = world({ old: { data: {} }, neu: { data: {} } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap });
    w.api.onPlayerStart({ torrent_hash: 'OLD' });
    return [await w.api.cleanupOld('old'), w.calls];
  }, [false, []]);

  // the external player's start reaches onPlayerStart: the listener is set for 'start' and 'external'
  const follows = [];
  const install = at("        L.Listener.follow('activity', onActivity)", '        setTimeout(cleanupPersistedSuperseded, 2000)');
  try { new Function('L', 'onActivity', 'onPlayerStart', 'onPlayerDestroy', install)({ Listener: { follow() {} }, Player: { listener: { follow: (name, fn) => follows.push(name + ':' + fn) } } }, 0, 'start', 'destroy'); } catch (e) { follows.push('threw ' + e.message); }
  check('MX (the «external» player event) marks its release busy like Lampa\'s own player', follows.sort(), ['destroy:destroy', 'external:start', 'start:start']);

  // ---- after the review of 0.1.6-tv.4: the refusal «keep the old release» must have a way out ----
  const EPS_OLD = [[0, 1, 1], [1, 1, 2], [2, 1, 3]], EPS_NEW = [[1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 1, 4]];
  await run('after a Lampa restart the maps are rebuilt from the two start records: the newer start is carried, the old release goes', async () => {
    const w = world({
      old: { data: { lampa_tv_play: { file: 2, at: 900, eps: EPS_OLD }, torrent_follow: { superseded_by: 'neu', checked_at: 600 } }, stat: 5 },
      neu: { data: { lampa_tv_play: { file: 2, at: 500, eps: EPS_NEW } }, stat: 5 } }, { old: [{ file_index: 2 }] });
    await w.api.cleanupPersistedSuperseded();
    return w.calls;
  }, [['set', 'neu', { file: 3, at: 900, eps: EPS_NEW }], ['viewed', 'neu', 3, 0], ['rem', 'old']]);

  await run('a film: its start was made BEFORE the replacement and has no place in the new release → the old one still goes', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 0, at: 400, eps: [] }, torrent_follow: { superseded_by: 'neu', checked_at: 600 } }, stat: 5 }, neu: { data: {}, stat: 5 } }, {});
    await w.api.cleanupPersistedSuperseded();
    return w.calls;
  }, [['rem', 'old']]);

  await run('same in the session of the replacement (its time is kept with the maps)', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 7, at: 400 } } }, neu: { data: {} } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap, at: 600 });
    return [await w.api.cleanupOld('old'), w.calls];
  }, [true, [['rem', 'old']]]);

  await run('the new release cannot be read while the old one holds a newer start → the old release stays', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 2, at: 900 } } } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap, at: 600 });
    return [await w.api.cleanupOld('old'), w.calls];
  }, [false, []]);

  await run('files already carried are not sent again', async () => {
    const w = world({ old: { data: {} }, neu: { data: {} } }, { old: [{ file_index: 1 }, { file_index: 2 }] });
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap, at: 600, sent: new Set([1]) });
    await w.api.cleanupOld('old');
    return w.calls;
  }, [['viewed', 'neu', 3, 0], ['rem', 'old']]);

  await run('a carried newer start: the new release\'s marks of the session before are cleared first', async () => {
    const w = world({ old: { data: { lampa_tv_play: { file: 1, at: 900 } } }, neu: { data: { lampa_tv_play: { file: 2, at: 500 } } } }, { old: [{ file_index: 1 }] }, true);
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap, at: 600, sent: new Set([1, 2]) });
    await w.api.cleanupOld('old');
    return w.calls.map((c) => c.slice(0, 3).join(' '));
  }, ['set neu [object Object]', 'viewed-clear neu', 'viewed neu 2', 'rem old']);

  for (const stat of [1, 2]) {
    await run('at Lampa start a superseded release in state ' + stat + ' (getting info / preload) stays', async () => {
      const w = world({ play: { data: { torrent_follow: { superseded_by: 'neu' } }, stat }, neu: { data: {}, stat: 5 } }, {});
      await w.api.cleanupPersistedSuperseded();
      return w.calls;
    }, []);
  }

  // an external player sends no «destroy»: it is over when Lampa is on screen again
  const back = async (hidden, opened) => {
    const w = world({ old: { data: {} }, neu: { data: {} } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap });
    w.api.onPlayerStart({ torrent_hash: 'old' });
    const code = at('    function onPlayerDestroy()', '    function registerSettings()');
    const onVisible = new Function('runtime', 'cleanupOld', 'document', 'lampa', code + 'return typeof onVisible === "function" ? onVisible : function () {};')(
      w.runtime, w.api.cleanupOld, { hidden }, () => ({ Player: { opened: () => opened } }));
    onVisible();
    await new Promise((r) => setTimeout(r, 20));
    return [w.runtime.activePlayerHash, w.calls];
  };
  await run('back from MX: its release is free again and the replaced one goes', () => back(false, false), [null, [['rem', 'old']]]);
  await run('Lampa still hidden behind MX: the release stays busy', () => back(true, false), ['old', []]);
  await run('Lampa\'s own player is open: left to its «destroy»', () => back(false, true), ['old', []]);
  await run('back from MX with the old release\'s list still open: free again, removed only when the list closes', async () => {
    const w = world({ old: { data: {} }, neu: { data: {} } }, {});
    w.runtime.pendingCleanup.set('old', { newHash: 'neu', oldMap, newMap });
    w.api.onPlayerStart({ torrent_hash: 'old' });
    w.runtime.listHash = 'old';
    const code = at('    function onPlayerDestroy()', '    function registerSettings()');
    new Function('runtime', 'cleanupOld', 'document', 'lampa', code + 'return onVisible;')(w.runtime, w.api.cleanupOld, { hidden: false }, () => ({ Player: { opened: () => false } }))();
    await new Promise((r) => setTimeout(r, 20));
    return [w.runtime.activePlayerHash, w.calls];
  }, [null, []]);

  process.exitCode = failed ? 1 : 0;
})();
