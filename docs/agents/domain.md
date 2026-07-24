# Domain-Docs

Wie die Engineering-Skills die Domänen-Dokumentation dieses Repos beim Explorieren konsumieren.

## Vor dem Explorieren lesen

- **`CONTEXT.md`** an der Repo-Wurzel — existiert noch nicht; sie entsteht lazy über `/domain-modeling` (erreicht via `/grill-with-docs` und `/improve-codebase-architecture`), sobald Begriffe oder Entscheidungen tatsächlich geklärt werden. Fehlen **stillschweigend hinnehmen** — nicht anmerken, nicht vorab anlegen.
- **`docs/adr/`** — die ADRs lesen, die den Arbeitsbereich berühren (Index: `docs/adr/README.md`).
- **Übergangsweise** übernimmt [`docs/glossary.md`](../glossary.md) die Glossar-Rolle: Baum-/Darstellungsbegriffe und ERV-/XJustiz-Fachbegriffe. Bis ein `CONTEXT.md` existiert, gilt dessen Vokabular.

## Struktur (Single-Context)

```
/
├── CONTEXT.md            ← entsteht lazy
├── docs/
│   ├── glossary.md       ← bestehendes Glossar (Übergangs-Vokabular)
│   └── adr/              ← Architektur-Entscheidungen, fortlaufend nummeriert
└── src/
```

## Glossar-Vokabular verwenden

Wenn ein Arbeitsergebnis einen Domänenbegriff nennt (Issue-Titel, Refactoring-Vorschlag, Hypothese, Testname), den Begriff so verwenden, wie das Glossar ihn definiert — nicht auf Synonyme ausweichen, die das Glossar meidet (z. B. „Ausprägung", nicht „Instanz"; „Disposition"/„Statusstufe" gemäß Glossar).

Fehlt ein benötigter Begriff im Glossar, ist das ein Signal: entweder erfindet man gerade Sprache, die das Projekt nicht benutzt (überdenken), oder es gibt eine echte Lücke (für `/domain-modeling` notieren).

## ADR-Widersprüche kennzeichnen

Widerspricht ein Arbeitsergebnis einer bestehenden ADR, das explizit machen statt still zu übergehen:

> _Widerspricht ADR-0002 (Signals-Store) — aber neu aufzurollen, weil …_
