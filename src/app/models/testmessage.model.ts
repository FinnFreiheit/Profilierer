import { ProfileDoc } from './profile.model';

/**
 * Datenmodelle des zentralen Testdaten-Speichers. Eine Testnachricht ist eine
 * hochgeladene XJustiz-XML-Instanz (Root `nachricht.*`), abgelegt mit
 * abgeleiteten Metainfos (Nachrichtenname, Fachmodul) und optionaler Notiz.
 * Gefuehrt erstellte Nachrichten (US "Testnachricht gefuehrt erstellen")
 * tragen zusaetzlich Entwurfs-Kennzeichen, Fortschritt und den gespeicherten
 * Entscheidungsstand.
 */

/** Fortschritt des gefuehrten Durchlaufs: x entschiedene von y Punkten. */
export interface TestmessageFortschritt {
  x: number;
  y: number;
}

/** Schlanke Index-Zeile (ohne das XML) fuer die Kachel-Ansicht. */
export interface TestmessageEntry {
  id: string;
  /** Dateiname/Anzeigename beim Upload. */
  name: string;
  /** Voller Nachrichtenname, z. B. `nachricht.dabag.antrag.2900001`. */
  nachricht?: string;
  /** Cluster-Segment (2. Namenssegment), z. B. `dabag`. */
  fachmodul?: string;
  /** Best-effort ermittelte XJustiz-Version. */
  xjustizVersion?: string;
  /** Byte-Länge des XML. */
  groesse: number;
  notiz?: string;
  /** ms-Timestamp des Uploads. */
  hochgeladen: number;
  /** ms-Timestamp der letzten Änderung (Sortierschlüssel). */
  aktualisiert: number;
  /** Entwurf: Pflicht-Punkte offen — die Nachricht ist noch unvollstaendig. */
  entwurf?: boolean;
  /** Fortschritt "x von y" des gefuehrten Durchlaufs (nur gefuehrt erstellte). */
  fortschritt?: TestmessageFortschritt;
  /** Es liegt ein gespeicherter Entscheidungsstand vor (gefuehrt fortsetzbar). */
  gefuehrt?: boolean;
  /** Von der BLK-AG abgenommen (eingefrorene XML-Fassung existiert). */
  abgenommen?: boolean;
  /** ms-Timestamp der Abnahme. */
  abnahmeZeit?: number;
  abnahmeKommentar?: string;
  /** Aktuelle XML weicht von der eingefrorenen Abnahme-Fassung ab (Warn-Badge). */
  geaendertSeitAbnahme?: boolean;

  // ── Profil-Bindung (US "Testnachricht aus einer Profilierung") ──────
  /**
   * id der Profilierung, gegen die die Nachricht erstellt wurde. Bleibt als
   * Herkunftsangabe erhalten, auch wenn die Profilierung spaeter geloescht wird
   * (die Bindung selbst liegt als eingefrorene Kopie am Eintrag).
   */
  profilId?: string;
  /** Name der Profilierung zum Zeitpunkt der Bindung. */
  profilName?: string;
  /** Bezeichnung der gebundenen Fassung ("v3" bzw. "Arbeitsstand vom …"). */
  fassung?: string;
  /**
   * Die gebundene Fassung sagt fachlich etwas anderes als der aktuelle Stand
   * der Profilierung — Badge "Profil weiterentwickelt". Serverseitig ermittelt
   * (Fach-Hash-Vergleich), damit Kachel und Filter ohne Zusatz-Request rendern.
   * Die Nachricht wird dabei NICHT nachgezogen; das Kennzeichen sagt nur, dass
   * neu zu bauen ist, wer den neuen Stand testen will. Ein positives
   * "profilkonform" gibt es bewusst nicht — es haenge an jeder Kachel und
   * verdraengte die Badges mit Aussage.
   */
  profilWeiterentwickelt?: boolean;
}

/**
 * Gespeicherter Entscheidungsstand einer gefuehrt erstellten Testnachricht:
 * das Profil-Modell (Blattwerte in `beispiel`, aufgenommen/weggelassen als
 * Status-Wirkung, Vorkommen als Auspraegungen) plus Nachricht und Version.
 * Im reinen XML waere "bewusst weggelassen" nicht von "noch offen"
 * unterscheidbar — daher wird der Stand als JSON am Eintrag mitgefuehrt.
 */
export interface GuidedMessageState {
  msgName: string;
  xjustizVersion?: string;
  profil: ProfileDoc;
}

/** Upload-Nutzlast (POST /api/testmessages). */
export interface TestmessageInput {
  name: string;
  xml: string;
  nachricht: string;
  fachmodul: string;
  xjustizVersion?: string;
  groesse: number;
  entwurf?: boolean;
  fortschritt?: TestmessageFortschritt;
  entscheidungen?: GuidedMessageState;
  /** Herkunft der Profil-Bindung (siehe TestmessageEntry). */
  profilId?: string;
  profilName?: string;
  fassung?: string;
  /**
   * Die eingefrorene Kopie der gebundenen Profilfassung. Wird nur beim Anlegen
   * mitgegeben und danach nicht mehr veraendert — sie ist die unveraenderliche
   * Vorgabe des Durchlaufs (Spec "Testnachricht aus einer Profilierung").
   */
  vorgabe?: ProfileDoc;
}

/**
 * Laufende Sitzung "Testnachricht gefuehrt aus einem Schema erstellen":
 * merkt Nachricht/Version und — nach dem ersten Speichern — den
 * Testspeicher-Eintrag, den weitere Speichervorgaenge aktualisieren.
 */
export interface MessageCreateSession {
  msgName: string;
  xjustizVersion?: string;
  /** id des Testspeicher-Eintrags (null = noch nie gespeichert). */
  entryId: string | null;
  /** Anzeigename des Eintrags (ab dem ersten Speichern). */
  name: string | null;
  /**
   * Profil-Bindung des Durchlaufs (fehlt beim Einstieg "aus Schema"). Die
   * gebundene Fassung selbst liegt als Vorgabe im Store (StateService.vorgabe);
   * hier stehen nur die Herkunftsangaben fuer Eintrag und Kachel.
   */
  profilId?: string;
  profilName?: string;
  fassung?: string;
}

/**
 * Laufende Bearbeitungs-Session einer geladenen XJustiz-Instanz. Anders als das
 * Profil (Szenario) haelt sie das **Quell-DOM** der Original-Nachricht, damit
 * beim erneuten Speichern eine *getreue* Instanz entsteht: unveraenderte Teile
 * stammen 1:1 aus dem Original, nur die im Modell geaenderten Werte/Strukturen
 * werden eingepflegt (InstanceExportService). Enthaelt Runtime-DOM-Objekte und
 * ist daher nicht persistierbar.
 */
export interface MessageEditSession {
  /** Root-Nachrichtenname (= localName des Wurzelelements). */
  msgName: string;
  /** Anzeigename der Quelle (Dateiname/Testnachrichten-Name) fuer Vorschlaege. */
  quellName: string;
  /** XJustiz-Version der Quelle (aus dem Nachrichtenkopf). */
  xjustizVersion?: string;
  /**
   * id des Testspeicher-Eintrags, aus dem geladen wurde (null = Datei-Upload
   * oder Drag&Drop). Nur mit id laesst sich in denselben Eintrag zurueckspeichern
   * (TestmessageEditService.speichern); sonst bleibt nur "als neue Nachricht".
   */
  entryId: string | null;
  /** Geparstes Original-Dokument (Basis fuer den treuen Re-Export). */
  sourceDoc: Document;
  /** Modell-Pfad -> zugehoeriges Quell-Element im `sourceDoc`. */
  quelle: Map<string, Element>;
  /**
   * Auspraegungs-Pfad (`pfad@auspId`) -> Index des zugehoerigen Vorkommens im
   * Quell-DOM. Ohne diese Zuordnung waere der Re-Export auf die Position in der
   * Auspraegungsliste angewiesen — nach dem Loeschen eines Vorkommens wuerden
   * dann die Werte des geloeschten auf das nachrueckende uebertragen.
   */
  vorkommenIndex: Map<string, number>;
}
