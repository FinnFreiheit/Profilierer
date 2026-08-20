import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { RolleBadge } from '../../shared/rolle-badge/rolle-badge';

/** Ein Schritt der Anleitung: Fliesstext, Bild, optionaler Merksatz. */
interface Schritt {
  /** Fortlaufende Nummer innerhalb des Teils; zugleich Teil der Sprungmarke. */
  nr: number;
  titel: string;
  /** Absaetze des Fliesstexts — bewusst reiner Text, kein gebundenes HTML. */
  text: string[];
  /** Bildname unter `public/howto/` — ohne Pfad und Endung. */
  bild: string;
  /** Bildunterschrift; sagt, worauf im Bild zu achten ist. */
  bildText: string;
  /** Hervorgehobener Merksatz unter dem Schritt. */
  merke?: string;
}

interface Teil {
  id: 'profil' | 'testnachricht';
  titel: string;
  einleitung: string;
  schritte: Schritt[];
}

/**
 * Anleitung (How-To): bebilderter Weg durch die beiden Kernablaeufe —
 * Profilierung anlegen und Testnachricht daraus erstellen.
 *
 * Die Bilder liegen als WebP unter `public/howto/` und sind mit Puppeteer an
 * der laufenden App aufgenommen. Werden sie neu aufgenommen, bleiben die
 * Dateinamen gleich, damit hier nichts nachzuziehen ist.
 */
@Component({
  selector: 'app-howto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RolleBadge],
  templateUrl: './howto.html',
})
export class Howto {
  private readonly state = inject(StateService);

  /** Grossansicht eines Bildes (Klick aufs Bild) — null = geschlossen. */
  protected readonly lupe = signal<string | null>(null);

  protected readonly teile: Teil[] = [
    {
      id: 'profil',
      titel: 'Teil 1 — Profilierung erstellen',
      einleitung:
        'Eine Profilierung grenzt den XJustiz-Standard auf ein Kommunikationsszenario ein: Was ist ' +
        'zwingend, was entfällt, welche Codes sind zulässig. Ergebnis ist ein abgestimmtes Dokument — ' +
        'ausgebbar als Excel, Schematron und Beispiel-XML — und die Grundlage jeder gebundenen Testnachricht.',
      schritte: [
        {
          nr: 1,
          titel: 'Profilierung anlegen',
          text: [
            'Die Startseite „Profile" ist die Bibliothek aller Profilierungen, nach Fachmodul gruppiert. Jede ' +
              'Kachel nennt Nachrichtentyp, Fortschritt und — sofern vorhanden — Freigabe und offene Hinweise.',
            '„+ Neues Profil" legt einen Eintrag an und öffnet den Baum-Editor. Der Eintrag steht ab sofort in ' +
              'der Bibliothek; ein gesondertes erstes Speichern ist nicht nötig.',
          ],
          bild: '01-profil-uebersicht',
          bildText:
            'Bibliothek der Profilierungen. Links oben der Umschalter zwischen Profilen, Testdaten und dieser Anleitung.',
        },
        {
          nr: 2,
          titel: 'Nachricht wählen',
          text: [
            'Im Editor öffnet „Nachricht wählen" die Liste aller Nachrichtentypen der geladenen XJustiz-Version, ' +
              'gruppiert nach Fachmodul und durchsuchbar nach Name und Beschreibung.',
            'Die Schemaversion steht rechts in der Werkzeugleiste (beim Start 3.6.2) und lässt sich dort wechseln. ' +
              'Im Feld „Szenario" oben wird die Profilierung benannt — dieser Name steht später auf der Kachel.',
          ],
          bild: '02-nachricht-waehlen',
          bildText:
            'Nachrichtenauswahl mit Suchfeld. Unter dem technischen Namen steht die Beschreibung aus dem Schema.',
        },
        {
          nr: 3,
          titel: 'Geführt entscheiden',
          text: [
            'Der Baum stellt die Nachricht als Kasten-Kaskade von links nach rechts dar. Im Modus „Geführt" ' +
              'führt der Detailbereich rechts von Entscheidungspunkt zu Entscheidungspunkt; oben rechts steht ' +
              'der Stand („x von y entschieden").',
            'Je Element wird eine der vier Stufen gesetzt: zwingend, anzugeben wenn vorhanden, nicht verwendet, ' +
              'zu klären. Die Stufen sind je Profil frei konfigurierbar (Knopf „Status…": Name, Farbe, Wirkung); ' +
              'die Wirkung steuert, was in Schematron und Beispiel-XML landet.',
            'Schneller geht es mit der Tastatur: z = zwingend, o = optional, n = nicht verwendet, k = zu klären. ' +
              'Die Pfeiltasten navigieren, „Nächster offener" springt zum nächsten unerledigten Punkt.',
          ],
          bild: '03-gefuehrt-entscheiden',
          bildText:
            'Baum links, geführte Entscheidung rechts. Der farbige Streifen am Kasten zeigt die gesetzte Stufe, ' +
            'das Kennzeichen „offen" die noch unerledigten Punkte.',
          merke:
            'Ein Element ohne Entscheidung bleibt „offen". Das ist kein Fehler — im Durchlauf einer Testnachricht ' +
            'erscheint es dann aber als „nicht profiliert" und folgt allein der Schema-Semantik.',
        },
        {
          nr: 4,
          titel: 'Festlegungen im Detailbereich',
          text: [
            'Unter der Statuswahl liegen die übrigen Festlegungen des ausgewählten Elements.',
            'Kardinalität im Szenario — der Standard lässt sich eingrenzen, etwa „beliebig viele" auf „genau 1". ' +
              'Leere Felder heißen: es gilt das Schema.',
            'Beispielwert — konkreter Wert für die Beispiel-XML; er wird später im Durchlauf als Vorschlag angeboten. ' +
              'Fachliche Anmerkung — Ausfüllhinweis oder juristische Erläuterung; sie erscheint im Durchlauf als ' +
              'Hilfetext. Hinweise — Rückmeldungen aus der Abstimmung; sie stehen im Excel-Export, nie im XML.',
            'Bei Codelisten kommt hier die Auswahl der zulässigen Codes hinzu. Externe Listen (Code-Typ 3) werden ' +
              'über „Codelisten: XRepository" oder aus einer Genericode-Datei geladen.',
          ],
          bild: '04-detailbereich',
          bildText:
            'Detailbereich einer Auswahl (xs:choice): oben die zulässigen Alternativen, darunter Stufe, ' +
            'Kardinalität, Beispielwert und die Beschreibung aus dem Schema.',
        },
        {
          nr: 5,
          titel: 'Ausprägungen benennen',
          text: [
            'Wiederholbare Elemente bekommen benannte Fälle — die Ausprägungen. Typisch: beteiligung wird zu ' +
              '„Notar/in" und „Betroffene Person", jede mit eigener Unter-Profilierung.',
            'Der Knopf ⧉ am Kasten teilt ein wiederholbares Element in zwei Fälle (bestehende Festlegungen wandern ' +
              'in den ersten). Danach werden die Fälle im Detailbereich benannt; der Kasten „+ Ausprägung" im Baum ' +
              'legt weitere an.',
            'Jede Ausprägung erscheint als eigener Kasten und wird separat durchprofiliert. Verweis-Elemente ' +
              '(Rollennummer, Beteiligtennummer …) lassen sich auf eine konkrete Ausprägung richten — der Verweis ' +
              'wird als rosa gestrichelte Linie durch den Baum gezeichnet.',
          ],
          bild: '05-auspraegungen',
          bildText:
            'Beteiligung mit zwei Ausprägungen: rechts die Liste zum Umbenennen, im Baum je ein eigener Kasten.',
        },
        {
          nr: 6,
          titel: 'Speichern und ausgeben',
          text: [
            '„Speichern" legt den Stand in der Bibliothek ab; unabhängig davon sichert der Autosave laufend ' +
              '(„automatisch gesichert HH:MM" unten links).',
            'Das Menü „Profil" führt die Ausgaben: Excel (Struktur mit Status-, Kardinalitäts- und Wertespalten, ' +
              'Deckblatt mit Statuslegende), Schematron (.sch-Regeln zusätzlich zur XSD-Validierung), Beispiel-XML ' +
              '(Entwurf einer Nachricht aus dem Profil) und Drucken (Dokumentansicht, auch als PDF).',
            'Über „Versionen…" wird ein Stand als nummerierte Version eingefroren. Genau solche Fassungen lassen ' +
              'sich später an eine Testnachricht binden.',
          ],
          bild: '06-exporte',
          bildText: 'Menü „Profil" mit Excel, Schematron, Beispiel-XML und Drucken.',
        },
      ],
    },
    {
      id: 'testnachricht',
      titel: 'Teil 2 — Testnachricht erstellen',
      einleitung:
        'Von der Profilierung zur Testnachricht führt genau ein Weg: der geführte Durchlauf mit Bindung. Die ' +
        'Nachricht wird an eine Fassung der Profilierung gebunden; diese Fassung wirkt als Leitplanke und ändert ' +
        'sich nicht mehr, wenn die Profilierung weiterentwickelt wird.',
      schritte: [
        {
          nr: 1,
          titel: 'Testdaten-Speicher öffnen',
          text: [
            'Der Testdaten-Speicher ist der zentrale Ablageort aller XJustiz-Testnachrichten, nach Fachmodul ' +
              'geordnet. Erreichbar ist er über den Umschalter oben links.',
            '„Neue Testnachricht erstellen…" startet den Durchlauf. Derselbe Ablauf startet auch direkt an einer ' +
              'Profil-Kachel über deren ⋯-Menü („Testnachricht erstellen…").',
          ],
          bild: '07-testdaten-speicher',
          bildText:
            'Testdaten-Speicher. Die Auswahlliste „alle Profilierungen" grenzt auf die Testdaten eines Szenarios ein.',
        },
        {
          nr: 2,
          titel: 'Herkunft wählen',
          text: [
            '„aus Schema" befüllt frei nach Standard — XJustiz-Version und Nachricht werden abgefragt.',
            '„aus Profilierung" bindet die Nachricht an ein Szenario. Version und Nachrichtentyp entfallen als ' +
              'Frage: beides steht im Profil.',
          ],
          bild: '08-herkunft-waehlen',
          bildText: 'Beide Wege münden in denselben geführten Durchlauf im Baum-Editor.',
        },
        {
          nr: 3,
          titel: 'Profilierung wählen',
          text: [
            'Schritt 1 von 2: Die Liste führt alle Profilierungen mit Nachrichtentyp, dazu XJustiz-Version und ' +
              'Freigabe-Kennzeichen.',
            'Profilierungen mit Schema-Erweiterungen sind gesperrt — aus einem Schema, das es so nicht gibt, lässt ' +
              'sich keine valide Nachricht erzeugen.',
          ],
          bild: '09-profil-waehlen',
          bildText: 'Auswahl der Profilierung; die Pille nennt die XJustiz-Version.',
        },
        {
          nr: 4,
          titel: 'Fassung binden',
          text: [
            'Schritt 2 von 2: Gewählt wird die Fassung — der Arbeitsstand oder eine nummerierte Version. Bei ' +
              'freigegebenen Profilierungen ist die Freigabe-Fassung vorbelegt.',
            'Die Fassung wird als eingefrorene Kopie an der Testnachricht gespeichert. Sie ändert sich nicht mehr, ' +
              'auch wenn die Profilierung später weiterentwickelt oder gelöscht wird.',
          ],
          bild: '10-fassung-binden',
          bildText: 'Wahl der zu bindenden Fassung; „Durchlauf starten" öffnet den Baum-Editor.',
          merke:
            'Nachgezogen wird nichts. Weicht die Profilierung später von der gebundenen Fassung ab, trägt die ' +
            'Kachel das Kennzeichen „Profil weiterentwickelt" — wer den neuen Stand testen will, erstellt eine ' +
            'neue Nachricht.',
        },
        {
          nr: 5,
          titel: 'Durchlauf beginnen',
          text: [
            'Der Durchlauf führt Station für Station durch die Nachricht. Oben rechts steht der Stand („x von y ' +
              'Pflichtangaben"), im Kopf links „Neue Testnachricht".',
            'Die Profilierung wirkt als Leitplanke: Was sie auf „nicht verwendet" gesetzt hat, ist nicht befüllbar ' +
              'und standardmäßig ausgeblendet — der Schalter „nur Profil" macht es sichtbar (ausgegraut, gesperrt, ' +
              'mit Begründung). Der Ausschluss gilt für den ganzen Teilbaum darunter.',
            'Widersprüche der Profilierung — etwa „nicht verwendet" bei zugleich verlangter Mindestanzahl — meldet ' +
              'das Werkzeug beim Start; ein Klick springt zum betroffenen Element, damit der Widerspruch in der ' +
              'Profilierung geklärt werden kann.',
          ],
          bild: '11-durchlauf-start',
          bildText:
            'Start des Durchlaufs an der ersten Pflichtangabe. Die Tastatur führt: ↓ weiter, ↑ zurück, ' +
            '← Teilbaum angeben und betreten, → wieder heraus.',
        },
        {
          nr: 6,
          titel: 'Die geführte Angabe lesen',
          text: [
            'Der Detailbereich sagt an jeder Station, woher die Anforderung stammt. „Pflicht" bedeutet: Die ' +
              'gebundene Profilierung setzt das Element zwingend — auch dort, wo das Schema es freistellt; ' +
              'weglassen ist nicht möglich.',
            '„optional" ist die bewusste Entscheidung aufnehmen oder weglassen. Elemente mit reiner Markierung ' +
              'tragen den Hinweis „zu klären", Elemente ohne Festlegung den Hinweis „nicht profiliert".',
            'Pflichtangaben halten den Durchlauf fest: ↓ übergeht eine Station erst, wenn ein typkonformer Wert ' +
              'steht. Zurück, hinein und heraus bleiben jederzeit frei.',
            'An einer Wert-Station steht der Cursor gleich im Feld: tippen, Enter — der Wert ist übernommen und ' +
              'die nächste offene Angabe steht bereit. ↓ und ↑ blättern auch aus dem Feld heraus, Station für ' +
              'Station; einen Absatz im Wert macht Shift+Enter.',
            'Wo etwas zu wählen ist — die Zweige einer Auswahl, das Ziel eines Verweises —, steht vor jedem ' +
              'Eintrag eine Ziffer: 1…9 wählt ihn ohne Maus. Verweist die Nachricht auf ein Vorkommen, das es noch ' +
              'nicht gibt, hält der Durchlauf nicht an: Enter geht weiter, der Verweis bleibt offen und kommt am ' +
              'Ende noch einmal — dann ist das Ziel angelegt.',
          ],
          bild: '12-gefuehrte-angabe',
          bildText:
            'Geführte Angabe mit Kennzeichen „Pflicht" und „offen", darunter das Wertefeld mit „Würfeln".',
        },
        {
          nr: 7,
          titel: 'Werte eintragen',
          text: [
            'Jedes Wert-Blatt trägt ein Eingabefeld direkt im Kasten — der Baum ist damit zugleich die ' +
              'Live-Vorschau der Testnachricht. Derselbe Wert lässt sich rechts im Detailbereich eintragen.',
            '„Würfeln" erzeugt einen typkonformen Wert (UUID, Datum, Pattern, Codeliste). Ein Beispielwert der ' +
              'Profilierung wird nicht einfach gesetzt, sondern kursiv als Vorschlag mit „übernehmen" angeboten — ' +
              'Werte setzt der Anwender bewusst.',
            'Eine eingeschränkte Codeliste ist hart: wählbar sind ausschließlich die freigegebenen Codes samt ' +
              'Beschreibung, die freie Eingabe ist gesperrt.',
          ],
          bild: '13-wert-eintragen',
          bildText:
            'Eingetragener Wert — im Kasten und im Detailbereich. Das Kennzeichen „Pflicht" stammt aus der Profilierung.',
        },
        {
          nr: 8,
          titel: 'Auswahlen und offene Pflichtfelder',
          text: [
            'An einer Auswahl (xs:choice) wird genau ein Zweig gewählt; nur er wird Teil der Nachricht. Eine ' +
              'Pflicht-Auswahl hält den Durchlauf fest, bis ein Zweig steht.',
            '„Offene Pflichtfelder füllen" in der Kopfzeile belegt alle noch offenen Pflichtangaben in einem Zug ' +
              'profilkonform: nur freigegebene Codes, und ein Beispielwert der Profilierung hat Vorrang vor einem ' +
              'Zufallswert.',
          ],
          bild: '14-pflicht-auswahl',
          bildText:
            'Pflicht-Auswahl mit ihren Zweigen; links im Baum die bereits belegten Werte des Nachrichtenkopfs.',
        },
        {
          nr: 9,
          titel: 'Speichern und prüfen',
          text: [
            '„Speichern" fragt beim ersten Mal einen Namen ab und legt einen eigenen Eintrag im Testdaten-Speicher ' +
              'an. Jede Nachricht wird gegen das XJustiz-Schema validiert.',
            'Weicht die Nachricht von der gebundenen Fassung ab oder ist sie noch nicht valide, bleibt sie als ' +
              'Entwurf gekennzeichnet. Die Meldung nennt jede Abweichung mit Pfad; ein Klick springt zum Element.',
            'Für Testfallreihen bietet das Menü „Mehr" anschließend „Weitere Testnachricht zu diesem Profil" — leer ' +
              'oder als Kopie der eben gespeicherten. Die Kopie übernimmt Werte und Entscheidungsstand.',
          ],
          bild: '15-entwurf-meldung',
          bildText:
            'Die Meldung beim Speichern nennt jede Abweichung von der gebundenen Fassung samt Pfad.',
        },
        {
          nr: 10,
          titel: 'Ergebnis im Speicher',
          text: [
            'Die Kachel nennt die Herkunft („aus Profil X"), den Stand der Pflichtangaben und — solange offen — ' +
              'das Kennzeichen „Entwurf". Ein Klick auf die Herkunft springt in die Profilierung.',
            'Über das ⋯-Menü der Kachel wird die Nachricht heruntergeladen, umbenannt, mit einer Notiz versehen ' +
              'oder gelöscht. Download und „Als neue Nachricht speichern" sind für invalide Nachrichten gesperrt.',
          ],
          bild: '16-testnachricht-kachel',
          bildText: 'Die neue Testnachricht im Speicher, gruppiert unter ihrem Fachmodul.',
        },
      ],
    },
  ];

  /** Sprungmarken der Inhaltsübersicht. */
  protected readonly kapitel = computed(() =>
    this.teile.map((t) => ({
      id: t.id,
      titel: t.titel,
      schritte: t.schritte.map((s) => ({ nr: s.nr, titel: s.titel, anker: this.anker(t, s) })),
    })),
  );

  /** Sprungmarke eines Schritts — stabil aus Teil-Kennung und Nummer. */
  protected anker(teil: Teil, s: Schritt): string {
    return teil.id + '-' + s.nr;
  }

  protected bildPfad(name: string): string {
    return 'howto/' + name + '.webp';
  }

  protected goDashboard(): void {
    this.state.view.set('dashboard');
  }

  /** Zur Projektansicht (#135) — Vorhaben mit ihren Kommunikationsszenarien. */
  protected goProjekte(): void {
    this.state.view.set('projekte');
  }

  protected goTestdaten(): void {
    this.state.view.set('testdaten');
  }
}
