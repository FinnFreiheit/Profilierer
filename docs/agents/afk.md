# AFK-Queue

Unbeaufsichtigte Abarbeitung von Tickets nach dem ralph-once-Prinzip: **ein Lauf = ein Ticket = ein frischer Kontext.** Die Schleife liegt außen (Bash), nicht innen (Modell) — so bleibt jede Session klein.

## Ablauf eines Laufs (`scripts/afk-once.sh`)

1. **Frontier bestimmen:** ältestes offenes Issue mit Label `ready-for-agent`, ohne offene Blocker (native Issue-Dependencies) und ohne Assignee.
2. **Claim:** Assignee setzen — verhindert Doppel-Zugriff paralleler Läufe.
3. **Isolation:** eigener Git-Worktree unter `../profilierer-afk/issue-<n>` mit Branch `ticket/<n>` ab `origin/main`; eigene `node_modules`.
4. **Arbeit:** `claude -p` (headless, `acceptEdits`) arbeitet das Ticket testgetrieben ab und committet auf den Ticket-Branch. Pushen ist dem Agenten verwehrt (Hook).
5. **Verifikation durch den Runner:** Commit vorhanden + `npm run check` grün — sonst Abbruch, Ticket bleibt zugewiesen.
6. **Checkpoint:** Branch-Push, Pull Request (`Closes #<n>`), Kommentar am Issue. **Der PR ist die Stelle, an der der Mensch eingreift** — Review, dann Merge.
7. Worktree wird entfernt.

Mehrere Läufe nacheinander: `./scripts/afk-loop.sh <anzahl>` — stoppt bei leerer Frontier, bricht beim ersten Fehlschlag ab.

## Leitplanken

- **Hook** (`.claude/hooks/block-dangerous-git.sh`, aktiv via `.claude/settings.json`): blockiert Push nach `main`, Force-Push, `reset --hard`, `clean -f`, `branch -D`, `checkout .`/`restore .` sowie **Commits direkt auf `main`** — für jede Claude-Code-Session in diesem Repo, interaktiv wie headless.
- **Branch-Protection auf `main`** (GitHub): Pflicht-Statuscheck `check`, auch für Admins — `main` ändert sich nur noch über grüne PRs. Lokales `--ff-only`-Mergen bleibt möglich, sobald der Branch-SHA grün ist.
- **Allowlist** (`.claude/settings.json`): headless darf npm/Tests/Commits ohne Rückfrage; alles andere scheitert kontrolliert.

## Checkpoints nach rechts schieben

Reihenfolge der Vertrauensstufen — erst wechseln, wenn die vorherige Stufe eine Weile fehlerfrei lief:

1. Jeden PR selbst reviewen (Start hier).
2. Agent flaggt im PR, ob menschliches Review nötig ist; nur Geflaggtes lesen.
3. Risikoarme PRs automatisch mergen lassen; stichprobenartig prüfen, _wie_ reviewt wurde.

## Härtung (bei Bedarf)

Der Worktree isoliert Git-Zustand, nicht das System — der headless-Agent läuft mit Benutzerrechten. Wer weiter gehen will: Läufe in Container sperren (Docker/Podman; Vorbild: Pococks Sandcastle) oder die Claude-Code-GitHub-App nutzen (`@claude`-Kommentar am Issue → Abarbeitung im Actions-Runner, PR als Ergebnis) — dann läuft nichts Unbeaufsichtigtes mehr auf dem eigenen Rechner.
