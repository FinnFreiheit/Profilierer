# Workflow: Von der Idee bis main

Spickzettel für die Arbeit an diesem Projekt — was ich (Finn) tue, was die Agenten tun, und in welcher Reihenfolge. Bei Unsicherheit hier nachsehen. Technische Details: [AFK-Queue](agents/afk.md), [Issue-Tracker](agents/issue-tracker.md), [Beitragen](contributing.md).

## Das Prinzip

Ich entscheide, **was** gebaut wird (Grilling), gebe den **Schnitt** frei (Tickets), drücke den **Knopf** (Loop) und urteile über das, was die Maschine **nicht selbst verantworten wollte** (Ernte). Alles dazwischen ist Infrastruktur.

Kontext-Regel dahinter: jede Agenten-Session bleibt klein (ein Ticket, frischer Kontext) — deshalb wird vorn sauber geschnitten statt hinten lang gearbeitet.

## Der Zyklus pro Vorhaben

| #   | Schritt                     | Mein Anteil                                                           | Aufwand   |
| --- | --------------------------- | --------------------------------------------------------------------- | --------- |
| 1   | `/grill-me <Problem>`       | Fragen beantworten — mein Fachwissen ist der Engpass; diktieren hilft | 15–45 min |
| 2   | `/to-spec`                  | Test-Nähte bestätigen, Spec querlesen                                 | 5 min     |
| 3   | `/to-tickets`               | Aufteilung und Blocking-Kanten freigeben                              | 5 min     |
| 4   | `./scripts/afk-loop.sh <n>` | starten und weggehen                                                  | 1 min     |
| 5   | Ernte (siehe unten)         | Geflaggtes entscheiden, Stichprobe, Demo klicken                      | 10–30 min |

Die Spec landet in `docs/user-stories/`, die Tickets in GitHub Issues (Label `ready-for-agent`, Blocking-Kanten nativ). Der Loop arbeitet die Frontier ab: älteste freie Tickets zuerst, Blocker-Ketten in Reihenfolge.

**Kleinigkeiten** (Tippfehler, Mini-Bugs) brauchen die Kette nicht: direkt ein Issue schreiben, `ready-for-agent`-Label dran — der nächste Loop nimmt es mit. Das Label ist mein Freigabe-Schalter.

## Die Ernte (nach jedem Loop)

```
gh pr list --state open
gh issue list --state open
```

1. **Geflaggte PRs** (`VERDICT: HUMAN`): Review-Kommentar des Agenten lesen — er sagt, warum er sich nicht getraut hat. Dann: mergen, nacharbeiten lassen (Kommentar ins Issue, Assignee entfernen, Label wieder dran) oder PR schließen.
2. **Gemergte PRs** (`VERDICT: MERGE`): stichprobenartig nachlesen — nicht ob der Code gefällt, sondern ob das **Review-Urteil getragen hat**. Ich prüfe den Prüfer.
3. **Demo klicken:** die App starten und das im Ticket genannte Demo-Kriterium ausprobieren.

## Vertrauensleiter

Aktuell **Stufe 2** (26.07.26): vor `main` stehen Review-Agent (frischer Kontext, Opus) und CI; ich lese Geflaggtes und Stichproben.

- Tragen die `MERGE`-Urteile über Wochen → Stichproben-Anteil senken.
- Lag ein Urteil daneben → Review-Prompt in `scripts/afk-once.sh` nachschärfen. Der Prompt ist Text, kein Framework — das ist die eigentliche Stellschraube.
- Rückweg jederzeit: `AFK_AUTO_MERGE=0 ./scripts/afk-loop.sh <n>` — dann wartet jeder PR auf mich, Review-Kommentar liegt trotzdem an.

## Was ich nicht mehr tue

- Code schreiben für `ready-for-agent`-Tickets
- laufende Agenten-Sessions babysitten
- grüne, unauffällige PRs von Hand mergen
- Aufgaben außerhalb des Trackers sammeln

## Leitplanken (zur Erinnerung)

- `main` ist geschützt: nur PRs mit grünem CI, gilt auch für Admins.
- Der Git-Hook blockt in jeder Claude-Session: Push nach main, Force-Push, Destruktives, Commits auf main.
- Vor jedem eigenen Push: `npm run check` — dieselbe Kette wie CI.

## Gelegentliche Pflege

- Unlabelte Issues durchsehen (Eingangskorb leeren): behalten und labeln, oder schließen.
- `/improve-codebase-architecture` alle paar Tage laufen lassen (Empfehlung Pocock).
- Skill-Updates: `npx skills@latest update` — danach Diff der `.claude/skills/` ansehen.
