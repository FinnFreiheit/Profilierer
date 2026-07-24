#!/usr/bin/env bash
# Mehrere AFK-Laeufe hintereinander:  ./scripts/afk-loop.sh 3
# Stoppt sauber, wenn die Frontier leer ist (Exit 3 von afk-once.sh),
# und bricht beim ersten gescheiterten Lauf ab.
set -euo pipefail
N="${1:-1}"
for i in $(seq 1 "$N"); do
  echo "==== AFK-Lauf $i/$N ===================================="
  rc=0
  "$(dirname "$0")/afk-once.sh" || rc=$?
  if [ "$rc" = "3" ]; then echo "Frontier leer — Ende."; exit 0; fi
  if [ "$rc" != "0" ]; then echo "Lauf $i gescheitert (Exit $rc) — Abbruch."; exit "$rc"; fi
done
