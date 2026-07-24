import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { ToastService } from '../../core/services/toast.service';
import { ProfilVersion } from '../../models/profile.model';

/**
 * Versionen des aktiven Profils (US "Profilierung versionieren"): Liste der
 * eingefrorenen Staende mit Anlegen/Wiederherstellen/Loeschen. Geoeffnet per
 * open() aus der Toolbar (Muster MetaDialog); die Liste wird beim Oeffnen und
 * nach jeder Operation vom Backend geladen.
 */
@Component({
  selector: 'app-versions-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './versions-dialog.html',
})
export class VersionsDialog {
  private readonly state = inject(StateService);
  private readonly store = inject(ProfileStoreService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly versionen = signal<ProfilVersion[]>([]);
  protected readonly laedt = signal(false);
  protected readonly kommentar = signal('');
  /** Sperrt die Aktionen waehrend einer laufenden Operation (Doppelklick-Schutz). */
  protected readonly busy = signal(false);

  open(): void {
    this.kommentar.set('');
    this.dlg().nativeElement.showModal();
    void this.ladeListe();
  }

  protected schliesse(): void {
    this.dlg().nativeElement.close();
  }

  private async ladeListe(): Promise<void> {
    const id = this.state.activeProfileId();
    if (!id) return;
    this.laedt.set(true);
    try {
      this.versionen.set(await this.store.listVersions(id));
    } catch {
      this.toast.show('Versionen konnten nicht geladen werden — Backend nicht erreichbar.');
    } finally {
      this.laedt.set(false);
    }
  }

  protected async anlegen(): Promise<void> {
    const id = this.state.activeProfileId();
    if (!id || this.busy()) return;
    this.busy.set(true);
    try {
      // Erst haengende Aenderungen sichern — der Server friert seinen Stand ein.
      await this.persistence.flushAutosave();
      const out = await this.store.createVersion(id, {
        kommentar: this.kommentar().trim() || undefined,
      });
      this.kommentar.set('');
      this.toast.show(
        out.version ? `Version v${out.version.nr} angelegt.` : 'Stand bereits gesichert.',
      );
      await this.ladeListe();
    } catch {
      this.toast.show('Version konnte nicht angelegt werden — Backend nicht erreichbar.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async wiederherstellen(v: ProfilVersion): Promise<void> {
    if (this.busy()) return;
    const ok = confirm(
      `Version v${v.nr} wiederherstellen?\nDer aktuelle Arbeitsstand wird vorher automatisch als Sicherheits-Version gesichert.`,
    );
    if (!ok) return;
    this.busy.set(true);
    try {
      if (await this.persistence.restoreVersion(v.id)) this.schliesse();
    } finally {
      this.busy.set(false);
    }
  }

  protected async loeschen(v: ProfilVersion): Promise<void> {
    const id = this.state.activeProfileId();
    if (!id || this.busy()) return;
    if (!confirm(`Version v${v.nr} wirklich löschen?`)) return;
    this.busy.set(true);
    try {
      await this.store.deleteVersion(id, v.id);
      this.toast.show(`Version v${v.nr} gelöscht.`);
      await this.ladeListe();
    } catch {
      this.toast.show('Version konnte nicht gelöscht werden — Backend nicht erreichbar.');
    } finally {
      this.busy.set(false);
    }
  }

  protected datum(v: ProfilVersion): string {
    return new Date(v.erstellt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }
}
