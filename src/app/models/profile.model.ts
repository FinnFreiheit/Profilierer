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
  /** Fortschritt-Snapshot: Summe aller Auspraegungen. */
  nAusp: number;
  /** meta.gespeichert (fachliches Datum, YYYY-MM-DD). */
  gespeichert?: string;
  /** ms-Timestamp der letzten Schreibung (Sortierung im Dashboard). */
  aktualisiert: number;
}
