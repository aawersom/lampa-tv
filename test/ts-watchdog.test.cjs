// node test/ts-watchdog.test.cjs   (needs a POSIX sh on PATH: Git Bash on the PC)
// tv/ts-watchdog.sh with stand-ins for the Android commands (am, dumpsys, logcat, input) and for curl:
//  - no curl to check with → it stops, never touching TorrServe (it would kill a working server every minute);
//  - a server that answers → nothing is restarted;
//  - restarts that do not help are spaced out (the wait doubles), not repeated every check.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const script = path.join(__dirname, '..', 'tv', 'ts-watchdog.sh');

let failed = 0;
function check(title, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

function run(curl, seconds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tswd-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const stub = (name, body) => { fs.writeFileSync(path.join(bin, name), '#!/bin/sh\n' + body + '\n'); fs.chmodSync(path.join(bin, name), 0o755); };
  const calls = path.join(dir, 'calls').replace(/\\/g, '/');
  stub('am', `echo "am $*" >> "${calls}"`);
  stub('input', `echo "input $*" >> "${calls}"`);
  stub('dumpsys', 'echo "    mResumedActivity: ActivityRecord{1 u0 top.rootu.lampa/.MainActivity t1}"');
  stub('logcat', 'true');
  let C = path.join(dir, 'none').replace(/\\/g, '/');
  if (curl) { stub('curl', curl); C = path.join(bin, 'curl').replace(/\\/g, '/'); }
  const env = Object.assign({}, process.env, {
    PATH: bin + path.delimiter + process.env.PATH, C, L: path.join(dir, 'log').replace(/\\/g, '/'), P: path.join(dir, 'pid').replace(/\\/g, '/'),
    EVERY: '1', UP_WAIT: '0',
  });
  const r = spawnSync('sh', [script.replace(/\\/g, '/')], { env, timeout: seconds * 1000 });
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } };
  const out = { stopped: !r.error && r.status !== null, restarts: (read('calls').match(/am force-stop/g) || []).length, log: read('log') };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

let r = run(null, 4);
check('no curl → the watchdog stops by itself, TorrServe untouched', [r.stopped, r.restarts, /no .* to check with/.test(r.log)], [true, 0, true]);
r = run('echo MatriX.146', 4);
check('server answers → no restart', r.restarts, 0);
r = run('exit 7', 13);
// misses at 1 s and 2 s → restart (fails) → wait 2+2 → restart at ~6 s → wait 4+4 → next at ~14 s; every check would give 6
check('restarts that do not help are spaced out (2 in 13 s, not 6)', r.restarts >= 1 && r.restarts <= 2, true);
check('…and the log says when the next check is', /restart FAILED, next check in 4s/.test(r.log), true);
process.exitCode = failed ? 1 : 0;
