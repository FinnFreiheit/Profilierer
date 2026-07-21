# US: Schema ansehen

Status: umgesetzt (26.07.21) · Typ: einzelne Story

## Story

> **Als** Anwender **möchte ich** mir ein XJustiz-Schema (eine Nachricht) einfach nur
> ansehen und nach Elementen suchen — ohne eine Testnachricht zu erstellen oder eine
> Profilierung anzulegen — **damit ich** mir schnell einen Überblick über den Aufbau des
> Schemas verschaffe.

Abgrenzung zum Epic [XJustiz-Nachricht inspizieren](xjustiz-nachricht-inspizieren.md):
Dort geht es um eine konkrete, mit Werten belegte **Instanz** (importierte Nachricht);
hier um den **Standard selbst** (leeres Schema) — reine Struktursicht, keine Inhalte.

## Akzeptanzkriterien

- Vom Dashboard führt ein eigener Einstieg **„Schema ansehen"** direkt in den Baum-Editor,
  ohne dass ein Profil angelegt oder geöffnet wird.
- Es entsteht **kein Bibliothekseintrag** und es läuft **kein Autosave**
  (`activeProfileId` bleibt `null`); auch die Nachrichtenwahl belegt **keine
  Pflicht-Status** vor (kein `prefillMandatoryStatus`).
- Die Ansicht ist **gesperrt** (`readOnly`): keine Profilier-Bedienelemente
  (Status, Kardinalität, Ausblenden, Duplizieren, Ausprägungen, Werte), keine
  Speicher-/Export-Aktionen außer Drucken. Der Umschalter „Nur betrachten" sowie
  „nur Profil"/„nur Werte" sind ausgeblendet; stattdessen zeigt die Toolbar den
  Hinweis **„Schema-Ansicht"**.
- **Betrachten und Suchen funktionieren vollständig:** Nachricht wählen, Kästen
  auf-/zuklappen, Fokus/Technik/Verweise, Detailpanel (read-only), Breadcrumbs,
  Suche mit Sprung zum Treffer, Versionsumschalter und Diff-Vergleich.
- Der Modus **endet** mit der Rückkehr zur Übersicht bzw. mit jedem Profil-Einstieg
  (Neues Profil, Öffnen, Import, Nachrichten-Import, Testnachricht-Erstellung).

## Umsetzung (Orientierung)

- Modus-Signal `schemaView` im `StateService` (impliziert `readOnly`; wird von
  `loadProfile` beendet und von `loadMessage` innerhalb des Modus wiederhergestellt).
- Einstieg `NavService.openSchemaView()` (Dashboard-Button „Schema ansehen").
- `MessagePicker.select` überspringt im Modus die Pflicht-Vorbelegung.
- Tests: `src/app/core/services/nav.service.spec.ts`.
