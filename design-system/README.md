# Design-System-Spiegel

Generiertes Bundle der UI-Bausteine für das Claude-Design-Projekt **„XJustiz Pfadfinder"** (Typ Design-System). Nicht von Hand pflegen — siehe [ADR 0022](../docs/adr/0022-design-system-spiegel.md).

- Quelle: die Ansicht `?ansicht=styleguide` der App (`src/app/features/styleguide/`).
- Erzeugen: `npm run build && npm run design:bundle` (oder `-- --url http://localhost:4200` gegen den Dev-Server; `-- --inline` bettet das CSS je Karte ein).
- Inhalt: `<gruppe>/<karte>.html` (erste Zeile `<!-- @dsCard group="…" name="…" -->`), `_shared/styles.css` (kompiliertes Stylesheet), `_karten.json` (Kartenliste für `register_assets`).
- Sync: DesignSync-Tool in Claude Code — `finalize_plan` (writes `**/*.html`, `_shared/styles.css`, `_karten.json`; `localDir` = dieses Verzeichnis) → `write_files` mit `localPath`.
- Beschreibung des Systems: `design.md` an der Repo-Wurzel (Tokens + Komponenten, wird mit hochgeladen).
- Projekt-Id: `180abd18-1544-46b8-877d-74c2f30f780c` (https://claude.ai/design/p/180abd18-1544-46b8-877d-74c2f30f780c).

Rückweg: eine in Claude Design geänderte Karte per `get_file` lesen, gegen die lokale Datei vergleichen, die Änderung nach `src/styles.scss` portieren (Token zuerst, dann Klasse), Bundle neu erzeugen, erneut syncen.
