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
import { TeilenService } from '../../core/services/teilen.service';
import { BetaBadge } from '../../shared/beta-badge/beta-badge';
import { RolleBadge } from '../../shared/rolle-badge/rolle-badge';
import { Menu } from '../../shared/menu/menu';
import { LibraryEntry } from '../../models/profile.model';
import { fachmodulOf, nachFachmodul } from '../../core/util/fachmodul.util';
import { ERW_SPERRE_GRUND, sperrtPruefartefakte } from '../../core/util/erweiterung-sperre';
import { nachrichtTeile } from '../../core/util/pretty.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { NeuesProfilWizard } from '../dialogs/neues-profil-wizard';
import { SchemaSuche } from './schema-suche';
import { TagFilter } from '../../shared/tag-filter/tag-filter';
import { TagEingabe } from '../../shared/tag-eingabe/tag-eingabe';
import { ProjektStoreService } from '../../core/services/projekt-store.service';
import { EinordnenService } from '../../core/services/einordnen.service';
import {
  hatAlleTags,
  normalisiereTags,
  schalteTag,
  tagOptionen,
  tagsAlsText,
} from '../../core/util/tags.util';

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
  imports: [
    BetaBadge,
    RolleBadge,
    Menu,
    KeinAutofillDirective,
    NeuesProfilWizard,
    TagFilter,
    TagEingabe,
    SchemaSuche,
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly store = inject(ProfileStoreService);
  protected readonly projekte = inject(ProjektStoreService);
  private readonly einordnen = inject(EinordnenService);
  protected readonly rolle = inject(RolleService);
  private readonly persistence = inject(PersistenceService);
  private readonly toast = inject(ToastService);
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);
  private readonly vergleich = inject(VergleichService);
  private readonly hinweise = inject(HinweisStoreService);
  private readonly testnachrichtStart = inject(TestnachrichtStartService);
  private readonly teilenService = inject(TeilenService);
  private readonly renameDlg = viewChild.required<ElementRef<HTMLDialogElement>>('renameDlg');
  private readonly neuWizard = viewChild.required<NeuesProfilWizard>('neuWizard');
  private readonly abnahmeDlg = viewChild.required<ElementRef<HTMLDialogElement>>('abnahmeDlg');

  /**
   * Freitextsuche ueber die Bibliothek (#92) — wie im Testdaten-Speicher.
   * Durchsucht wird, was auf der Kachel steht bzw. sie ordnet: Name,
   * Nachrichtenname und Fachmodul.
   */
  protected readonly search = signal('');

  /** Filter "nur abgenommene" (valide Vorlagen der BLK-AG schnell finden). */
  protected readonly nurAbgenommene = signal(false);

  /**
   * Filter "nur mit offenen Hinweisen" (Issue #43): die AG grenzt ihre
   * Sitzungsvorbereitung auf das ein, wo Rueckmeldungen liegen. Kombinierbar
   * mit "nur abgenommene" — beide Filter greifen nacheinander.
   */
  protected readonly nurMitHinweisen = signal(false);

  /**
   * Gewaehlte Schlagworte der Filterleiste. Mehrere wirken zusammen (UND) —
   * jeder Klick grenzt weiter ein.
   */
  protected readonly gewaehlteTags = signal<string[]>([]);

  /**
   * Filter "nur ein Projekt" (#134). Steht neben den uebrigen Filtern, statt
   * die Gruppierung zu ersetzen: die Abschnitte bleiben je Fachmodul, ein
   * gewaehltes Projekt grenzt sie nur ein.
   */
  protected readonly nurProjekt = signal('');

  /** Vergebene Schlagworte der Bibliothek mit Haeufigkeit (Filterleiste). */
  protected readonly verfuegbareTags = computed(() =>
    tagOptionen(this.store.entries(), (e) => e.tags),
  );

  /**
   * Ein Abschnitt je Fachmodul (#88). Die Filter greifen davor, sodass nur
   * Module mit Treffern erscheinen — eine leere Gruppenueberschrift waere beim
   * Filtern nur Rauschen.
   */
  protected readonly sektionen = computed<Sektion[]>(() => {
    const q = this.search().trim().toLowerCase();
    let alle = this.store.entries();
    if (q) alle = alle.filter((e) => this.trifft(e, q));
    if (this.nurMitHinweisen()) alle = alle.filter((e) => !!e.nHinweiseOffen);
    if (this.nurAbgenommene()) alle = alle.filter((e) => !!e.abgenommen);
    const tags = this.gewaehlteTags();
    if (tags.length) alle = alle.filter((e) => hatAlleTags(e.tags, tags));
    const projekt = this.nurProjekt();
    if (projekt) alle = alle.filter((e) => e.projektId === projekt);
    return nachFachmodul(alle, (e) => e.nachricht).map((g) => ({ modul: g.modul, items: g.items }));
  });

  /**
   * Sucht in Name, Nachrichtenname, Fachmodul und dem, was neuerdings auf der
   * Kachel steht (Autor, Beschreibung, Schlagworte). Das Fachmodul steckt zwar
   * schon im Nachrichtennamen, wird aber eigens geprueft: es ist die
   * Gruppenueberschrift, und wer "enova" tippt, meint die Gruppe.
   */
  private trifft(e: LibraryEntry, q: string): boolean {
    return [
      e.name,
      e.nachricht,
      fachmodulOf(e.nachricht),
      e.autor,
      e.beschreibung,
      ...(e.tags ?? []),
    ].some((v) => (v || '').toLowerCase().includes(q));
  }

  /** Tooltip der Kachelzeile: Autor und vollstaendige Beschreibung. */
  protected beschreibungTitel(e: LibraryEntry): string {
    return [e.autor, e.beschreibung].filter(Boolean).join(' · ');
  }

  /** Ist das Schlagwort gerade als Filter gesetzt (Kachel-Chip hervorheben)? */
  protected tagAktiv(tag: string): boolean {
    const schluessel = tag.toLocaleLowerCase('de');
    return this.gewaehlteTags().some((t) => t.toLocaleLowerCase('de') === schluessel);
  }

  /**
   * Klick auf ein Schlagwort der Kachel: dasselbe wie ein Klick in der
   * Filterleiste — an- bzw. abwaehlen. `stopPropagation`, sonst oeffnete der
   * Klick die Profilierung darunter.
   */
  protected filtereNachTag(tag: string, ev: Event): void {
    ev.stopPropagation();
    this.gewaehlteTags.set(schalteTag(this.gewaehlteTags(), tag));
  }

  /** Ueberschrift eines Abschnitts; ohne erkennbares Modul eine Sammelgruppe. */
  protected modulTitel(modul: string): string {
    return modul || 'ohne Nachricht';
  }

  /** Nachrichtenname fuer die Mitte-Kuerzung (gemeinsam mit dem Testdatenspeicher). */
  protected msgKopf(e: LibraryEntry): string {
    return nachrichtTeile(e.nachricht).kopf;
  }

  protected msgEnde(e: LibraryEntry): string {
    return nachrichtTeile(e.nachricht).ende;
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

  /** Schema-Erweiterungen sperren die Testnachricht-Erstellung (#98). */
  protected erwSperre(e: LibraryEntry): boolean {
    return sperrtPruefartefakte(e.nErw);
  }

  /** Der `title` des Menuepunkts erklaert die Sperre, sonst den Ablauf. */
  protected testnachrichtTitel(e: LibraryEntry): string {
    return this.erwSperre(e)
      ? ERW_SPERRE_GRUND
      : 'Testnachricht zu dieser Profilierung erstellen — geführter Durchlauf mit Wahl der zu bindenden Fassung';
  }

  /** Zum Testdaten-Speicher wechseln. */
  /** Zur Projektansicht (#135) — Vorhaben mit ihren Kommunikationsszenarien. */
  protected goProjekte(): void {
    this.state.view.set('projekte');
  }

  protected goTestdaten(): void {
    this.state.view.set('testdaten');
  }

  /** Zur bebilderten Anleitung wechseln. */
  protected goHowto(): void {
    this.state.view.set('howto');
  }

  /** Zu den Kennzahlen wechseln (nur mit AG-Rolle sichtbar). */
  protected goKennzahlen(): void {
    this.state.view.set('kennzahlen');
  }

  /** US "Schema ansehen": reine Schema-Ansicht ohne Profilierung oeffnen. */
  protected schemaAnsehen(): void {
    this.nav.openSchemaView();
  }

  /** Einordnen (#145): ein Dialog fuer Projekt und Schlagworte, global. */
  protected openAblage(e: LibraryEntry, ev: Event): void {
    ev.stopPropagation();
    this.einordnen.oeffneProfil(e.id);
  }

  /** Metadaten-Dialog der Kachel: aktive id + Puffer der vier Felder. */
  protected readonly renId = signal<string | null>(null);
  protected readonly renName = signal('');
  protected readonly renAutor = signal('');
  protected readonly renBeschr = signal('');
  protected readonly renTags = signal('');

  protected open(id: string): void {
    // Warnhinweis der AG-Rolle: ein geschuetzter Stand wird nie versehentlich
    // angefasst — Aenderungen erzeugen das Kennzeichen "geaendert seit Freigabe".
    const e = this.store.entries().find((x) => x.id === id);
    if (e?.abgenommen && this.rolle.agAktiv()) {
      const ok = confirm(
        `„${e.name || '(ohne Namen)'}" ist von der BLK-AG freigegeben.\n` +
          'Änderungen betreffen den geschützten Stand und kennzeichnen ihn als „geändert seit Freigabe“.\n' +
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

  /**
   * „Neues Profil": der gefuehrte Anlege-Durchlauf (Version → Nachricht →
   * Angaben). Der Bibliothekseintrag entsteht erst am Ende des Wizards.
   */
  protected createNew(): void {
    this.neuWizard().open();
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
      ? `Profil „${name}" ist von der BLK-AG FREIGEGEBEN.\nLöschen entfernt den geschützten Stand samt Freigabe-Version unwiderruflich. Wirklich löschen?`
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
      this.toast.show(`Freigegeben — Stand als Version v${v.nr} eingefroren.`);
    } catch {
      this.toast.show(
        'Freigabe fehlgeschlagen — Backend nicht erreichbar oder Schlüssel ungültig.',
      );
    }
    this.abnahmeDlg().nativeElement.close();
  }

  protected async abnahmeEntfernen(): Promise<void> {
    const id = this.abnId();
    if (!id) return;
    try {
      await this.store.abnahmeEntfernen(id);
      this.toast.show('Freigabe-Kennzeichen entfernt — die Freigabe-Version bleibt erhalten.');
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

  /**
   * Link auf diese Profilierung kopieren. Geteilt wird der Bibliothekseintrag,
   * nicht eine Kopie — der Empfaenger sieht den jeweils aktuellen Stand.
   */
  protected teilen(id: string, e: Event): void {
    e.stopPropagation();
    void this.teilenService.kopiereProfilLink(id);
  }

  /**
   * Metadaten-Dialog der Kachel: Name, Autor, Beschreibung und Schlagworte,
   * ohne die Profilierung zu oeffnen. Derselbe Satz Felder wie „Details…" im
   * Editor — wer nur einsortieren will, muss dafuer kein Schema laden.
   */
  protected openRename(id: string, e: Event): void {
    e.stopPropagation();
    const entry = this.store.entries().find((x) => x.id === id);
    this.renId.set(id);
    this.renName.set(entry?.name || '');
    this.renAutor.set(entry?.autor || '');
    this.renBeschr.set(entry?.beschreibung || '');
    this.renTags.set(tagsAlsText(entry?.tags));
    this.renameDlg().nativeElement.showModal();
  }

  protected submitRename(): void {
    const id = this.renId();
    if (id)
      void this.store
        .patchMeta(id, {
          name: this.renName().trim(),
          autor: this.renAutor().trim(),
          beschreibung: this.renBeschr().trim(),
          tags: normalisiereTags(this.renTags()),
        })
        .catch(this.toast.fail('Speichern fehlgeschlagen — Backend nicht erreichbar.'));
    this.renameDlg().nativeElement.close();
  }

  protected onImport(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void this.persistence.loadProfileFile(f);
    input.value = '';
  }

  /** Fortschritt-Text je Karte (wie toolbar.fortschrittText). */
  /**
   * Fusszeile der Kachel. Liegt der Stand der Entscheidungspunkte vor (#93),
   * zeigt sie ihn — dieselbe Aussage wie der Editor oben rechts. Im Altbestand
   * (noch kein Autosave seit der Umstellung) bleibt es bei den Festlegungen.
   */
  protected fortschritt(e: LibraryEntry): string {
    const anteil = this.anteil(e);
    if (anteil !== null) return `${e.nEntschieden} von ${e.nPunkte} entschieden`;
    if (!e.nStatus && !e.nAusp) return 'noch leer';
    return `${e.nStatus} Festlegungen${e.nAusp ? ' · ' + e.nAusp + ' Ausprägungen' : ''}`;
  }

  /**
   * Anteil entschiedener Punkte (0-1), oder `null`, wenn er nicht bekannt ist —
   * dann zeigt die Kachel keinen Balken statt einen erfundenen.
   */
  protected anteil(e: LibraryEntry): number | null {
    const { nEntschieden: x, nPunkte: y } = e;
    if (typeof x !== 'number' || typeof y !== 'number' || y <= 0) return null;
    return Math.min(1, Math.max(0, x / y));
  }

  /** Ausgeschriebener Prozentwert fuer den Tooltip des Balkens. */
  protected anteilText(e: LibraryEntry): string {
    const a = this.anteil(e);
    return a === null ? '' : `${Math.round(a * 100)} % entschieden`;
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
