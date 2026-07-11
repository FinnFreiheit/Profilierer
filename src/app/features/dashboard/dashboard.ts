import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { ToastService } from '../../core/services/toast.service';
import { LibraryEntry } from '../../models/profile.model';

/**
 * Dashboard / Startseite: die Bibliothek gespeicherter Profilierungen als
 * Karten-Grid. Von hier werden Profile geoeffnet, neu angelegt, dupliziert,
 * umbenannt, geloescht sowie als Datei exportiert/importiert.
 *
 * Bleibt duenn: die Bibliotheks-CRUD liegt im ProfileStoreService, die
 * Oeffnen-/Neu-/Import-/Export-Orchestrierung im PersistenceService.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly store = inject(ProfileStoreService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly renameDlg = viewChild.required<ElementRef<HTMLDialogElement>>('renameDlg');

  /** Bibliotheksfehler (Backend nicht erreichbar) einheitlich melden. */
  private fail(msg: string): (e: unknown) => void {
    return () => this.toast.show(msg);
  }

  protected readonly renId = signal<string | null>(null);
  protected readonly renName = signal('');

  protected open(id: string): void {
    void this.persistence.openFromLibrary(id);
  }

  protected createNew(): void {
    void this.persistence.createNew();
  }

  protected duplicate(id: string, e: Event): void {
    e.stopPropagation();
    void this.store.duplicate(id).catch(this.fail('Duplizieren fehlgeschlagen — Backend nicht erreichbar.'));
  }

  protected remove(id: string, e: Event): void {
    e.stopPropagation();
    const entry = this.store.entries().find((x) => x.id === id);
    if (confirm(`Profil „${entry?.name || '(ohne Namen)'}" wirklich löschen?`))
      void this.store.delete(id).catch(this.fail('Löschen fehlgeschlagen — Backend nicht erreichbar.'));
  }

  protected async exportEntry(id: string, e: Event): Promise<void> {
    e.stopPropagation();
    try {
      const doc = await this.store.load(id);
      if (doc) this.persistence.exportDoc(doc);
    } catch {
      this.toast.show('Export fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  protected openRename(id: string, e: Event): void {
    e.stopPropagation();
    const entry = this.store.entries().find((x) => x.id === id);
    this.renId.set(id);
    this.renName.set(entry?.name || '');
    this.renameDlg().nativeElement.showModal();
  }

  protected submitRename(): void {
    const id = this.renId();
    if (id)
      void this.store.rename(id, this.renName()).catch(this.fail('Umbenennen fehlgeschlagen — Backend nicht erreichbar.'));
    this.renameDlg().nativeElement.close();
  }

  protected onImport(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void this.persistence.loadProfileFile(f);
    input.value = '';
  }

  /** Fortschritt-Text je Karte (wie toolbar.fortschrittText). */
  protected fortschritt(e: LibraryEntry): string {
    if (!e.nStatus && !e.nAusp) return 'noch leer';
    return `${e.nStatus} Festlegungen${e.nAusp ? ' · ' + e.nAusp + ' Ausprägungen' : ''}`;
  }

  /** Anzeigedatum: fachliches Speicherdatum, sonst letzte Sicherung. */
  protected datum(e: LibraryEntry): string {
    return e.gespeichert || new Date(e.aktualisiert).toLocaleDateString('de-DE');
  }
}
