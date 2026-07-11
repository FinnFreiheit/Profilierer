import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { toEntry } from './fortschritt.js';

/**
 * SQLite-Zugriffsschicht der Profil-Bibliothek. Eine Tabelle `profiles`: das
 * komplette ProfileDoc als JSON-Spalte `doc`, daneben die abgeleiteten
 * Index-Spalten (Name/Nachricht/Version/Fortschritt/Zeitstempel), aus denen die
 * schlanke LibraryEntry-Liste ohne Deserialisierung der grossen doc-Maps
 * gerendert wird.
 *
 * `openDb(path)` ist eine Fabrik (kein Singleton), damit Tests eine
 * In-Memory-DB (':memory:') nutzen koennen.
 */
export function openDb(path) {
  if (path && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path || ':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      doc TEXT NOT NULL,
      name TEXT,
      nachricht TEXT,
      xjustiz_version TEXT,
      n_status INTEGER,
      n_ausp INTEGER,
      gespeichert TEXT,
      aktualisiert INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_aktualisiert ON profiles(aktualisiert DESC);
  `);

  const stmt = {
    list: db.prepare(
      `SELECT id, name, nachricht, xjustiz_version, n_status, n_ausp, gespeichert, aktualisiert
       FROM profiles ORDER BY aktualisiert DESC`,
    ),
    getDoc: db.prepare('SELECT doc FROM profiles WHERE id = ?'),
    exists: db.prepare('SELECT 1 FROM profiles WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM profiles'),
    del: db.prepare('DELETE FROM profiles WHERE id = ?'),
    upsert: db.prepare(
      `INSERT INTO profiles
         (id, doc, name, nachricht, xjustiz_version, n_status, n_ausp, gespeichert, aktualisiert)
       VALUES
         (@id, @doc, @name, @nachricht, @xjustizVersion, @nStatus, @nAusp, @gespeichert, @aktualisiert)
       ON CONFLICT(id) DO UPDATE SET
         doc = excluded.doc, name = excluded.name, nachricht = excluded.nachricht,
         xjustiz_version = excluded.xjustiz_version, n_status = excluded.n_status,
         n_ausp = excluded.n_ausp, gespeichert = excluded.gespeichert,
         aktualisiert = excluded.aktualisiert`,
    ),
  };

  /** Schreibt Dokument + abgeleitete Index-Spalten; gibt den LibraryEntry zurueck. */
  function upsert(id, doc, aktualisiert) {
    const ts = aktualisiert ?? Date.now();
    const entry = toEntry(id, doc, ts);
    stmt.upsert.run({
      id,
      doc: JSON.stringify(doc),
      name: entry.name,
      nachricht: entry.nachricht,
      xjustizVersion: entry.xjustizVersion ?? null,
      nStatus: entry.nStatus,
      nAusp: entry.nAusp,
      gespeichert: entry.gespeichert ?? null,
      aktualisiert: ts,
    });
    return entry;
  }

  return {
    _db: db,

    /** Bibliotheks-Index (LibraryEntry[]), absteigend nach aktualisiert. */
    list() {
      return stmt.list.all().map((r) => ({
        id: r.id,
        name: r.name,
        nachricht: r.nachricht,
        xjustizVersion: r.xjustiz_version ?? undefined,
        nStatus: r.n_status,
        nAusp: r.n_ausp,
        gespeichert: r.gespeichert ?? undefined,
        aktualisiert: r.aktualisiert,
      }));
    },

    /** Das komplette ProfileDoc zu einer id oder null. */
    load(id) {
      const row = stmt.getDoc.get(id);
      return row ? JSON.parse(row.doc) : null;
    },

    count() {
      return stmt.count.get().n;
    },

    upsert,

    /** Neues Profil; id serverseitig vergeben. Gibt { id, entry }. */
    create(doc) {
      const id = randomUUID();
      const entry = upsert(id, doc);
      return { id, entry };
    },

    /** Kopie mit neuer id und Namenszusatz " (Kopie)". Gibt { id, entry } oder null. */
    duplicate(id) {
      const doc = this.load(id);
      if (!doc) return null;
      const copy = structuredClone(doc);
      copy.meta = { ...(copy.meta ?? {}), name: ((copy.meta?.name || '(ohne Namen)') + ' (Kopie)') };
      return this.create(copy);
    },

    /** Nur den Namen aendern. Gibt den aktualisierten entry oder null. */
    rename(id, name) {
      const doc = this.load(id);
      if (!doc) return null;
      doc.meta = { ...(doc.meta ?? {}), name: (name || '').trim() };
      return upsert(id, doc);
    },

    /** Loeschen. Gibt true, wenn eine Zeile entfernt wurde. */
    delete(id) {
      return stmt.del.run(id).changes > 0;
    },

    /**
     * Bulk-Import (Migration). Erhaelt uebergebene id + aktualisiert-Zeitstempel,
     * damit Reihenfolge/Historie im Dashboard konsistent bleiben. Eine Transaktion.
     */
    importAll(items) {
      const tx = db.transaction((list) => {
        let n = 0;
        for (const it of list) {
          if (!it || !it.id || !it.doc) continue;
          upsert(it.id, it.doc, it.aktualisiert);
          n++;
        }
        return n;
      });
      return tx(items ?? []);
    },

    close() {
      db.close();
    },
  };
}
