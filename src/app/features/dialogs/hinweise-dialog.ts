import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { pretty } from '../../core/util/pretty.util';

/**
 * Uebersicht aller internen Hinweise (US "Hinweis pro Element"): Liste der
 * offenen und erledigten Hinweise, Klick springt zum Element, Checkbox
 * arbeitet den Hinweis ab (reaktivierbar). Geoeffnet per open() aus der
 * Toolbar (Muster MetaDialog); die Liste kommt reaktiv aus dem StateService.
 */
@Component({
  selector: 'app-hinweise-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hinweise-dialog.html',
})
export class HinweiseDialog {
  protected readonly state = inject(StateService);
  private readonly nav = inject(NavService);
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

  protected toggleErledigt(pfad: string, e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.state.setElementProfile(pfad, { hinweisErledigt: checked || undefined });
  }

  /** Sprechendes Label: letztes Pfadsegment, bei Auspraegungs-Pfaden mit Namen. */
  protected label(pfad: string): string {
    const seg = pfad.split('/').pop() ?? pfad;
    return seg.includes('@') ? this.state.auspLabel(pfad) : pretty(seg);
  }
}
