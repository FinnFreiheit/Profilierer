import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
import { NavService } from '../../core/services/nav.service';
import { ToastService } from '../../core/services/toast.service';
import { LoggerService } from '../../core/services/logger.service';
import { pretty } from '../../core/util/pretty.util';
import { hinweisFehlerText, hinweisHerkunft } from '../../core/util/hinweis.util';
import { Hinweis } from '../../models/profile.model';

/**
 * Uebersicht aller Hinweise (US "Hinweis pro Element"): jeder Hinweis steht
 * einzeln in der Liste — mehrere am selben Element nebeneinander —, Klick
 * springt zum Element, die Checkbox arbeitet ihn ab (reaktivierbar), das Kreuz
 * loescht ihn. Geoeffnet per open() aus der Toolbar (Muster MetaDialog); die
 * Liste kommt reaktiv aus dem HinweisStoreService.
 */
@Component({
  selector: 'app-hinweise-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hinweise-dialog.html',
})
export class HinweiseDialog {
  private readonly state = inject(StateService);
  protected readonly hinweise = inject(HinweisStoreService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerService);

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  open(): void {
    this.dlg().nativeElement.showModal();
  }

  protected schliesse(): void {
    this.dlg().nativeElement.close();
  }

  /** Sprung zum betroffenen Knoten — der modale Dialog muss vorher zu. */
  protected springe(pfad: string): void {
    this.schliesse();
    this.nav.jumpTo(pfad);
  }

  protected async toggleErledigt(id: string, e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const checked = el.checked;
    // Scheitert das Schreiben, bleibt der Store unveraendert — die Checkbox
    // haette ihren neuen Zustand dann behalten, obwohl nichts passiert ist.
    if (!(await this.melde(this.hinweise.aendern(id, { erledigt: checked }))))
      el.checked = !checked;
  }

  protected loesche(id: string): void {
    void this.melde(this.hinweise.loeschen(id));
  }

  /** Sprechendes Label: letztes Pfadsegment, bei Auspraegungs-Pfaden mit Namen. */
  protected label(pfad: string): string {
    const seg = pfad.split('/').pop() ?? pfad;
    return seg.includes('@') ? this.state.auspLabel(pfad) : pretty(seg);
  }

  /**
   * Herkunft eines Eintrags: „Müller (BLK-AG), 26.07.30" (Issue #40).
   * Migrierte Altbestaende ohne Autor zeigen nur das Datum.
   */
  protected herkunft(h: Hinweis): string {
    return hinweisHerkunft(h);
  }

  /**
   * Schreibfehler sichtbar machen — der Store haelt sonst einen alten Stand.
   * Gibt zurueck, ob der Schreibvorgang durchging.
   */
  private async melde(p: Promise<unknown>): Promise<boolean> {
    try {
      await p;
      return true;
    } catch (e) {
      this.log.error('Hinweise', 'Schreiben fehlgeschlagen', e);
      this.toast.show(hinweisFehlerText(e));
      return false;
    }
  }
}
