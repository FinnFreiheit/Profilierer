import { BundledVersion, SchemaDatei } from '../../models/schema-bundle.model';

/** Ergebnis von `vereineVersionen`: die zusammengefuehrte Liste und die Zugaenge. */
export interface VereinteVersionen {
  liste: BundledVersion[];
  /** Versionen, die es in `bisher` noch gar nicht gab (fuer die Meldung). */
  neu: BundledVersion[];
}

/**
 * Bekannte Schemaversionen mit denen von xjustiz.de zusammenfuehren — die eine
 * Regel dafuer, gleich ob die Zugaenge aus dem Speicher kommen (Start) oder
 * frisch von der Versionsseite (Aktualisieren).
 *
 * **xjustiz.de ist die fuehrende Quelle**: ein Eintrag gleicher Versionsnummer
 * wird an Ort und Stelle ersetzt, damit der Umschalter dieselbe Version nicht
 * zweimal anbietet. `dir`, `label` und `default` des bisherigen Eintrags bleiben
 * dabei stehen — an `dir` haengt die aktive Auswahl (`StateService.activeBundle`)
 * und am Standard-Kennzeichen der Start. Nur die **Bezugsquelle** wechselt:
 * `zipUrl`, `hinweis` und die Dateiliste kommen von der neuen Quelle.
 *
 * Nur dort veroeffentlichte Versionen kommen hinten dazu (die Liste bleibt
 * ansonsten in ihrer Reihenfolge — die hinterlegten zuerst).
 */
export function vereineVersionen(
  bisher: BundledVersion[],
  neue: BundledVersion[],
): VereinteVersionen {
  const nachId = new Map(neue.map((v) => [v.id, v]));
  const liste = bisher.map((v) => {
    const n = nachId.get(v.id);
    if (!n) return v;
    nachId.delete(v.id);
    return { ...v, files: n.files ?? [], zipUrl: n.zipUrl, hinweis: n.hinweis, geholt: n.geholt };
  });
  const neuZugegangen = Array.from(nachId.values());
  return { liste: [...liste, ...neuZugegangen], neu: neuZugegangen };
}

/**
 * XSD-Paare (Name/Inhalt) in die `File`-Objekte verpacken, die die Ladewege
 * erwarten (`PersistenceService.loadXsdFiles`) — gleich, ob sie aus dem ZIP von
 * xjustiz.de oder aus dem Schema-Speicher kommen.
 */
export function alsFiles(dateien: SchemaDatei[]): File[] {
  return dateien.map((d) => new File([d.text], d.name, { type: 'application/xml' }));
}
