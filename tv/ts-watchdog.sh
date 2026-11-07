#!/system/bin/sh
# TorrServer watchdog for the TV (runs as adb shell, lives until the TV reboots; after a reboot TorrServe starts its server itself).
# Why: once the torrserver process dies, the TorrServe app never starts it again (ServerFile.shellJob stays set, the app only
# shows "not loaded" hint) — Lampa cannot reach 127.0.0.1:8090 until the whole app is restarted.
# Start:  adb push tv/ts-watchdog.sh /data/local/tmp/ && adb shell 'setsid nohup sh /data/local/tmp/ts-watchdog.sh >/dev/null 2>&1 &'
# Log:    adb shell cat /data/local/tmp/ts-watchdog.log
# Test on the PC: node test/ts-watchdog.test.cjs (stand-ins for the Android commands; C/L/P/EVERY/UP_WAIT set by the test)
C=${C:-/data/local/tmp/curl}
L=${L:-/data/local/tmp/ts-watchdog.log}
P=${P:-/data/local/tmp/ts-watchdog.pid} # one watchdog at a time
APP=ru.yourok.torrserve
EVERY=${EVERY:-30}     # seconds between checks
UP_WAIT=${UP_WAIT:-20} # seconds the restarted server gets to answer
MAX_PAUSE=1800

alive() { [ -n "$($C -s -m 10 http://127.0.0.1:8090/echo)" ]; }
log() { echo "$(date '+%m-%d %H:%M:%S') $*" >> $L; }
front() { dumpsys activity activities | grep -m1 mResumedActivity | grep -oE '[A-Za-z0-9_.]+/[A-Za-z0-9_.$]+'; }
# without curl every check fails: the watchdog would kill a working server every minute — it stops instead
can_check() { [ -x "$C" ] || { log "no $C to check with — watchdog stops"; exit 1; }; }

old=$(cat $P 2>/dev/null)
[ -n "$old" ] && grep -q ts-watchdog /proc/$old/cmdline 2>/dev/null && kill "$old"
echo $$ > $P
can_check
log "watchdog $$ started"
miss=0
pause=$EVERY
while true; do
  sleep $pause
  can_check
  if alive; then miss=0; pause=$EVERY; continue; fi
  miss=$((miss + 1))
  [ $miss -lt 2 ] && continue
  miss=0
  was=$(front)
  log "server down (front: $was), recent kills:"
  logcat -d -v time -t 3000 | grep -iE 'lowmemorykiller|lmkd.*kill|torrserver|PhantomProcess' | tail -8 >> $L
  am force-stop $APP
  am start -n $APP/.ui.activities.main.MainActivity > /dev/null
  n=0
  while ! alive && [ $n -lt $UP_WAIT ]; do sleep 1; n=$((n + 1)); done
  # close TorrServe's window (Back finishes it) unless the viewer had it open themselves
  case "$was" in $APP/*) ;; *) case "$(front)" in $APP/*) input keyevent 4 ;; esac ;; esac
  if alive; then
    log "restarted in ${n}s, front now: $(front)"
    pause=$EVERY
  else
    # a restart that does not help is not repeated every minute (each one takes the screen): the wait doubles, up to 30 min
    pause=$((pause * 2)); [ $pause -gt $MAX_PAUSE ] && pause=$MAX_PAUSE
    log "restart FAILED, next check in ${pause}s"
  fi
done
