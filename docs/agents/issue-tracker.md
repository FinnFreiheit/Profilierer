# Issue-Tracker: GitHub

Issues und Specs dieses Repos leben in den GitHub Issues. Alle Operationen über die `gh`-CLI; das Repo ergibt sich aus `git remote -v` (`gh` erkennt es im Clone automatisch).

## Konventionen

- **Issue anlegen**: `gh issue create --title "..." --body "..."` — mehrzeilige Bodies per Heredoc.
- **Issue lesen**: `gh issue view <nummer> --comments`, Labels mitladen.
- **Issues auflisten**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` — mit `--label`/`--state` filtern.
- **Kommentieren**: `gh issue comment <nummer> --body "..."`
- **Labels setzen/entfernen**: `gh issue edit <nummer> --add-label "..."` / `--remove-label "..."`
- **Schließen**: `gh issue close <nummer> --comment "..."`

Das Triage-Label `ready-for-agent` existiert im Repo und markiert Tickets, die eindeutig genug für unbeaufsichtigte Abarbeitung sind.

## Pull Requests als Triage-Fläche

**PRs als Anfrage-Fläche: nein.** _(Auf `yes` setzen, falls externe PRs künftig als Feature-Anfragen behandelt werden sollen; `/triage` liest dieses Flag.)_

Bei `yes` laufen PRs durch dieselben Labels und Zustände wie Issues, mit den `gh pr`-Pendants (`gh pr view <n> --comments`, `gh pr diff <n>`, `gh pr comment`, `gh pr edit --add-label`, `gh pr close`). GitHub teilt einen Nummernraum für Issues und PRs — ein nacktes `#42` per `gh pr view 42` auflösen, Fallback `gh issue view 42`.

## Wenn ein Skill sagt „publish to the issue tracker"

Ein GitHub-Issue anlegen.

## Wenn ein Skill sagt „fetch the relevant ticket"

`gh issue view <nummer> --comments` ausführen.

## Blocking-Kanten

GitHubs **native Issue-Dependencies** sind die kanonische, in der Oberfläche sichtbare Darstellung:

- Kante anlegen: `gh api --method POST repos/<owner>/<repo>/issues/<kind>/dependencies/blocked_by -F issue_id=<blocker-db-id>` — `<blocker-db-id>` ist die numerische **Datenbank-ID** des Blockers (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`), **nicht** die `#nummer` und nicht die `node_id`.
- Offene Blocker meldet `issue_dependencies_summary.blocked_by` (nur offene — das lebende Tor).
- Wo Dependencies nicht verfügbar sind: Fallback-Zeile `Blocked by: #<n>, #<n>` am Anfang des Bodies.
- Ein Ticket ist frei, sobald jeder Blocker geschlossen ist.

## Wayfinding-Operationen

Nur relevant, falls `/wayfinder` genutzt wird. Die **Karte** ist ein Issue mit Label `wayfinder:map` (Notes / Decisions-so-far / Fog im Body); Kind-Tickets sind GitHub-Sub-Issues mit Labels `wayfinder:<typ>` (`research`/`prototype`/`grilling`/`task`). Frontier: offene Kinder ohne offene Blocker und ohne Assignee, erstes in Kartenreihenfolge. Claim per `gh issue edit <n> --add-assignee @me`; Auflösen per Kommentar + Schließen + Kontext-Zeiger in den Decisions-so-far der Karte.
