# ADR 0011: Node-Pinning, ESLint/Prettier und CI als Qualitäts-Tor

- Status: Angenommen
- Datum: 26.07.24

## Kontext

Die Konventionen des Projekts (idiomatisches Angular 20, `noUncheckedIndexedAccess`, neue Referenzen bei Store-Mutationen, unveränderliche CSS-Klassen für die SVG-Vermessung) standen ausschließlich als Prosa in [CLAUDE.md](../../CLAUDE.md) und [contributing.md](../contributing.md). Nichts hat sie durchgesetzt.

Konkret:

- **Prettier** war in `package.json` konfiguriert, aber nicht installiert — die Konfiguration lief ins Leere.
- **Kein ESLint**, also keine Prüfung auf ungenutzte Variablen, `any`, `prefer-const` oder Angular-Regeln.
- **Kein CI.** 288 Frontend- und 38 Backend-Tests existierten, aber nichts erzwang ihren Lauf.
- **Node-Version** musste vor jedem Befehl von Hand aktiviert werden (siehe [ADR 0005](0005-node24-headless-tests.md)) — Reibung in jeder Session, für Menschen wie für Coding-Agenten.

Der letzte Punkt wiegt für die Arbeit mit KI-Assistenz schwerer, als er aussieht: ein Agent, der die Beschwörungsformel vergisst, bekommt einen Angular-Fehler, der nicht nach „falsche Node-Version" aussieht, und verbrennt Kontext beim Debuggen eines Scheinproblems. Fehlende Werkzeuge sind fehlende Rückkopplung — und ohne Rückkopplung kann weder Mensch noch Agent Konventionen einhalten, die nur in Prosa existieren.

## Entscheidung

**Node-Version deklarativ festlegen.** `.nvmrc` (Inhalt `24`) und `engines: { "node": ">=22.12" }` in der `package.json`; der nvm-Standard des Entwicklungsrechners steht auf 24. Damit bekommt jede neue Shell die richtige Version ohne Zutun, `nvm use` ohne Argument genügt im Notfall, und CI liest dieselbe Datei über `node-version-file: .nvmrc`. Die manuelle Aktivierung aus ADR 0005 entfällt.

**ESLint 9 (Flat Config) mit angular-eslint 20** in `eslint.config.mjs`. Formatierung bleibt Sache von Prettier; `eslint-config-prettier` schaltet die kollidierenden Stilregeln zuletzt ab. Ausgenommen vom Lauf: `dist/`, `.angular/`, `legacy/`, `public/schemas/`, `deploy/`.

**Prettier über den gesamten Bestand.** 96 Dateien wurden einmalig durchformatiert, damit `format:check` im CI überhaupt grün sein kann. Die Konfiguration (`printWidth: 100`, `singleQuote`) blieb unverändert — sie stand ja bereits in der `package.json`.

**Barrierefreiheits-Regeln als Warnung, nicht als Fehler.** Der erste Lauf ergab 76 Befunde, davon 68 aus `templateAccessibility`: Klick-Handler auf `div`/`span` ohne Tastatur-Äquivalent, Labels ohne Formularbezug. Diese drei Regeln stehen auf `warn`. Ein CI, das ab Tag eins an Altlast scheitert, wird ignoriert — und die Behebung ist eigene fachliche Arbeit, nicht Teil eines Werkzeug-Setups.

**Die acht echten Befunde wurden behoben:** zwei `prefer-const`, ein ungenutzter `catch`-Parameter, ein überflüssiges Escape im `ERW_NAME_MUSTER`, `structuredClone` als bekanntes Global im Backend-Kontext. Die drei `any` in `PersistenceService.migrateV1` bleiben mit gezieltem `eslint-disable` und Begründung stehen — die Eingabe ist eine ungetypte v1-JSON-Struktur, die es als Interface nie gab.

**GitHub Actions** (`.github/workflows/ci.yml`) fährt bei Push auf `main` und bei jedem Pull Request: Lint, Formatprüfung, Frontend-Tests headless, Backend-Tests, Build. Chrome for Testing wird explizit installiert, weil npm 11 Install-Skripte — und damit puppeteers Postinstall — nicht mehr automatisch ausführt.

**`npm run check`** bündelt dieselbe Kette lokal, damit sich vor dem Push reproduzieren lässt, was CI tun wird.

## Konsequenzen

- **Positiv:** Konventionen werden geprüft statt beschrieben. Ein Agent bekommt zum ersten Mal eine objektive Instanz außer dem Menschen, der den Diff liest. Die Node-Version ist eine einzige Quelle für Rechner und CI.
- **Positiv:** `npm run check` ist der eine Befehl, den Mensch und Agent vor dem Commit fahren.
- **Negativ:** Der einmalige Prettier-Lauf über 96 Dateien verrauscht `git blame` für genau einen Commit.
- **Negativ:** Angular-Templates sind formatierungssensitiv (`htmlWhitespaceSensitivity: css`). Der Lauf war unauffällig und alle Tests blieben grün, aber rein visuelle Abweichungen fangen Unit-Tests nicht — dafür bleibt der `verify`-Skill.
- **Folgeaufgabe:** Die 68 Barrierefreiheits-Warnungen abarbeiten und die drei Regeln danach auf `error` hochziehen.
- **Folgeaufgabe:** Ein Pre-Commit-Hook könnte `lint` und `format:check` vorziehen, damit CI nicht die erste Instanz ist, die es merkt.
