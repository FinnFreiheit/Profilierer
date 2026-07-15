import { Injectable, signal } from '@angular/core';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';

/**
 * Basis-URL der Profil-API (same-origin; im Dev via Proxy auf das Backend).
 * Relativ, loest gegen <base href> auf: Dev/Root -> /api, Unterpfad-Deployment
 * (xjw.freiheits.de/profilierer) -> /profilierer/api (nginx strippt den Praefix).
 */
const API_BASE = 'api';

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
  /** Bibliotheks-Index, nach letzter Schreibung absteigend. */
  readonly entries = signal<LibraryEntry[]>([]);

  constructor() {
    // Konstruktor kann nicht async sein — Index nachladen (Dashboard zeigt kurz leer).
    // Fehler (Backend offline beim Start) schlucken; MigrationService/refresh holen nach.
    void this.refresh().catch(() => {});
  }

  // ── HTTP-Helfer ─────────────────────────────────────────────────────

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(API_BASE + path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
    });
    if (!r.ok) throw new Error(`Profil-Backend: ${init?.method ?? 'GET'} ${path} → ${r.status}`);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  // ── Lesen ───────────────────────────────────────────────────────────

  /** Bibliotheks-Index vom Server neu laden (Start + Fehler-Resync). */
  async refresh(): Promise<void> {
    const list = await this.req<LibraryEntry[]>('/profiles');
    this.entries.set([...list].sort((a, b) => b.aktualisiert - a.aktualisiert));
  }

  /** Das komplette Profil-Dokument zu einer id (404 → null). */
  async load(id: string): Promise<ProfileDoc | null> {
    const r = await fetch(`${API_BASE}/profiles/${encodeURIComponent(id)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Profil-Backend: GET /profiles/${id} → ${r.status}`);
    return (await r.json()) as ProfileDoc;
  }

  // ── Schreiben ───────────────────────────────────────────────────────

  /** Dokument unter fester id schreiben; Index-Eintrag aktualisieren. */
  async upsert(id: string, doc: ProfileDoc): Promise<void> {
    const { entry } = await this.req<{ entry: LibraryEntry }>(
      `/profiles/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(doc) },
    );
    this.putEntry(entry);
  }

  /** Neues Profil anlegen; gibt die (serverseitig vergebene) id zurueck. */
  async create(doc: ProfileDoc): Promise<string> {
    const { id, entry } = await this.req<{ id: string; entry: LibraryEntry }>('/profiles', {
      method: 'POST',
      body: JSON.stringify(doc),
    });
    this.putEntry(entry);
    return id;
  }

  /** Profil als Kopie anlegen (neue id, Name "… (Kopie)"). */
  async duplicate(id: string): Promise<string | null> {
    const r = await fetch(`${API_BASE}/profiles/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Profil-Backend: POST /profiles/${id}/duplicate → ${r.status}`);
    const { id: newId, entry } = (await r.json()) as { id: string; entry: LibraryEntry };
    this.putEntry(entry);
    return newId;
  }

  /** Nur den Namen aendern (Umbenennen im Dashboard ohne Oeffnen). */
  async rename(id: string, name: string): Promise<void> {
    const { entry } = await this.req<{ entry: LibraryEntry }>(
      `/profiles/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ name }) },
    );
    this.putEntry(entry);
  }

  /** Profil aus der Bibliothek entfernen. */
  async delete(id: string): Promise<void> {
    await this.req<void>(`/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.entries.update((list) => list.filter((e) => e.id !== id));
  }

  /**
   * Bulk-Import fuer die einmalige Migration (erhaelt id + aktualisiert). Gibt die
   * Anzahl uebernommener Profile zurueck. Ruft KEIN refresh — der Aufrufer
   * (MigrationService) laedt den Index anschliessend neu.
   */
  async importAll(
    items: { id: string; doc: ProfileDoc; aktualisiert?: number; gespeichert?: string }[],
  ): Promise<number> {
    const { imported } = await this.req<{ imported: number }>('/import', {
      method: 'POST',
      body: JSON.stringify(items),
    });
    return imported;
  }

  // ── Index-Signal pflegen ────────────────────────────────────────────

  /** Eintrag ersetzen/voranstellen und nach aktualisiert absteigend sortieren. */
  private putEntry(entry: LibraryEntry): void {
    this.entries.update((list) => {
      const rest = list.filter((e) => e.id !== entry.id);
      rest.unshift(entry);
      return rest.sort((a, b) => b.aktualisiert - a.aktualisiert);
    });
  }
}
