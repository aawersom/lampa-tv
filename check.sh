#!/bin/sh
# Gate before a push: a push to GitHub is the deploy to the TV (Lampa loads the plugins by URL at its next start).
# 1) every plugin parses; 2) every test passes. Stops with a non-zero exit and names what failed.
cd "$(dirname "$0")" || exit 1
fail=0
for f in *.js; do
  node --check "$f" || { echo "SYNTAX  $f"; fail=1; }
done
[ "$fail" = 0 ] || { echo "check.sh: syntax errors — nothing else was run"; exit 1; }
total=0
for f in test/*.cjs; do
  out=$(node "$f" 2>&1); code=$?
  n=$(printf '%s\n' "$out" | grep -c '^ok ')
  total=$((total + n))
  # a test that printed no check at all did not run to its end (an async test whose promise never settled exits 0)
  if [ "$code" != 0 ] || [ "$n" = 0 ] || printf '%s\n' "$out" | grep -q '^FAIL'; then
    echo "FAILED  $f (exit $code, $n checks)"
    printf '%s\n' "$out" | grep -v '^ok ' | head -20
    fail=1
  fi
done
if [ "$fail" = 0 ]; then echo "check.sh: all green - $total checks in $(ls test/*.cjs | wc -l | tr -d ' ') files"; else echo "check.sh: FAILED"; fi
exit "$fail"
