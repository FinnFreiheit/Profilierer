import { Injectable, inject, signal } from '@angular/core';
import { LibraryEntry, ProfileDoc, ProfilVersion } from '../../models/profile.model';

/** Patch fuer PATCH /api/profiles/:id — nur gesetzte Felder werden geaendert. */
export interface ProfilMetaPatch {
  name?: string;
  autor?: string;
  beschreibung?: string;
  tags?: string[];
}
import { LoggerService } from './logger.service';
import { BackendClient } from './backend-client.service';
import { mitEintrag, neuesteZuerst, ohneEintrag } from '../util/eintragsliste.util';

/** Eine Version samt eingefrorenem Dokument (Vergleichs-Endpunkte). */
export interface VersionMitDoc extends ProfilVersion {
  doc: ProfileDoc;
}

/**
 * Persistenz-Layer der Profil-Bibliothek — spricht das Backend (SQLite) per
 * nativem fetch an (konsistent mit BundledSchemaService/CodelistService). Ein
 * schlanker Index (`GET /api/profiles` → LibraryEntry[]) fuellt das reaktive
 * `entries`-Signal fuers Dashboard; das komplette Dokument wird je Profil einzeln
 * geladen (`GET /api/profiles/:id`).
 *
 * Bewusst "dumm": kennt weder StateService noch das aktive Profil. Die
 * Verdrahtung (Autosave, Oeffnen-Fluss, Migration) uebernehmen PersistenceService
 * bzw. MigrationService — so entsteht kein DI-Zyklus.
 *
 * Alle Schreib-/Leseoperationen sind async. Nach jedem Schreib-Call wird der vom
 * Server gelieferte `LibraryEntry` lokal in `entries` eingepflegt (kein
 * Voll-Reload pro Schreibvorgang — wichtig fuer den 800-ms-Autosave).
 */
@Injectable({ providedIn: 'root' })
export class ProfileStoreService {
  private readonly log = inject(LoggerService);
  private readonly http = inject(BackendClient).fuer('Profil-Backend');

  /** Bibliotheks-Index, nach letzter Schreibung absteigend. */
  readonly entries = signal<LibraryEntry[]>([]);

  constructor() {
    // Konstruktor kann nicht async sein — Index nachladen (Dashboard zeigt kurz leer).
    // Fehler nur loggen (Backend offline beim Start); MigrationService/refresh holen nach.
    void this.refresh().catch((e) =>
      this.log.warn('Profil-Backend', 'Index beim Start nicht ladbar (Backend offline?)', e),
    );
  }

  // ── Lesen ───────────────────────────────────────────────────────────

  /** Bibliotheks-Index vom Server neu laden (Start + Fehler-Resync). */
  async refresh(): Promise<void> {
    this.entries.set(neuesteZuerst(await this.http.json<LibraryEntry[]>('/profiles')));
  }

  /** Das komplette Profil-Dokument zu einer id (404 → null). */
  async load(id: string): Promise<ProfileDoc | null> {
    return this.http.jsonOderNull<ProfileDoc>(`/profiles/${encodeURIComponent(id)}`);
  }

  // ── Schreiben ───────────────────────────────────────────────────────

  /** Dokument unter fester id schreiben; Index-Eintrag aktualisieren. */
  async upsert(id: string, doc: ProfileDoc): Promise<void> {
    const { entry } = await this.http.json<{ entry: LibraryEntry }>(
      `/profiles/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(doc) },
    );
    this.putEntry(entry);
  }

  /** Neues Profil anlegen; gibt die (serverseitig vergebene) id zurueck. */
  async create(doc: ProfileDoc): Promise<string> {
    const { id, entry } = await this.http.json<{ id: string; entry: LibraryEntry }>('/profiles', {
      method: 'POST',
      body: JSON.stringify(doc),
    });
    this.putEntry(entry);
    return id;
  }

  /** Profil als Kopie anlegen (neue id, Name "… (Kopie)"). */
  async duplicate(id: string): Promise<string | null> {
    const out = await this.http.jsonOderNull<{ id: string; entry: LibraryEntry }>(
      `/profiles/${encodeURIComponent(id)}/duplicate`,
      { method: 'POST' },
    );
    if (!out) return null;
    this.putEntry(out.entry);
    return out.id;
  }

  /**
   * Kachel-Metadaten aendern, ohne das Profil zu oeffnen (Name, Autor,
   * Beschreibung, Schlagworte). Nur die gesetzten Felder werden gesendet; der
   * Server laesst weggelassene unberuehrt und schreibt sie ins Dokument
   * zurueck — das grosse `doc` wandert dafuer nicht durch die Leitung.
   */
  async patchMeta(id: string, patch: ProfilMetaPatch): Promise<void> {
    const { entry } = await this.http.json<{ entry: LibraryEntry }>(
      `/profiles/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    this.putEntry(entry);
  }

  /** Nur den Namen aendern (Sonderfall von patchMeta). */
  async rename(id: string, name: string): Promise<void> {
    await this.patchMeta(id, { name });
  }

  /** Profil aus der Bibliothek entfernen. */
  async delete(id: string): Promise<void> {
    await this.http.json<void>(`/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.entries.update((list) => ohneEintrag(list, id));
  }

  /**
   * Bulk-Import fuer die einmalige Migration (erhaelt id + aktualisiert). Gibt die
   * Anzahl uebernommener Profile zurueck. Ruft KEIN refresh — der Aufrufer
   * (MigrationService) laedt den Index anschliessend neu.
   */
  async importAll(
    items: { id: string; doc: ProfileDoc; aktualisiert?: number; gespeichert?: string }[],
  ): Promise<number> {
    const { imported } = await this.http.json<{ imported: number }>('/import', {
      method: 'POST',
      body: JSON.stringify(items),
    });
    return imported;
  }

  // ── Versionen (Snapshots) ───────────────────────────────────────────

  /** Versionsliste eines Profils (ohne doc), absteigend nach Nummer. */
  async listVersions(id: string): Promise<ProfilVersion[]> {
    return this.http.json<ProfilVersion[]>(`/profiles/${encodeURIComponent(id)}/versions`);
  }

  /**
   * Eine Version inklusive eingefrorenem Dokument (Vergleich gegen den
   * Arbeitsstand); 404 → null. Fuer alle lesbar, auch ohne AG-Schluessel.
   */
  async loadVersion(id: string, versionId: string): Promise<VersionMitDoc | null> {
    const pfad = `/profiles/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`;
    return this.ladeVersion(pfad);
  }

  /**
   * Die referenzierte Abnahme-Version inklusive Dokument (Direkteinstieg fuer
   * "was hat sich seit der Abnahme geaendert?"); 404 → null (nicht abgenommen).
   */
  async loadAbnahmeDoc(id: string): Promise<VersionMitDoc | null> {
    return this.ladeVersion(`/profiles/${encodeURIComponent(id)}/abnahme`);
  }

  /** Gemeinsamer Lesepfad der beiden Vergleichs-Endpunkte (404 ist kein Fehler). */
  private async ladeVersion(pfad: string): Promise<VersionMitDoc | null> {
    return this.http.jsonOderNull<VersionMitDoc>(pfad);
  }

  /**
   * Version anlegen — Snapshot des serverseitig gespeicherten Stands (der
   * Aufrufer flusht vorher den Autosave). Automatik-Versionen sind serverseitig
   * entprellt: unveraenderter Stand → { skipped: true }, keine neue Version.
   */
  async createVersion(
    id: string,
    opts?: { kommentar?: string; automatisch?: boolean },
  ): Promise<{ version?: ProfilVersion; skipped?: boolean }> {
    const out = await this.http.json<{
      version?: ProfilVersion;
      skipped?: boolean;
      entry: LibraryEntry;
    }>(`/profiles/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    });
    this.putEntry(out.entry);
    return { version: out.version, skipped: out.skipped };
  }

  /**
   * Version wiederherstellen (in-place; der Server sichert den Arbeitsstand
   * vorher als Sicherheits-Version). Gibt das wiederhergestellte Dokument.
   */
  async restoreVersion(id: string, versionId: string): Promise<ProfileDoc> {
    const out = await this.http.json<{ entry: LibraryEntry; doc: ProfileDoc }>(
      `/profiles/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`,
      { method: 'POST' },
    );
    this.putEntry(out.entry);
    return out.doc;
  }

  /** Version loeschen. */
  async deleteVersion(id: string, versionId: string): Promise<void> {
    await this.http.json<void>(
      `/profiles/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
      { method: 'DELETE' },
    );
  }

  // ── Abnahme (BLK-AG) ────────────────────────────────────────────────

  /**
   * Abnehmen: friert den serverseitig gespeicherten Stand als Abnahme-Version
   * ein (der Aufrufer flusht vorher den Autosave) und setzt das Kennzeichen.
   */
  async abnehmen(id: string, kommentar?: string): Promise<ProfilVersion> {
    const out = await this.http.json<{ version: ProfilVersion; entry: LibraryEntry }>(
      `/profiles/${encodeURIComponent(id)}/abnahme`,
      { method: 'POST', body: JSON.stringify({ kommentar }) },
    );
    this.putEntry(out.entry);
    return out.version;
  }

  /** Abnahme-Kennzeichen entfernen (die Abnahme-Version bleibt erhalten). */
  async abnahmeEntfernen(id: string): Promise<void> {
    const { entry } = await this.http.json<{ entry: LibraryEntry }>(
      `/profiles/${encodeURIComponent(id)}/abnahme`,
      { method: 'DELETE' },
    );
    this.putEntry(entry);
  }

  // ── Index-Signal pflegen ────────────────────────────────────────────

  /**
   * Einen vom Server gelieferten Eintrag uebernehmen — auch aus fremder Hand:
   * die Hinweis-Endpunkte geben ihn nach jedem Schreibvorgang zurueck, damit
   * die Zaehler der Dashboard-Karte ohne Neuladen stimmen (Issue #43).
   */
  uebernehmeEntry(entry: LibraryEntry): void {
    this.putEntry(entry);
  }

  /** Eintrag ersetzen/voranstellen und nach aktualisiert absteigend sortieren. */
  private putEntry(entry: LibraryEntry): void {
    this.entries.update((list) => mitEintrag(list, entry));
  }
}
