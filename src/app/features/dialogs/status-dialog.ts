import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { FARBEN, WIRKUNGEN } from '../../core/profile-defaults';
import { Wirkung } from '../../models/profile.model';

/**
 * Status-Konfiguration (openStatusDlg, Profilierer.html Z.297-304, 1669-1702).
 * Natives <dialog> per showModal()/close().
 */
@Component({
  selector: 'app-status-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-dialog.html',
})
export class StatusDialog {
  protected readonly state = inject(StateService);
  protected readonly farben = Object.entries(FARBEN);
  protected readonly wirkungen = WIRKUNGEN;

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  open(): void {
    this.dlg().nativeElement.showModal();
  }

  protected close(): void {
    this.dlg().nativeElement.close();
  }

  protected setName(id: string, e: Event): void {
    this.state.updateStatus(id, { name: (e.target as HTMLInputElement).value.trim() });
  }

  protected setFarbe(id: string, e: Event): void {
    this.state.updateStatus(id, { farbe: (e.target as HTMLSelectElement).value });
  }

  protected setWirkung(id: string, e: Event): void {
    this.state.updateStatus(id, { wirkung: (e.target as HTMLSelectElement).value as Wirkung });
  }

  protected del(id: string): void {
    if (
      this.state.statusUsed(id) &&
      !confirm(
        'Dieser Status ist in Verwendung. Trotzdem löschen? Betroffene Elemente fallen auf „wie Standard" zurück.',
      )
    )
      return;
    this.state.removeStatus(id);
  }

  protected add(): void {
    this.state.addStatus();
  }
}
