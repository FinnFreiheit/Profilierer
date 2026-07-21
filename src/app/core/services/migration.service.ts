import { Injectable, inject } from '@angular/core';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';
import { defaultStatuses } from '../profile-defaults';
import { ProfileStoreService } from './profile-store.service';
import { LoggerService } from './logger.service';

const MIGRATED_KEY = 'xjp.migrated';
const INDEX_KEY = 'xjp.library.index';
const DOC_PREFIX = 'xjp.library.doc.';
const LEGACY_AUTOSAVE_KEY = 'xjp.autosave';

interface ImportItem {
  id: string;
  doc: ProfileDoc;
  aktualisiert?: number;
  gespeichert?: string;
}

/**
 * Einmalige Uebernahme der frueher im localStorage gehaltenen Profil-Bibliothek
 * (`xjp.library.index` + `xjp.library.doc.<id>`, sowie der noch aeltere Ein-Slot-
 * Autosave `xjp.autosave`) in das neue DB-Backend.
 *
 * Idempotent und datenschonend: migriert nur, wenn das Backend leer ist; setzt
 * danach den Marker `xjp.migrated`. Die localStorage-Eintraege werden bewusst
 * NICHT geloescht (bleiben als Sicherheitskopie).
 */
@Injectable({ providedIn: 'root' })
export class MigrationService {
  private readonly store = inject(ProfileStoreService);
  private readonly log = inject(LoggerService);

  /** Fuehrt die Migration hoechstens einmal aus. */
  async runOnce(): Promise<void> {
    if (localStorage.getItem(MIGRATED_KEY)) return;

    // Backend-Stand holen; bei Nichterreichbarkeit spaeter erneut versuchen
    // (Marker NICHT setzen).
    try {
      await this.store.refresh();
    } catch (e) {
      this.log.warn('Migration', 'Backend nicht erreichbar — Migration wird beim nächsten Start erneut versucht', e);
      return;
    }

    // Nur in ein leeres Backend migrieren (kein Ueberschreiben/Doppeln).
    if (this.store.entries().length > 0) {
      localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
      return;
    }

    const items = this.collectLocal();
    if (items.length) {
      try {
        await this.store.importAll(items);
        await this.store.refresh();
      } catch (e) {
        // Marker nicht setzen → naechster Start versucht es erneut.
        this.log.warn('Migration', 'Import der localStorage-Profile ins Backend fehlgeschlagen', e);
        return;
      }
    }
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  }

  /** Sammelt die migrierbaren Profile aus dem localStorage. */
  private collectLocal(): ImportItem[] {
    const items: ImportItem[] = [];
    try {
      const rawIndex = localStorage.getItem(INDEX_KEY);
      if (rawIndex) {
        const index: LibraryEntry[] = JSON.parse(rawIndex);
        for (const e of index) {
          const rawDoc = localStorage.getItem(DOC_PREFIX + e.id);
          if (!rawDoc) continue;
          items.push({
            id: e.id,
            doc: this.normalize(JSON.parse(rawDoc)),
            aktualisiert: e.aktualisiert,
            gespeichert: e.gespeichert,
          });
        }
      } else {
        const legacy = this.legacyAutosave();
        if (legacy) items.push(legacy);
      }
    } catch (e) {
      // Defekter localStorage → nichts migrieren.
      this.log.warn('Migration', 'localStorage-Bibliothek nicht lesbar — Migration übersprungen', e);
    }
    return items;
  }

  /** Fuellt fehlende Felder eines gespeicherten Dokuments auf (wie Store.load). */
  private normalize(d: Partial<ProfileDoc>): ProfileDoc {
    return {
      meta: d.meta ?? {},
      statuses: d.statuses ?? defaultStatuses(),
      elemente: d.elemente ?? {},
      auspraegungen: d.auspraegungen ?? {},
      erweiterungen: d.erweiterungen ?? {},
    };
  }

  /** Hebt einen ganz alten anonymen Autosave-Slot (kein Index) in ein Profil. */
  private legacyAutosave(): ImportItem | null {
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
      erweiterungen: a.erweiterungen || {},
    };
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'p' + Date.now().toString(36);
    return { id, doc };
  }
}
