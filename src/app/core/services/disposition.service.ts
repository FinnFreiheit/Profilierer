import { Injectable, inject } from '@angular/core';
import { TreeNode } from '../../models/node.model';
import { StateService } from './state.service';
import { TreeService } from './tree.service';
import { NavService } from './nav.service';

/**
 * Zentrale Statusaenderung mit kaskadierender Pflicht-Vorbelegung (US
 * "Pflicht-Vorbelegung kaskadiert"): Erhaelt ein Element eine aufnehmende
 * Disposition (Wirkung `pflicht` oder `optional`), wird das lokale
 * Pflicht-Rueckgrat darunter automatisch als "zwingend" vorbelegt — echte
 * Profildaten, sichtbar, ueberschreibbar. Alle Bedienwege der Disposition
 * (Detailpanel, Tastatur z/o) laufen durch `setzeStatus`.
 */
@Injectable({ providedIn: 'root' })
export class DispositionService {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly nav = inject(NavService);

  /**
   * Status eines Pfads setzen (undefined = "wie Standard"). Bei aufnehmender
   * Wirkung kaskadiert die Zwingend-Vorbelegung in den Teilbaum darunter.
   */
  setzeStatus(path: string, statusId: string | undefined): void {
    this.state.setElementProfile(path, { status: statusId });
    if (!statusId) return;
    const wirkung = this.state.statusById(statusId)?.wirkung;
    if (wirkung === 'pflicht' || wirkung === 'optional') this.kaskadierePflicht(path);
  }

  /**
   * Vertiefter "Pflicht vorbelegen"-Lauf (Bestandsreparatur, US 7-8): belegt
   * das Pflicht-Rueckgrat ab Wurzel vor und steigt zusaetzlich in bereits
   * aufgenommene Teilbaeume ab (Wirkung `pflicht`/`optional` — optionale
   * Elemente wie zugelassene Auswahl-Zweige) sowie in alle Auspraegungen
   * (Pfadraum `…@auspId/…`), um dort die Vorbelegung nachzuholen.
   * Nutzergesteuert (Ansicht-Menue), keine stille Migration beim Oeffnen.
   * Gibt die Anzahl neu gesetzter Elemente zurueck (Toast).
   */
  pflichtVorbelegen(): number {
    const root = this.state.root();
    const pflicht = this.state.pflichtStatus();
    if (!root || !pflicht) return 0;
    const paths = new Set<string>(this.tree.collectMandatoryPaths(root));
    for (const [path, p] of Object.entries(this.state.elemente())) {
      if (!p.status) continue;
      const wirkung = this.state.statusById(p.status)?.wirkung;
      if (wirkung !== 'pflicht' && wirkung !== 'optional') continue;
      for (const mp of this.sammleRueckgrat(path)) paths.add(mp);
    }
    // Eine Auspraegung ist durch ihr Anlegen aufgenommen — jeder Kontextknoten
    // ist ein Anker.
    for (const [listPath, list] of Object.entries(this.state.auspraegungen())) {
      for (const a of list) {
        for (const mp of this.sammleRueckgrat(listPath + '@' + a.id)) paths.add(mp);
      }
    }
    return this.state.prefillStatus([...paths], pflicht.id);
  }

  /**
   * Zwingend-Vorbelegung des Pflicht-Rueckgrats unterhalb des Ankers —
   * nicht-destruktiv (vorhandene Status bleiben), Zielstufe ueber die Wirkung
   * `pflicht` aufgeloest (umbenannte Stufen greifen). Gibt die Anzahl neu
   * gesetzter Elemente zurueck.
   */
  private kaskadierePflicht(path: string): number {
    const pflicht = this.state.pflichtStatus();
    if (!pflicht) return 0;
    return this.state.prefillStatus(this.sammleRueckgrat(path), pflicht.id);
  }

  /** Pfade des Pflicht-Rueckgrats unterhalb des Ankers zum Pfad. */
  private sammleRueckgrat(path: string): string[] {
    const anker = this.ankerNode(path);
    if (!anker || anker.recursive) return [];
    return this.tree.collectMandatoryPaths(anker);
  }

  /** Teilbaum-Anker zum Pfad: Element-Knoten bzw. Auspraegungs-Kontextknoten. */
  private ankerNode(path: string): TreeNode | null {
    const it = this.nav.findItemByPath(path);
    if (!it) return null;
    return it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
  }
}
