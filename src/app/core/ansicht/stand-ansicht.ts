import { Injectable, computed, inject } from '@angular/core';
import { itemPath } from '../../models/node.model';
import { StateService } from '../services/state.service';
import { TreeService } from '../services/tree.service';
import { GuidedService } from '../services/guided.service';
import { unterPfad } from '../util/pfad.util';
import { pretty } from '../util/pretty.util';

/**
 * Der Stand eines Astes — eines direkten Kindes der Nachrichtenwurzel. Die
 * Zahl am Chip beantwortet die Frage "wie weit bin ich hier", nicht "wie viele
 * Elemente hat der Ast": gezaehlt werden Entscheidungspunkte (GuidedService),
 * nicht Knoten.
 */
export interface AstStand {
  path: string;
  name: string;
  /** Entscheidungspunkte auf und unter dem Ast. */
  gesamt: number;
  /** Davon mit eigener Antwort. */
  entschieden: number;
  /** Davon noch offen. */
  offen: number;
  /** Davon geparkt („zu klären", #41) — weder offen noch beantwortet. */
  geparkt: number;
  /** Alle Punkte des Astes beantwortet (und es gibt welche). */
  vollstaendig: boolean;
  /** Die Auswahl liegt auf oder unter dem Ast. */
  aktiv: boolean;
}

/** Leere Menge fuer die Faelle, in denen gar nicht gezaehlt wird. */
const LEER: ReadonlySet<string> = new Set<string>();

/**
 * Ableitung fuer die Arbeits-Zeile (Editor v4): Stand der Profilierung je Ast
 * und die Zaehler der farbigen Umrandung. DOM-frei wie die uebrigen
 * Ansichts-Ableitungen — die Aussage steht hier, die Werkzeugleiste zeigt sie
 * nur an.
 */
@Injectable({ providedIn: 'root' })
export class StandAnsicht {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly guided = inject(GuidedService);

  /**
   * Die Aeste der Nachricht: ihre Top-Level-Kinder. Die Zuordnung der
   * Entscheidungspunkte laeuft ueber die Pfad-Grammatik (`unterPfad`) — ein
   * Punkt in einem Vorkommen (`…/beteiligung@a1/rolle`) zaehlt zum Ast
   * `…/beteiligung`.
   */
  readonly aeste = computed<AstStand[]>(() => {
    const root = this.tree.rootItem();
    if (!root) return [];
    const sel = this.state.selItem();
    const selPfad = sel ? itemPath(sel) : null;
    // Schema-Ansicht: es wird nichts entschieden und nichts gespeichert. Die
    // Chips stehen dort ohne Zahlen — und `punkte()` bleibt ungelesen, damit
    // das blosse Anzeigen des Aufbaus nicht den ganzen Struktur-Walk auslöst.
    const ohneZahlen = this.state.schemaView();
    const punkte = ohneZahlen ? [] : this.guided.punkte();
    const offeneSet = ohneZahlen ? LEER : this.guided.offeneSet();
    const geparkteSet = ohneZahlen ? LEER : this.guided.geparkteSet();
    // Im Durchlauf einer Nachricht zaehlen nur die geschuldeten Angaben — die
    // gleiche Basis wie `fortschritt()`, sonst nennten Chips und Stand daneben
    // verschiedene Nenner (ADR 0016).
    const instanz = this.guided.instanzModus();
    return this.tree.childItems(root).map((it) => {
      const path = itemPath(it);
      let gesamt = 0;
      let offen = 0;
      let geparkt = 0;
      for (const p of punkte) {
        if (!unterPfad(p.path, path)) continue;
        if (instanz && !this.guided.zaehltZurPflicht(p)) continue;
        gesamt++;
        if (offeneSet.has(p.path)) offen++;
        else if (geparkteSet.has(p.path)) geparkt++;
      }
      return {
        path,
        name: it.kind === 'ausp' ? it.ausp.name : pretty(it.node.name),
        gesamt,
        // Geparkte Punkte sind vertagt, nicht beantwortet: sie duerfen weder
        // als Arbeit zaehlen noch den Ast als erledigt ausweisen (#41).
        entschieden: gesamt - offen - geparkt,
        offen,
        geparkt,
        vollstaendig: gesamt > 0 && offen === 0 && geparkt === 0,
        aktiv: !!selPfad && unterPfad(selPfad, path),
      };
    });
  });

  /** Stand ueber die ganze Nachricht — die Zahl links in der Arbeits-Zeile. */
  readonly gesamt = computed(() => this.guided.fortschritt());

  /**
   * Zaehler der drei Hervorhebungen im Ansicht-Menue. "offen" und
   * "beantwortet" zaehlen Entscheidungspunkte — dieselbe Zaehlweise, nach der
   * der Baum faerbt (`BaumkastenAnsicht.markiert`) und nach der der Stand links
   * in der Zeile rechnet: beantwortet ist ein Punkt, der weder offen noch
   * geparkt ("zu klaeren") ist. Eine Notiz dagegen kann auch an einem Element
   * haengen, das gar kein Entscheidungspunkt ist — sie zaehlt an den
   * Eintraegen der Profilierung.
   */
  readonly hervorhebungZaehler = computed<{ offen: number; beantwortet: number; notiz: number }>(
    () => {
      let notiz = 0;
      for (const e of Object.values(this.state.elemente())) {
        if (e.anmerkung?.trim()) notiz++;
      }
      const offen = this.guided.offeneSet().size;
      const beantwortet = this.guided.punkte().length - offen - this.guided.geparkteSet().size;
      return { offen, beantwortet, notiz };
    },
  );
}
