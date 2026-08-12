import { Injectable } from '@angular/core';
import {
  Auspraegung,
  ElementProfile,
  Erweiterung,
  ProfileDoc,
  ProfileMeta,
  Status,
} from '../../models/profile.model';
import {
  ProfilDiffArt,
  ProfilDiffBereich,
  ProfilDiffEintrag,
  ProfilDiffResult,
  ProfilFeldDiff,
} from '../../models/profil-diff.model';
import { pretty } from '../util/pretty.util';

/**
 * Feldgenauer Vergleich zweier Profil-Dokumente (US "Was hat sich seit der
 * Abnahme geaendert?"). Reine Funktion ohne State-Zugriff — der Aufrufer
 * beschafft die beiden Dokumente (eingefrorene Version bzw. Arbeitsstand).
 *
 * Nicht zu verwechseln mit dem DiffService, der zwei XJustiz-SCHEMATA
 * vergleicht.
 */

/** Anzeigenamen der ElementProfile-Felder, in fachlich sinnvoller Reihenfolge. */
const ELEMENT_FELDER: { feld: keyof ElementProfile; label: string }[] = [
  { feld: 'status', label: 'Status' },
  { feld: 'min', label: 'Mindest-Vorkommen' },
  { feld: 'max', label: 'Höchst-Vorkommen' },
  { feld: 'werte', label: 'Zulässige Werte' },
  { feld: 'kennzeichnend', label: 'Kennzeichnend' },
  { feld: 'beispiel', label: 'Beispielwert' },
  { feld: 'anmerkung', label: 'Anmerkung' },
  { feld: 'refZiel', label: 'Verweisziel' },
  // Hinweise sind kein Feld des Elementprofils mehr (eigene Ressource, ADR 0014)
  // und tauchen im Vergleich der Profilstaende folgerichtig nicht mehr auf.
];

const STATUS_FELDER: { feld: keyof Status; label: string }[] = [
  { feld: 'name', label: 'Bezeichnung' },
  { feld: 'wirkung', label: 'Wirkung' },
  { feld: 'farbe', label: 'Farbe' },
];

/**
 * Verglichene Felder einer Schema-Erweiterung. `datentypQuelle` fehlt bewusst
 * (#96): die Herkunft begleitet den Typ: mitverglichen stuende ein Typwechsel
 * zweimal im Diff.
 */
const ERWEITERUNG_FELDER: { feld: keyof Erweiterung; label: string }[] = [
  { feld: 'name', label: 'Elementname' },
  { feld: 'datentyp', label: 'Datentyp' },
  { feld: 'min', label: 'Mindest-Vorkommen' },
  { feld: 'max', label: 'Höchst-Vorkommen' },
  { feld: 'beschreibung', label: 'Beschreibung' },
];

/**
 * Meta-Felder des Vergleichs. `gespeichert` fehlt bewusst: das Feld wird bei
 * jedem Speichern neu gesetzt und wuerde jeden Vergleich mit einer
 * Schein-Aenderung eroeffnen.
 */
const META_FELDER: { feld: keyof ProfileMeta; label: string }[] = [
  { feld: 'name', label: 'Name' },
  { feld: 'autor', label: 'Autor' },
  { feld: 'datum', label: 'Datum' },
  { feld: 'beschreibung', label: 'Beschreibung' },
  { feld: 'nachricht', label: 'Nachrichtentyp' },
  { feld: 'xjustizVersion', label: 'XJustiz-Version' },
];

const BEREICH_RANG: Record<ProfilDiffBereich, number> = {
  meta: 0,
  status: 1,
  element: 2,
  auspraegung: 3,
  erweiterung: 4,
};

/**
 * Statusstufe als Anzeigetext ("zwingend (Pflicht)"). Der Vergleich laeuft
 * bewusst ueber diesen aufgeloesten Text und nicht ueber die Status-id: die ids
 * sind pro Dokument vergeben, dieselbe id kann in beiden Fassungen auf
 * unterschiedliche Stufen zeigen — und umgekehrt.
 */
export function statusText(doc: ProfileDoc, id?: string): string | undefined {
  if (!id) return undefined;
  const s = doc.statuses.find((x) => x.id === id);
  return s ? `${s.name} (${s.wirkung})` : `unbekannte Statusstufe (${id})`;
}

/**
 * Pfad mit aufgeloesten IDs. Auspraegungen (`…/beteiligung@a1x2`) und
 * Erweiterungen (`…/~x9`) tragen im Pfad nur ihre id; ohne Aufloesung sieht der
 * Nutzer eine Zeichenwueste. Nachgeschlagen wird zuerst im Arbeitsstand, dann
 * in der Basis — sonst bliebe ein geloeschter Eintrag unlesbar.
 */
export function pfadKlartext(pfad: string, vergleich: ProfileDoc, basis: ProfileDoc): string {
  if (!pfad) return '';
  const teile: string[] = [];
  let praefix = '';
  for (const seg of pfad.split('/')) {
    if (seg.startsWith('~')) {
      const id = seg.slice(1);
      const erw = findeErweiterung(praefix, id, vergleich) ?? findeErweiterung(praefix, id, basis);
      teile.push('~' + (erw?.name ?? `(gelöscht: ${id})`));
    } else {
      // Auspraegungs-Suffix haengt am Elementnamen: "beteiligung@a1x2".
      const at = seg.lastIndexOf('@');
      if (at > 0) {
        const elName = seg.slice(0, at);
        const id = seg.slice(at + 1);
        const basisPfad = praefix ? `${praefix}/${elName}` : elName;
        const a =
          findeAuspraegung(basisPfad, id, vergleich) ?? findeAuspraegung(basisPfad, id, basis);
        teile.push(`${elName} „${a?.name ?? `(gelöscht: ${id})`}"`);
      } else {
        teile.push(seg);
      }
    }
    praefix = praefix ? `${praefix}/${seg}` : seg;
  }
  return teile.join('/');
}

function findeErweiterung(
  elternPfad: string,
  id: string,
  doc: ProfileDoc,
): Erweiterung | undefined {
  return doc.erweiterungen?.[elternPfad]?.find((e) => e.id === id);
}

function findeAuspraegung(pfad: string, id: string, doc: ProfileDoc): Auspraegung | undefined {
  return doc.auspraegungen?.[pfad]?.find((a) => a.id === id);
}

/** Letztes Pfadsegment ohne Auspraegungs-/Erweiterungs-Suffix. */
function blattName(pfad: string): string {
  const seg = pfad.split('/').pop() ?? pfad;
  if (seg.startsWith('~')) return seg;
  const at = seg.lastIndexOf('@');
  return at > 0 ? seg.slice(0, at) : seg;
}

/** Anzeigewert eines ElementProfile-Feldes; undefined = nicht gesetzt. */
function elementWert(
  doc: ProfileDoc,
  p: ElementProfile | undefined,
  feld: keyof ElementProfile,
): string | undefined {
  if (!p) return undefined;
  const v = p[feld];
  if (v === undefined || v === null || v === '') return undefined;
  if (feld === 'status') return statusText(doc, v as string);
  // Boolesches Flag: nur "ja" ist eine Aussage — false ist dasselbe wie ungesetzt.
  if (feld === 'kennzeichnend') return v ? 'ja' : undefined;
  if (feld === 'werte') {
    const liste = v as string[];
    // Leeres Array ist bewusst gesetzt ("keine Werte zugelassen") und muss
    // von "keine Einschraenkung" unterscheidbar bleiben.
    return liste.length ? [...liste].sort().join(', ') : '(keine Werte zugelassen)';
  }
  return String(v);
}

/** "+ neu1, neu2 · − weg1" fuer die Werte-Einschraenkung. */
function werteDelta(vorher?: string[], nachher?: string[]): string | undefined {
  const a = new Set(vorher ?? []);
  const b = new Set(nachher ?? []);
  const dazu = [...b].filter((x) => !a.has(x)).sort();
  const weg = [...a].filter((x) => !b.has(x)).sort();
  if (!dazu.length && !weg.length) return undefined;
  return [dazu.length ? '+ ' + dazu.join(', ') : '', weg.length ? '− ' + weg.join(', ') : '']
    .filter(Boolean)
    .join(' · ');
}

/**
 * Feldweiser Vergleich zweier Objekte anhand einer Feldtabelle. Die beiden
 * Anzeige-Funktionen sind getrennt, weil die Aufloesung dokumentabhaengig ist
 * (eine Status-id bedeutet in beiden Fassungen etwas anderes).
 */
function felderDiff<T>(
  tabelle: { feld: keyof T; label: string }[],
  vorher: T | undefined,
  nachher: T | undefined,
  wertA: (o: T | undefined, feld: keyof T) => string | undefined,
  wertB: (o: T | undefined, feld: keyof T) => string | undefined = wertA,
): ProfilFeldDiff[] {
  const out: ProfilFeldDiff[] = [];
  for (const { feld, label } of tabelle) {
    const a = wertA(vorher, feld);
    const b = wertB(nachher, feld);
    if (a === b) continue;
    out.push({ feld: String(feld), label, vorher: a, nachher: b });
  }
  return out;
}

/** Art eines Eintrags aus dem Vorhandensein beider Seiten. */
function art(vorhanden: { alt: boolean; neu: boolean }): ProfilDiffArt {
  return !vorhanden.alt ? 'neu' : !vorhanden.neu ? 'entfernt' : 'geändert';
}

@Injectable({ providedIn: 'root' })
export class ProfilDiffService {
  /**
   * Vergleicht zwei Profil-Dokumente feldgenau.
   *
   * @param basis     aeltere Fassung (Abnahme-/Versionsstand) — "entfernt" bezieht sich hierauf
   * @param vergleich juengere Fassung (Arbeitsstand) — "neu" bezieht sich hierauf
   */
  vergleiche(basis: ProfileDoc, vergleich: ProfileDoc): ProfilDiffResult {
    const eintraege: ProfilDiffEintrag[] = [
      ...this.metaDiff(basis, vergleich),
      ...this.statusDiff(basis, vergleich),
      ...this.elementDiff(basis, vergleich),
      ...this.auspraegungDiff(basis, vergleich),
      ...this.erweiterungDiff(basis, vergleich),
    ];

    eintraege.sort(
      (a, b) =>
        BEREICH_RANG[a.bereich] - BEREICH_RANG[b.bereich] ||
        a.pfad.localeCompare(b.pfad, 'de') ||
        a.titel.localeCompare(b.titel, 'de'),
    );

    const zaehler: Record<ProfilDiffArt, number> = { neu: 0, entfernt: 0, geändert: 0 };
    const proBereich: Record<ProfilDiffBereich, number> = {
      meta: 0,
      status: 0,
      element: 0,
      auspraegung: 0,
      erweiterung: 0,
    };
    for (const e of eintraege) {
      zaehler[e.art]++;
      proBereich[e.bereich]++;
    }
    return { eintraege, zaehler, proBereich };
  }

  // ── Metadaten ────────────────────────────────────────────────────────

  private metaDiff(basis: ProfileDoc, vergleich: ProfileDoc): ProfilDiffEintrag[] {
    const a = basis.meta ?? {};
    const b = vergleich.meta ?? {};
    return felderDiff(META_FELDER, a, b, (o, feld) => {
      const v = o?.[feld];
      return v === undefined || v === null || v === '' ? undefined : String(v);
    }).map((f) => ({
      art: art({ alt: f.vorher !== undefined, neu: f.nachher !== undefined }),
      bereich: 'meta' as const,
      pfad: '',
      titel: f.label,
      pfadKlartext: '',
      felder: [f],
      springbar: false,
    }));
  }

  // ── Statusstufen ─────────────────────────────────────────────────────

  private statusDiff(basis: ProfileDoc, vergleich: ProfileDoc): ProfilDiffEintrag[] {
    const wert = (s: Status | undefined, feld: keyof Status) => s?.[feld] || undefined;
    const out: ProfilDiffEintrag[] = [];
    const ids = new Set([
      ...(basis.statuses ?? []).map((s) => s.id),
      ...(vergleich.statuses ?? []).map((s) => s.id),
    ]);
    for (const id of ids) {
      const a = basis.statuses?.find((s) => s.id === id);
      const b = vergleich.statuses?.find((s) => s.id === id);
      const felder = felderDiff(STATUS_FELDER, a, b, wert);
      if (!felder.length) continue;
      out.push({
        art: art({ alt: !!a, neu: !!b }),
        bereich: 'status',
        pfad: id,
        titel: `Statusstufe „${b?.name ?? a?.name ?? id}"`,
        pfadKlartext: '',
        felder,
        springbar: false,
      });
    }
    return out;
  }

  // ── Elemente ─────────────────────────────────────────────────────────

  private elementDiff(basis: ProfileDoc, vergleich: ProfileDoc): ProfilDiffEintrag[] {
    const out: ProfilDiffEintrag[] = [];
    const pfade = new Set([
      ...Object.keys(basis.elemente ?? {}),
      ...Object.keys(vergleich.elemente ?? {}),
    ]);
    for (const pfad of pfade) {
      const a = basis.elemente?.[pfad];
      const b = vergleich.elemente?.[pfad];
      const felder = felderDiff(
        ELEMENT_FELDER,
        a,
        b,
        (o, feld) => elementWert(basis, o, feld),
        (o, feld) => elementWert(vergleich, o, feld),
      );
      if (!felder.length) continue;
      // Mengen-Delta der Werte-Einschraenkung ergaenzen (Reihenfolge ist egal).
      const w = felder.find((f) => f.feld === 'werte');
      if (w) w.delta = werteDelta(a?.werte, b?.werte);
      out.push({
        art: art({ alt: !!a, neu: !!b }),
        bereich: 'element',
        pfad,
        titel: pretty(blattName(pfad)),
        pfadKlartext: pfadKlartext(pfad, vergleich, basis),
        felder,
        springbar: !!b,
      });
    }
    return out;
  }

  // ── Auspraegungen ────────────────────────────────────────────────────

  private auspraegungDiff(basis: ProfileDoc, vergleich: ProfileDoc): ProfilDiffEintrag[] {
    const out: ProfilDiffEintrag[] = [];
    const pfade = new Set([
      ...Object.keys(basis.auspraegungen ?? {}),
      ...Object.keys(vergleich.auspraegungen ?? {}),
    ]);
    for (const pfad of pfade) {
      const alt = basis.auspraegungen?.[pfad] ?? [];
      const neu = vergleich.auspraegungen?.[pfad] ?? [];
      const ids = new Set([...alt.map((x) => x.id), ...neu.map((x) => x.id)]);
      for (const id of ids) {
        const a = alt.find((x) => x.id === id);
        const b = neu.find((x) => x.id === id);
        // Reihenfolge im Array ist keine fachliche Aenderung — nur der Name zaehlt.
        if (a?.name === b?.name) continue;
        const eigenerPfad = `${pfad}@${id}`;
        out.push({
          art: art({ alt: !!a, neu: !!b }),
          bereich: 'auspraegung',
          pfad: eigenerPfad,
          titel: `Ausprägung „${b?.name ?? a?.name ?? id}"`,
          pfadKlartext: pfadKlartext(eigenerPfad, vergleich, basis),
          felder: [{ feld: 'name', label: 'Bezeichnung', vorher: a?.name, nachher: b?.name }],
          springbar: !!b,
        });
      }
    }
    return out;
  }

  // ── Schema-Erweiterungen ─────────────────────────────────────────────

  private erweiterungDiff(basis: ProfileDoc, vergleich: ProfileDoc): ProfilDiffEintrag[] {
    const wert = (e: Erweiterung | undefined, feld: keyof Erweiterung) => e?.[feld] || undefined;
    const out: ProfilDiffEintrag[] = [];
    const pfade = new Set([
      ...Object.keys(basis.erweiterungen ?? {}),
      ...Object.keys(vergleich.erweiterungen ?? {}),
    ]);
    for (const elternPfad of pfade) {
      const alt = basis.erweiterungen?.[elternPfad] ?? [];
      const neu = vergleich.erweiterungen?.[elternPfad] ?? [];
      const ids = new Set([...alt.map((x) => x.id), ...neu.map((x) => x.id)]);
      for (const id of ids) {
        const a = alt.find((x) => x.id === id);
        const b = neu.find((x) => x.id === id);
        const felder = felderDiff(ERWEITERUNG_FELDER, a, b, wert);
        if (!felder.length) continue;
        const eigenerPfad = `${elternPfad}/~${id}`;
        out.push({
          art: art({ alt: !!a, neu: !!b }),
          bereich: 'erweiterung',
          pfad: eigenerPfad,
          titel: `Erweiterung „${b?.name ?? a?.name ?? id}"`,
          pfadKlartext: pfadKlartext(eigenerPfad, vergleich, basis),
          felder,
          springbar: !!b,
        });
      }
    }
    return out;
  }
}
