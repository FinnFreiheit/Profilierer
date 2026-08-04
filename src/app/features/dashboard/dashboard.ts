import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { PersistenceService } from '../../core/services/persistence.service';
import { ToastService } from '../../core/services/toast.service';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { RolleService } from '../../core/services/rolle.service';
import { VergleichService } from '../../core/services/vergleich.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
import { TestnachrichtStartService } from '../../core/services/testnachricht-start.service';
import { RolleBadge } from '../../shared/rolle-badge/rolle-badge';
import { Menu } from '../../shared/menu/menu';
import { LibraryEntry } from '../../models/profile.model';
import { nachFachmodul } from '../../core/util/fachmodul.util';

/**
 * Ein Abschnitt der Bibliothek: seit #88 je Fachmodul einer. Die Abnahme
 * gruppiert nicht mehr — sie ist ein Zustand der einzelnen Profilierung
 * (Kennzeichen auf der Kachel, Filter in der Kopfzeile), kein Ordnungskriterium.
 */
interface Sektion {
  /** Fachmodul-Kuerzel; leer = Profilierungen ohne erkennbare Nachricht. */
  modul: string;
  items: LibraryEntry[];
}

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
  imports: [RolleBadge, Menu],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly store = inject(ProfileStoreService);
  protected readonly rolle = inject(RolleService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly vergleich = inject(VergleichService);
  private readonly hinweise = inject(HinweisStoreService);
  private readonly testnachrichtStart = inject(TestnachrichtStartService);
  private readonly renameDlg = viewChild.required<ElementRef<HTMLDialogElement>>('renameDlg');
  private readonly abnahmeDlg = viewChild.required<ElementRef<HTMLDialogElement>>('abnahmeDlg');

  /** Filter "nur abgenommene" (valide Vorlagen der BLK-AG schnell finden). */
  protected readonly nurAbgenommene = signal(false);

  /**
   * Filter "nur mit offenen Hinweisen" (Issue #43): die AG grenzt ihre
   * Sitzungsvorbereitung auf das ein, wo Rueckmeldungen liegen. Kombinierbar
   * mit "nur abgenommene" — beide Filter greifen nacheinander.
   */
  protected readonly nurMitHinweisen = signal(false);

  /**
   * Ein Abschnitt je Fachmodul (#88). Die beiden Filter greifen davor, sodass
   * nur Module mit Treffern erscheinen — eine leere Gruppenueberschrift waere
   * beim Filtern nur Rauschen.
   */
  protected readonly sektionen = computed<Sektion[]>(() => {
    let alle = this.store.entries();
    if (this.nurMitHinweisen()) alle = alle.filter((e) => !!e.nHinweiseOffen);
    if (this.nurAbgenommene()) alle = alle.filter((e) => !!e.abgenommen);
    return nachFachmodul(alle, (e) => e.nachricht).map((g) => ({ modul: g.modul, items: g.items }));
  });

  /** Ueberschrift eines Abschnitts; ohne erkennbares Modul eine Sammelgruppe. */
  protected modulTitel(modul: string): string {
    return modul || 'ohne Nachricht';
  }

  /**
   * Nachrichtenname, in der Mitte gekuerzt: der vordere Teil schrumpft, das
   * letzte Segment (die Nummer, an der die Nachricht wiedererkannt wird)
   * bleibt stehen. Reines CSS kann nur am Ende kuerzen — genau dort steht aber
   * das Unterscheidende.
   */
  protected msgKopf(e: LibraryEntry): string {
    const n = e.nachricht ?? '';
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(0, i) : n;
  }

  protected msgEnde(e: LibraryEntry): string {
    const n = e.nachricht ?? '';
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(i) : '';
  }

  /**
   * Was frueher als eigene Pillen auf der Kachel stand und ihre Hoehe
   * schwanken liess: XJustiz-Version, eingefrorene Staende, Entwurfs-Kennzeichen.
   */
  protected fussTitel(e: LibraryEntry): string {
    const teile: string[] = [];
    if (e.xjustizVersion) teile.push(`XJustiz ${e.xjustizVersion}`);
    if (e.nVersionen) teile.push(`${e.nVersionen} Version${e.nVersionen === 1 ? '' : 'en'}`);
    if (e.geaendert && e.letzteVersionNr) teile.push(`geändert seit v${e.letzteVersionNr}`);
    return teile.join(' · ');
  }

  /**
   * Beschriftung des Rueckmelde-Badges: "3 Hinweise (2 extern)". Ohne externe
   * Rueckmeldungen entfaellt der Klammerzusatz (Issue #43).
   */
  protected hinweisBadge(e: LibraryEntry): string {
    const n = e.nHinweiseOffen ?? 0;
    const extern = e.nHinweiseExtern ?? 0;
    return `${n} ${n === 1 ? 'Hinweis' : 'Hinweise'}${extern ? ` (${extern} extern)` : ''}`;
  }

  /**
   * Klick auf das Badge: Profilierung oeffnen und die Hinweis-Uebersicht
   * gleich mit — der Weg von "wo liegt etwas?" zu "was steht da?" (Issue #43).
   */
  protected zeigeHinweise(id: string, e: Event): void {
    e.stopPropagation();
    this.hinweise.uebersichtAnfrage.set(true);
    this.open(id);
  }

  /**
   * Einstieg an der Profil-Kachel (Issue #35): der gefuehrte Durchlauf mit
   * Fassungswahl — derselbe Ablauf wie im Testdaten-Speicher, kein zweiter
   * Weg. Die Kachel kennt ihn nur; gestartet wird er dort, wo er lebt.
   */
  protected testnachrichtErstellen(e: LibraryEntry, ev: Event): void {
    ev.stopPropagation();
    this.testnachrichtStart.anfrage.set(e);
    this.state.view.set('testdaten');
  }

  /** Zum Testdaten-Speicher wechseln. */
  protected goTestdaten(): void {
    this.state.view.set('testdaten');
  }

  /** US "Schema ansehen": reine Schema-Ansicht ohne Profilierung oeffnen. */
  protected schemaAnsehen(): void {
    this.nav.openSchemaView();
  }

  protected readonly renId = signal<string | null>(null);
  protected readonly renName = signal('');

  protected open(id: string): void {
    // Warnhinweis der AG-Rolle: ein geschuetzter Stand wird nie versehentlich
    // angefasst — Aenderungen erzeugen das Kennzeichen "geaendert seit Abnahme".
    const e = this.store.entries().find((x) => x.id === id);
    if (e?.abgenommen && this.rolle.agAktiv()) {
      const ok = confirm(
        `„${e.name || '(ohne Namen)'}" ist von der BLK-AG abgenommen.\n` +
          'Änderungen betreffen den geschützten Stand und kennzeichnen ihn als „geändert seit Abnahme“.\n' +
          'Trotzdem öffnen und bearbeiten?',
      );
      if (!ok) return;
    }
    void this.persistence.openFromLibrary(id);
  }

  /** Aktionen, die der Server fuer Externe an abgenommenen Objekten abweist. */
  protected gesperrt(e: LibraryEntry): boolean {
    return !!e.abgenommen && !this.rolle.agAktiv();
  }

  protected createNew(): void {
    void this.persistence.createNew();
  }

  protected duplicate(id: string, e: Event): void {
    e.stopPropagation();
    void this.store
      .duplicate(id)
      .catch(this.toast.fail('Duplizieren fehlgeschlagen — Backend nicht erreichbar.'));
  }

  protected remove(id: string, e: Event): void {
    e.stopPropagation();
    const entry = this.store.entries().find((x) => x.id === id);
    const name = entry?.name || '(ohne Namen)';
    const frage = entry?.abgenommen
      ? `Profil „${name}" ist von der BLK-AG ABGENOMMEN.\nLöschen entfernt den geschützten Stand samt Abnahme-Version unwiderruflich. Wirklich löschen?`
      : `Profil „${name}" wirklich löschen?`;
    if (confirm(frage))
      void this.store
        .delete(id)
        .catch(this.toast.fail('Löschen fehlgeschlagen — Backend nicht erreichbar.'));
  }

  // ── Abnahme (BLK-AG) ────────────────────────────────────────────────

  protected readonly abnId = signal<string | null>(null);
  protected readonly abnKommentar = signal('');
  protected readonly abnEntry = computed(
    () => this.store.entries().find((e) => e.id === this.abnId()) ?? null,
  );

  /**
   * Vergleich gegen die abgenommene Fassung — vom Karten-Badge und aus dem
   * Abnahme-Dialog. stopPropagation, weil ein Klick auf die Karte sonst das
   * Profil oeffnen wuerde.
   */
  protected zeigeAbnahmeDiff(id: string, e: Event): void {
    e.stopPropagation();
    this.abnahmeDlg().nativeElement.close();
    this.vergleich.oeffneProfil(id);
  }

  protected openAbnahme(id: string, e: Event): void {
    e.stopPropagation();
    this.abnId.set(id);
    this.abnKommentar.set('');
    this.abnahmeDlg().nativeElement.showModal();
  }

  protected async abnehmen(): Promise<void> {
    const id = this.abnId();
    if (!id) return;
    try {
      const v = await this.store.abnehmen(id, this.abnKommentar().trim() || undefined);
      this.toast.show(`Abgenommen — Stand als Version v${v.nr} eingefroren.`);
    } catch {
      this.toast.show('Abnahme fehlgeschlagen — Backend nicht erreichbar oder Schlüssel ungültig.');
    }
    this.abnahmeDlg().nativeElement.close();
  }

  protected async abnahmeEntfernen(): Promise<void> {
    const id = this.abnId();
    if (!id) return;
    try {
      await this.store.abnahmeEntfernen(id);
      this.toast.show('Abnahme-Kennzeichen entfernt — die Abnahme-Version bleibt erhalten.');
    } catch {
      this.toast.show(
        'Kennzeichen konnte nicht entfernt werden — Backend nicht erreichbar oder Schlüssel ungültig.',
      );
    }
    this.abnahmeDlg().nativeElement.close();
  }

  /** Anzeigedatum der Abnahme (fuer Badge-Tooltip). */
  protected abnDatum(e: LibraryEntry): string {
    return e.abnahmeZeit
      ? new Date(e.abnahmeZeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
      : '';
  }

  protected async exportEntry(id: string, e: Event): Promise<void> {
    e.stopPropagation();
    try {
      await this.persistence.exportProfil(id);
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
      void this.store
        .rename(id, this.renName())
        .catch(this.toast.fail('Umbenennen fehlgeschlagen — Backend nicht erreichbar.'));
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
  /**
   * Datum der Kachel, einheitlich deutsch formatiert. `meta.gespeichert` liegt
   * als ISO-Datum vor, `aktualisiert` als Zeitstempel — nebeneinander standen
   * auf den Kacheln sonst "2026-07-24" und "3.8.2026" (#88).
   */
  protected datum(e: LibraryEntry): string {
    const roh = e.gespeichert ? new Date(e.gespeichert) : new Date(e.aktualisiert);
    if (Number.isNaN(roh.getTime())) return e.gespeichert ?? '';
    return roh.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
