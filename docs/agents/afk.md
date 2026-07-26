# AFK-Queue

Unbeaufsichtigte Abarbeitung von Tickets nach dem ralph-once-Prinzip: **ein Lauf = ein Ticket = ein frischer Kontext.** Die Schleife liegt außen (Bash), nicht innen (Modell) — so bleibt jede Session klein.

## Ablauf eines Laufs (`scripts/afk-once.sh`)

1. **Frontier bestimmen:** ältestes offenes Issue mit Label `ready-for-agent`, ohne offene Blocker (native Issue-Dependencies) und ohne Assignee.
2. **Claim:** Assignee setzen — verhindert Doppel-Zugriff paralleler Läufe.
3. **Isolation:** eigener Git-Worktree unter `../profilierer-afk/issue-<n>` mit Branch `ticket/<n>` ab `origin/main`; eigene `node_modules`.
4. **Arbeit:** `claude -p` (headless, `acceptEdits`) arbeitet das Ticket testgetrieben ab und committet auf den Ticket-Branch. Pushen ist dem Agenten verwehrt (Hook).
5. **Verifikation durch den Runner:** Commit vorhanden + `npm run check` grün — sonst Abbruch, Ticket bleibt zugewiesen.
6. **Checkpoint:** Branch-Push, Pull Request (`Closes #<n>`), Kommentar am Issue.
7. **Review-Agent** (Matts Pipeline: Implementer → Reviewer → Merger): ein zweiter `claude -p`-Lauf mit **frischem Kontext** — er hat die Änderung nicht gebaut, sieht nur Ticket, Spec und Diff, läuft ohne Schreibrechte auf Opus. Befunde landen als PR-Kommentar; die letzte Zeile ist das Urteil: `VERDICT: MERGE` oder `VERDICT: HUMAN` (im Zweifel HUMAN).
8. **Merger:** nur bei `VERDICT: MERGE` **und** grünem CI merged der Runner per Rebase — das Issue schließt sich, Blocker-Kanten geben nachgelagerte Tickets frei. Geflaggte PRs bleiben offen und warten auf den Menschen; der Loop macht mit dem nächsten freien Ticket weiter. **Rotes CI stoppt den Loop.** `AFK_AUTO_MERGE=0` schaltet den Merger ganz ab (jeder PR wartet auf den Menschen, Review-Kommentar liegt trotzdem an).
9. Worktree wird entfernt.

Mehrere Läufe nacheinander: `./scripts/afk-loop.sh <anzahl>` — stoppt bei leerer Frontier oder beim ersten Fehler; geflaggte PRs werden am Ende aufgelistet. Durch den Merger arbeitet der Loop auch Ketten ab: erst wenn ein Blocker-Ticket gemergt ist, betritt sein Nachfolger die Frontier.

## Leitplanken

- **Hook** (`.claude/hooks/block-dangerous-git.sh`, aktiv via `.claude/settings.json`): blockiert Push nach `main`, Force-Push, `reset --hard`, `clean -f`, `branch -D`, `checkout .`/`restore .` sowie **Commits direkt auf `main`** — für jede Claude-Code-Session in diesem Repo, interaktiv wie headless.
- **Branch-Protection auf `main`** (GitHub): Pflicht-Statuscheck `check`, auch für Admins — `main` ändert sich nur noch über grüne PRs. Lokales `--ff-only`-Mergen bleibt möglich, sobald der Branch-SHA grün ist.
- **Allowlist** (`.claude/settings.json`): headless darf npm/Tests/Commits ohne Rückfrage; alles andere scheitert kontrolliert.

## Checkpoints nach rechts schieben

Reihenfolge der Vertrauensstufen:

1. Jeden PR selbst reviewen (`AFK_AUTO_MERGE=0`) — der Review-Kommentar des Agenten liegt als Vorarbeit an.
2. Nur lesen, was der Review-Agent mit `VERDICT: HUMAN` flaggt; `MERGE`-Urteile stichprobenartig nachprüfen („review how the AI reviews").
3. Den Stichproben-Anteil senken, wenn die Urteile über Wochen tragen.

**Aktueller Stand: Stufe 2** (Entscheidung 26.07.26, Matts Modell): vor `main` stehen zwei maschinelle Instanzen — Review-Agent mit frischem Kontext und CI. Der Mensch liest Geflaggtes und Stichproben.

## Härtung (bei Bedarf)

Der Worktree isoliert Git-Zustand, nicht das System — der headless-Agent läuft mit Benutzerrechten. Wer weiter gehen will: Läufe in Container sperren (Docker/Podman; Vorbild: Pococks Sandcastle) oder die Claude-Code-GitHub-App nutzen (`@claude`-Kommentar am Issue → Abarbeitung im Actions-Runner, PR als Ergebnis) — dann läuft nichts Unbeaufsichtigtes mehr auf dem eigenen Rechner.
