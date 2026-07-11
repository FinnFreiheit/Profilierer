import { Injectable, signal } from '@angular/core';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';
import { defaultStatuses } from '../profile-defaults';

const INDEX_KEY = 'xjp.library.index';
const DOC_PREFIX = 'xjp.library.doc.';
const LEGACY_AUTOSAVE_KEY = 'xjp.autosave';

/**
 * Persistenz-Layer der Profil-Bibliothek. Reiner localStorage-CRUD ueber
 * mehrere Profile: ein schlanker Index (`xjp.library.index`) fuer das
 * Dashboard plus je Profil das komplette Dokument (`xjp.library.doc.<id>`).
 *
 * Bewusst "dumm": kennt weder StateService noch das aktive Profil. Die
 * Verdrahtung (Autosave in den aktiven Eintrag, Oeffnen-Fluss) uebernimmt der
 * PersistenceService — so entsteht kein DI-Zyklus.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStoreService {
  /** Bibliotheks-Index, nach letzter Schreibung absteigend. */
  readonly entries = signal<LibraryEntry[]>([]);

  constructor() {
    this.entries.set(this.readIndex());
  }

  // ── Lesen ───────────────────────────────────────────────────────────

  private readIndex(): LibraryEntry[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const list: LibraryEntry[] = raw ? JSON.parse(raw) : [];
      return list.sort((a, b) => b.aktualisiert - a.aktualisiert);
    } catch {
      return [];
    }
  }

  /** Das komplette Profil-Dokument zu einer id. */
  load(id: string): ProfileDoc | null {
    try {
      const raw = localStorage.getItem(DOC_PREFIX + id);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return {
        meta: d.meta ?? {},
        statuses: d.statuses ?? defaultStatuses(),
        elemente: d.elemente ?? {},
        auspraegungen: d.auspraegungen ?? {},
      };
    } catch {
      return null;
    }
  }

  // ── Schreiben ───────────────────────────────────────────────────────

  /** Zaehlt Festlegungen und Auspraegungen (wie StateService.fortschritt). */
  private zaehleFortschritt(doc: ProfileDoc): { nStatus: number; nAusp: number } {
    const nStatus = Object.values(doc.elemente).filter((p) => p.status).length;
    const nAusp = Object.values(doc.auspraegungen).reduce((s, l) => s + l.length, 0);
    return { nStatus, nAusp };
  }

  /** Dokument schreiben und den Indexeintrag daraus ableiten. */
  upsert(id: string, doc: ProfileDoc): void {
    localStorage.setItem(DOC_PREFIX + id, JSON.stringify(doc));
    const { nStatus, nAusp } = this.zaehleFortschritt(doc);
    const entry: LibraryEntry = {
      id,
      name: (doc.meta.name || '').trim(),
      nachricht: doc.meta.nachricht ?? null,
      xjustizVersion: doc.meta.xjustizVersion,
      nStatus,
      nAusp,
      gespeichert: doc.meta.gespeichert,
      aktualisiert: Date.now(),
    };
    const list = this.entries().filter((e) => e.id !== id);
    list.unshift(entry);
    this.writeIndex(list);
  }

  /** Neues Profil anlegen; gibt die erzeugte id zurueck. */
  create(doc: ProfileDoc): string {
    const id = this.newId();
    this.upsert(id, doc);
    return id;
  }

  /** Profil als Kopie anlegen (neue id, Name "… (Kopie)"). */
  duplicate(id: string): string | null {
    const doc = this.load(id);
    if (!doc) return null;
    const copy: ProfileDoc = structuredClone(doc);
    copy.meta = { ...copy.meta, name: (copy.meta.name || '(ohne Namen)') + ' (Kopie)' };
    return this.create(copy);
  }

  /** Nur den Namen aendern (Umbenennen im Dashboard ohne Oeffnen). */
  rename(id: string, name: string): void {
    const doc = this.load(id);
    if (!doc) return;
    doc.meta = { ...doc.meta, name: name.trim() };
    this.upsert(id, doc);
  }

  /** Profil aus der Bibliothek entfernen (Dokument + Indexeintrag). */
  delete(id: string): void {
    localStorage.removeItem(DOC_PREFIX + id);
    this.writeIndex(this.entries().filter((e) => e.id !== id));
  }

  private writeIndex(list: LibraryEntry[]): void {
    const sorted = [...list].sort((a, b) => b.aktualisiert - a.aktualisiert);
    localStorage.setItem(INDEX_KEY, JSON.stringify(sorted));
    this.entries.set(sorted);
  }

  private newId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ── Migration ───────────────────────────────────────────────────────

  /**
   * Hebt einen vorhandenen anonymen Autosave-Slot (`xjp.autosave`, altes
   * Ein-Slot-Modell) einmalig in die Bibliothek. Nur wenn die Bibliothek noch
   * leer ist und der Slot echten Inhalt hat. Gibt die neue id zurueck.
   */
  migrateLegacyAutosave(): string | null {
    try {
      if (localStorage.getItem(INDEX_KEY)) return null;
      const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
      if (!raw) return null;
      const a = JSON.parse(raw);
      const hatInhalt =
        Object.keys(a.elemente || {}).length || Object.keys(a.auspraegungen || {}).length;
      if (!hatInhalt) return null;
      const doc: ProfileDoc = {
        meta: {
          ...(a.meta || {}),
          name: (a.meta?.name || a.name || '').trim(),
          nachricht: a.msgName ?? a.meta?.nachricht ?? null,
          xjustizVersion: a.meta?.xjustizVersion || a.version,
        },
        statuses: a.statuses || defaultStatuses(),
        elemente: a.elemente || {},
        auspraegungen: a.auspraegungen || {},
      };
      const id = this.create(doc);
      localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
      return id;
    } catch {
      return null;
    }
  }
}
