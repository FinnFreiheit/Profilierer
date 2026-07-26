#!/usr/bin/env bash
# Mehrere AFK-Laeufe hintereinander:  ./scripts/afk-loop.sh 3
# Exit-Codes von afk-once.sh: 0 = gemergt · 2 = vom Review-Agenten fuer
# menschliches Review geflaggt (PR bleibt offen, Loop macht weiter) ·
# 3 = Frontier leer (sauberes Ende) · sonst = Fehler (Abbruch).
set -euo pipefail
N="${1:-1}"
flagged=0
for i in $(seq 1 "$N"); do
  echo "==== AFK-Lauf $i/$N ===================================="
  rc=0
  "$(dirname "$0")/afk-once.sh" || rc=$?
  case "$rc" in
    0) ;;
    2) flagged=$((flagged + 1)) ;;
    3) echo "Frontier leer — Ende."; break ;;
    *) echo "Lauf $i gescheitert (Exit $rc) — Abbruch."; exit "$rc" ;;
  esac
done
if [ "$flagged" -gt 0 ]; then
  echo "$flagged PR(s) warten auf menschliches Review:"
  gh pr list --state open --json number,title --jq '.[] | "  #\(.number) \(.title)"'
fi
