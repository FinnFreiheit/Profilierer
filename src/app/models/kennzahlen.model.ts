/**
 * Kennzahlen der Instanz (`GET /api/kennzahlen`, AG-exklusiv). Spiegelt die
 * Antwort von `server/routes/kennzahlen.js` wortgleich.
 *
 * Die Nutzungszahlen sind anonym gezaehlt: eine im Browser erzeugte
 * Zufallskennung (siehe KlientService), keine IP-Adressen, keine Namen.
 * "Klienten" sind daher Browser-Profile, nicht Personen.
 */

/** Ein Kalendertag im Verlauf (Luecken kommen als Nullen, nicht als Loch). */
export interface KennzahlenTag {
  /** 'YYYY-MM-DD', lokaler Kalendertag des Servers. */
  tag: string;
  zugriffe: number;
  klienten: number;
  fehler: number;
}

/** Eine normalisierte API-Route im Fenster (IDs sind zu :id zusammengefasst). */
export interface KennzahlenRoute {
  route: string;
  zugriffe: number;
  fehler: number;
  /** Mittlere Antwortdauer in Millisekunden. */
  dauerMs: number;
}

/** Summenwerte eines Zeitraums. */
export interface KennzahlenSumme {
  zugriffe: number;
  klienten: number;
  fehler: number;
  dauerMs: number;
}

export interface KennzahlenNutzung {
  heute: KennzahlenSumme;
  /**
   * Summen ueber das Fenster. `klienten` zaehlt verschiedene Kennungen und ist
   * daher nur so weit belastbar, wie die Rohdaten reichen (30 Tage) — danach
   * bleibt je Tag nur noch eine Anzahl uebrig.
   */
  fenster: KennzahlenSumme;
  /** Zugriffe ohne Kennung (curl, Monitoring); nicht in `klienten` enthalten. */
  ohneKennung: number;
  /** Kennungen, die im Fenster an mindestens fuenf Tagen aktiv waren. */
  wiederkehrend: number;
  /** Ein Eintrag je Kalendertag, aufsteigend. */
  verlauf: KennzahlenTag[];
  /** Tagesprofil der letzten sieben Tage: 24 Werte, Index = Stunde. */
  stundenprofil: number[];
  /** Die zugriffsstaerksten Routen des Fensters, absteigend (hoechstens zehn). */
  routen: KennzahlenRoute[];
}

/** Bestandszahlen aus den Fachtabellen (kein Zeitbezug, immer der Ist-Stand). */
export interface KennzahlenBestand {
  profile: number;
  profileAbgenommen: number;
  profileMitOffenenHinweisen: number;
  punkteEntschieden: number;
  punkteGesamt: number;
  testnachrichten: number;
  testnachrichtenAbgenommen: number;
  testnachrichtenEntwuerfe: number;
  projekte: number;
  hinweiseOffen: number;
  hinweiseGesamt: number;
  schemaVersionen: number;
  zuletztAktualisiert: number | null;
}

export interface Kennzahlen {
  /** Serverzeit der Auswertung (ms). */
  erzeugt: number;
  zeitraum: { von: string; bis: string; tage: number };
  nutzung: KennzahlenNutzung;
  bestand: KennzahlenBestand;
}
