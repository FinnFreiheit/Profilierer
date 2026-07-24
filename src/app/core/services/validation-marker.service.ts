import { Injectable, inject } from '@angular/core';
import { ReportEintrag, ValidierungsFehler } from '../../models/validation.model';
import { istErweiterungsPfad } from '../../models/node.model';
import { StateService } from './state.service';

/**
 * Uebersetzt Schemavalidierungs-Fehler (Zeilennummern im generierten XML) ueber
 * die vom ExportService mitgefuehrte Zeile→Pfad-Karte in Baumpfade und setzt
 * die Marker-Signals (`valFehler`/`valAnc`) fuer die Kennzeichnung im Baum —
 * Mechanik analog zur Diff-Markierung (DiffService.computeDiffMap).
 */
@Injectable({ providedIn: 'root' })
export class ValidationMarkerService {
  private readonly state = inject(StateService);

  /**
   * Fehler auf Baum-Pfade aufloesen und als bekannte Schema-Erweiterung
   * klassifizieren — ohne Marker-Signals (auch fuer transiente Baeume nutzbar,
   * z. B. die Testnachricht-Generierung).
   */
  ordneZu(fehler: ValidierungsFehler[], zeilenPfade: ReadonlyMap<number, string>): ReportEintrag[] {
    const zeilen = [...zeilenPfade.keys()].sort((a, b) => a - b);
    // Exakter Treffer, sonst die naechstliegende vorherige gemappte Zeile:
    // Kommentar-/Praeambelzeilen tragen keinen Pfad, und "Element X fehlt"
    // meldet libxml2 am Open-Tag des Elternelements — beides landet so am
    // fachlich richtigen Knoten.
    const pfadZu = (zeile: number): string | undefined => {
      let best: number | undefined;
      for (const z of zeilen) {
        if (z > zeile) break;
        best = z;
      }
      return best != null ? zeilenPfade.get(best) : undefined;
    };

    // Namens-Fallback: libxml2 kann den "not expected"-Fehler auch am
    // Folge-Element melden — ein Fehlertext, dessen Subjekt ein bekannter
    // Erweiterungs-Name ist, geht trotzdem auf die Erweiterung zurueck.
    // Konservativ: nur das erste Element '…' im Text zaehlt.
    const erwNamen = new Set(
      Object.values(this.state.erweiterungen())
        .flat()
        .map((e) => e.name),
    );
    const nenntErweiterung = (text: string): boolean => {
      const m = text.match(/Element '(?:\{[^}]*\})?([^']+)'/);
      return !!m && erwNamen.has(m[1]!);
    };

    return fehler.map((f) => {
      const pfad = f.zeile != null ? pfadZu(f.zeile) : undefined;
      const erweiterung = (!!pfad && istErweiterungsPfad(pfad)) || nenntErweiterung(f.text);
      const e: ReportEintrag = { text: f.text };
      if (pfad) e.pfad = pfad;
      if (erweiterung) e.erweiterung = true;
      return e;
    });
  }

  /** Gehen alle Fehler auf bekannte Schema-Erweiterungen zurueck? */
  nurErweiterungsFehler(eintraege: ReportEintrag[]): boolean {
    return eintraege.length > 0 && eintraege.every((e) => e.erweiterung);
  }

  /**
   * Fehler auf Baum-Pfade aufloesen, Marker-Signals setzen und die Eintraege
   * fuer den klickbaren Validierungsbericht liefern (gleiche Reihenfolge).
   * Erweiterungs-bedingte Fehler werden nicht als rote Baum-Marker gesetzt —
   * die Erweiterungs-Kennzeichnung der Box selbst reicht.
   */
  markiere(
    fehler: ValidierungsFehler[],
    zeilenPfade: ReadonlyMap<number, string>,
  ): ReportEintrag[] {
    const eintraege = this.ordneZu(fehler, zeilenPfade);

    const proPfad = new Map<string, string[]>();
    for (const e of eintraege) {
      if (e.pfad && !e.erweiterung) proPfad.set(e.pfad, [...(proPfad.get(e.pfad) ?? []), e.text]);
    }

    // Vorfahren-Aggregat analog diffAnc: je Fehlerpfad alle Praefixe zaehlen.
    // Praefixgrenzen sind '/' und '@' — vor dem '@' liegt das Elternelement
    // der Auspraegung, das ebenfalls mitzaehlt (Praefix-Logik wie openPathTo).
    const anc = new Map<string, number>();
    for (const [pfad, texte] of proPfad) {
      for (let i = 0; i < pfad.length; i++) {
        if (pfad[i] === '/' || pfad[i] === '@') {
          const p = pfad.slice(0, i);
          anc.set(p, (anc.get(p) ?? 0) + texte.length);
        }
      }
    }
    this.state.valFehler.set(proPfad.size ? proPfad : null);
    this.state.valAnc.set(anc.size ? anc : null);
    return eintraege;
  }

  loesche(): void {
    this.state.clearValidierungsMarker();
  }
}
