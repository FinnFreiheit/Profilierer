/**
 * Die "Wirkung" einer Statusstufe steuert Schematron und Beispiel-XML
 * (Profilierer.html Z.325).
 */
export type Wirkung = 'pflicht' | 'optional' | 'ausgeschlossen' | 'markierung';

/** Eine frei konfigurierbare Statusstufe (Z.319-324). */
export interface Status {
  id: string;
  name: string;
  farbe: string;
  wirkung: Wirkung;
}

/** Eine benannte Auspraegung eines wiederholbaren Elements (Z.1020). */
export interface Auspraegung {
  id: string;
  name: string;
  /**
   * Herkunft einer Kopie: die id der Auspraegung, aus der dieses Vorkommen
   * entstanden ist. Im gebundenen Durchlauf entstehen weitere Vorkommen
   * ausschliesslich als Kopie einer profilierten Auspraegung (#28) — ueber
   * diese Spur findet die Vorgabe-Schicht die Unter-Profilierung der Quelle
   * (`StateService.vorgabePfad`), obwohl die Kopie eine neue id traegt.
   * Ketten werden flach gehalten: die Kopie einer Kopie zeigt auf dieselbe
   * profilierte Auspraegung.
   */
  vonId?: string;
}

/**
 * Herkunft des Datentyps einer Schema-Erweiterung (#96): XSD-Builtin,
 * ein Typ des geladenen Schemas oder Freitext (ein Typ, den es noch nicht
 * gibt). Fehlt bei Altbestand — dann gilt die Aufloesung in
 * `core/util/datentyp.util.ts`.
 */
export type DatentypQuelle = 'xs' | 'schema' | 'frei';

/**
 * Eine Schema-Erweiterung: ein benutzerdefiniertes Element, das im
 * XJustiz-Schema (noch) nicht existiert und nachbeauftragt werden soll.
 * Pfad-indiziert am Elternpfad; der eigene Pfad ist `elternPfad + '/~' + id`
 * (die id, nicht der Name — Umbenennen verschiebt keine Profil-Eintraege).
 */
export interface Erweiterung {
  id: string;
  /** XML-Elementname (NCName). */
  name: string;
  beschreibung?: string;
  min: string;
  max: string;
  /**
   * Nackter Lokalname des Datentyps ohne Praefix (`string`, `datatypeC`,
   * `Type.GDS.Akte`); undefined = Container.
   */
  datentyp?: string;
  /** Herkunft des Datentyps; fehlt bei Altbestand (#96). */
  datentypQuelle?: DatentypQuelle;
}

/**
 * Die Profilierung eines einzelnen Elements (pfad-indiziert). Alle Felder
 * optional; ein Eintrag ohne belegte Felder wird weggeraeumt (siehe pruneP,
 * Z.992-996).
 */
export interface ElementProfile {
  /** Status.id */
  status?: string;
  /** Kardinalitaets-Override (Z.1008). */
  min?: string;
  max?: string;
  anmerkung?: string;
  beispiel?: string;
  /** Auf diese Codelisten-Werte eingeschraenkt. */
  werte?: string[];
  /** Verweisziel-Pfad (Z.1179-1183). */
  refZiel?: string;
}

/**
 * Ein Hinweis an einem Element — Rueckmeldung im Abstimmungsbetrieb. Hinweise
 * sind eine **eigene Ressource** neben der Profilierung (eigene Ablage, eigene
 * Endpunkte, siehe HinweisStoreService und ADR 0014) und gehoeren bewusst nicht
 * mehr ins ProfileDoc: dort loeschte sie der naechste Autosave eines anderen
 * Bearbeiters, und der Abnahme-Hash reagierte auf jede Notiz.
 * Offene Hinweise erscheinen im Excel-Export, nie im XML.
 */
export interface Hinweis {
  id: string;
  /** Element, an dem der Hinweis haengt (Pfad wie in `elemente`). */
  pfad: string;
  text: string;
  /** Selbstauskunft des Verfassers; leer bei migriertem Altbestand. */
  autor?: string;
  /**
   * Rolle des Verfassers. Bleibt vorerst leer — gefuellt wird sie erst mit der
   * Autorschafts-Story; bei migriertem Altbestand gibt es sie nicht.
   */
  rolle?: 'ag' | 'extern';
  /** ms-Timestamp, serverseitig gestempelt (beim Import: der Wert der Datei). */
  zeit: number;
  erledigt?: boolean;
}

/** Metadaten des Profils (mName/mAutor/mDatum/mBeschr, Z.289-292). */
export interface ProfileMeta {
  name?: string;
  autor?: string;
  datum?: string;
  beschreibung?: string;
  /** Beim Speichern gesetzt (saveProfile, Z.1784-1786). */
  nachricht?: string | null;
  xjustizVersion?: string;
  gespeichert?: string;
}

/**
 * Das persistierbare Profil-Dokument (frueher S.profile, Z.333).
 * `elemente` und `auspraegungen` sind pfad-indizierte Maps.
 */
export interface ProfileDoc {
  meta: ProfileMeta;
  statuses: Status[];
  elemente: Record<string, ElementProfile>;
  auspraegungen: Record<string, Auspraegung[]>;
  /** Schema-Erweiterungen, indiziert am Elternpfad. */
  erweiterungen: Record<string, Erweiterung[]>;
  /**
   * Abgeleiteter Stand der Entscheidungspunkte (#93): `x` entschieden von `y`
   * insgesamt — dieselben Zahlen, die der Editor oben rechts zeigt. Sie stehen
   * hier, weil nur der Client sie kennt (der Server hat kein Schema); die
   * Uebersicht braucht sie fuer den Fortschrittsbalken.
   *
   * **Keine fachliche Aussage.** Der Fach-Hash des Servers laesst sie deshalb
   * aussen vor — sonst markierte schon ein Wechsel der Schemaversion jede
   * gebundene Testnachricht als "Profil weiterentwickelt". Fehlt das Feld
   * (Altbestand, Import ohne Schema), zeigt die Kachel keinen Balken.
   */
  fortschritt?: { x: number; y: number };
}

/**
 * Schlanke Zusammenfassung eines Profils fuer die Dashboard-Bibliothek
 * (der Index `xjp.library.index`). Das komplette `ProfileDoc` liegt separat
 * unter `xjp.library.doc.<id>` — so rendert das Dashboard ohne die
 * (potenziell grossen) `elemente`-Maps zu deserialisieren.
 */
export interface LibraryEntry {
  id: string;
  name: string;
  nachricht?: string | null;
  xjustizVersion?: string;
  /** Fortschritt-Snapshot: Elemente mit gesetztem Status. */
  nStatus: number;
  /** Entschiedene Punkte des gefuehrten Laufs (#93); fehlt im Altbestand. */
  nEntschieden?: number;
  /** Punkte insgesamt — Nenner des Balkens (#93); fehlt im Altbestand. */
  nPunkte?: number;
  /** Fortschritt-Snapshot: Summe aller Auspraegungen. */
  nAusp: number;
  /** Fortschritt-Snapshot: Summe aller Schema-Erweiterungen (alte Server-Zeilen: fehlt). */
  nErw?: number;
  /** meta.gespeichert (fachliches Datum, YYYY-MM-DD). */
  gespeichert?: string;
  /** ms-Timestamp der letzten Schreibung (Sortierung im Dashboard). */
  aktualisiert: number;
  /** Anzahl der Versionen (Snapshots); fehlt, wenn keine existieren. */
  nVersionen?: number;
  /** Hoechste Versionsnummer (Nummern werden nie recycelt). */
  letzteVersionNr?: number;
  /** Arbeitsstand ist in keiner Version eingefroren ("geaendert seit vX"). */
  geaendert?: boolean;
  /** Von der BLK-AG abgenommen (Referenz auf eine Abnahme-Version existiert). */
  abgenommen?: boolean;
  /** Nummer der referenzierten Abnahme-Version. */
  abnahmeVersionNr?: number;
  /** ms-Timestamp der Abnahme. */
  abnahmeZeit?: number;
  abnahmeKommentar?: string;
  /** Arbeitsstand weicht vom eingefrorenen Abnahme-Stand ab (Warn-Badge). */
  geaendertSeitAbnahme?: boolean;
  /** Offene Hinweise am Profil (Rueckmelde-Badge der Karte, #43). */
  nHinweiseOffen?: number;
  /** Davon von Externen — der Klammerzusatz des Badges. */
  nHinweiseExtern?: number;
}

/** Metadaten einer Profil-Version (Liste im Versions-Dialog, ohne doc). */
export interface ProfilVersion {
  id: string;
  /** Fortlaufende Nummer je Profil (v1, v2, …). */
  nr: number;
  kommentar?: string;
  /** Automatisch entstanden (Oeffnen-Snapshot, Sicherheits-Version). */
  automatisch?: boolean;
  /** Durch eine Abnahme der BLK-AG entstanden (eingefrorene valide Fassung). */
  abnahme?: boolean;
  /** ms-Timestamp. */
  erstellt: number;
}
