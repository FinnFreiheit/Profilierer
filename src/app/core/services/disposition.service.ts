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
   * Zwingend-Vorbelegung des Pflicht-Rueckgrats unterhalb des Ankers —
   * nicht-destruktiv (vorhandene Status bleiben), Zielstufe ueber die Wirkung
   * `pflicht` aufgeloest (umbenannte Stufen greifen). Gibt die Anzahl neu
   * gesetzter Elemente zurueck.
   */
  private kaskadierePflicht(path: string): number {
    const pflicht = this.state.pflichtStatus();
    if (!pflicht) return 0;
    const anker = this.ankerNode(path);
    if (!anker || anker.recursive) return 0;
    return this.state.prefillStatus(this.tree.collectMandatoryPaths(anker), pflicht.id);
  }

  /** Teilbaum-Anker zum Pfad: Element-Knoten bzw. Auspraegungs-Kontextknoten. */
  private ankerNode(path: string): TreeNode | null {
    const it = this.nav.findItemByPath(path);
    if (!it) return null;
    return it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
  }
}
