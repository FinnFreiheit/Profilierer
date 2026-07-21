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

    CREATE TABLE IF NOT EXISTS testmessages (
      id TEXT PRIMARY KEY,
      xml TEXT NOT NULL,
      name TEXT,             -- Dateiname/Anzeigename
      nachricht TEXT,        -- voller Name, z. B. nachricht.dabag.antrag.2900001
      fachmodul TEXT,        -- Cluster-Segment (z. B. dabag)
      xjustiz_version TEXT,  -- best-effort aus dem XML, optional
      groesse INTEGER,       -- Byte-Länge des XML
      notiz TEXT,
      hochgeladen INTEGER,
      aktualisiert INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_testmessages_fachmodul ON testmessages(fachmodul);
  `);

  // Migration: Spalten der gefuehrten Testnachricht-Erstellung nachziehen
  // (entwurf-Kennzeichen, Fortschritt "x von y" als JSON, Entscheidungsstand).
  {
    const cols = new Set(db.prepare('PRAGMA table_info(testmessages)').all().map((c) => c.name));
    if (!cols.has('entwurf')) db.exec('ALTER TABLE testmessages ADD COLUMN entwurf INTEGER');
    if (!cols.has('fortschritt')) db.exec('ALTER TABLE testmessages ADD COLUMN fortschritt TEXT');
    if (!cols.has('entscheidungen')) db.exec('ALTER TABLE testmessages ADD COLUMN entscheidungen TEXT');
  }

  // Migration: Index-Spalte fuer Schema-Erweiterungen (Dashboard-Badge) nachziehen.
  {
    const cols = new Set(db.prepare('PRAGMA table_info(profiles)').all().map((c) => c.name));
    if (!cols.has('n_erw')) db.exec('ALTER TABLE profiles ADD COLUMN n_erw INTEGER');
  }

  const stmt = {
    list: db.prepare(
      `SELECT id, name, nachricht, xjustiz_version, n_status, n_ausp, n_erw, gespeichert, aktualisiert
       FROM profiles ORDER BY aktualisiert DESC`,
    ),
    getDoc: db.prepare('SELECT doc FROM profiles WHERE id = ?'),
    exists: db.prepare('SELECT 1 FROM profiles WHERE id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM profiles'),
    del: db.prepare('DELETE FROM profiles WHERE id = ?'),
    upsert: db.prepare(
      `INSERT INTO profiles
         (id, doc, name, nachricht, xjustiz_version, n_status, n_ausp, n_erw, gespeichert, aktualisiert)
       VALUES
         (@id, @doc, @name, @nachricht, @xjustizVersion, @nStatus, @nAusp, @nErw, @gespeichert, @aktualisiert)
       ON CONFLICT(id) DO UPDATE SET
         doc = excluded.doc, name = excluded.name, nachricht = excluded.nachricht,
         xjustiz_version = excluded.xjustiz_version, n_status = excluded.n_status,
         n_ausp = excluded.n_ausp, n_erw = excluded.n_erw, gespeichert = excluded.gespeichert,
         aktualisiert = excluded.aktualisiert`,
    ),

    // ── Testnachrichten (zentraler Testdaten-Speicher) ──────────────────
    tmList: db.prepare(
      `SELECT id, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, hochgeladen, aktualisiert,
              entwurf, fortschritt, (entscheidungen IS NOT NULL) AS gefuehrt
       FROM testmessages ORDER BY aktualisiert DESC`,
    ),
    tmGetXml: db.prepare('SELECT xml FROM testmessages WHERE id = ?'),
    tmGetEntscheidungen: db.prepare('SELECT entscheidungen FROM testmessages WHERE id = ?'),
    tmGet: db.prepare(
      `SELECT id, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, hochgeladen, aktualisiert,
              entwurf, fortschritt, (entscheidungen IS NOT NULL) AS gefuehrt
       FROM testmessages WHERE id = ?`,
    ),
    tmGetRow: db.prepare('SELECT * FROM testmessages WHERE id = ?'),
    tmInsert: db.prepare(
      `INSERT INTO testmessages
         (id, xml, name, nachricht, fachmodul, xjustiz_version, groesse, notiz, hochgeladen, aktualisiert,
          entwurf, fortschritt, entscheidungen)
       VALUES
         (@id, @xml, @name, @nachricht, @fachmodul, @xjustizVersion, @groesse, @notiz, @ts, @ts,
          @entwurf, @fortschritt, @entscheidungen)`,
    ),
    tmUpdate: db.prepare(
      `UPDATE testmessages SET
         xml = @xml, notiz = @notiz, name = @name, groesse = @groesse,
         entwurf = @entwurf, fortschritt = @fortschritt, entscheidungen = @entscheidungen,
         aktualisiert = @aktualisiert
       WHERE id = @id`,
    ),
    tmDel: db.prepare('DELETE FROM testmessages WHERE id = ?'),
  };

  /** Baut die schlanke Index-Zeile (ohne xml/entscheidungen) aus einer DB-Zeile. */
  function tmEntry(r) {
    let fortschritt;
    if (r.fortschritt) {
      try {
        fortschritt = JSON.parse(r.fortschritt);
      } catch {
        fortschritt = undefined;
      }
    }
    return {
      id: r.id,
      name: r.name,
      nachricht: r.nachricht ?? undefined,
      fachmodul: r.fachmodul ?? undefined,
      xjustizVersion: r.xjustiz_version ?? undefined,
      groesse: r.groesse,
      notiz: r.notiz ?? undefined,
      hochgeladen: r.hochgeladen,
      aktualisiert: r.aktualisiert,
      entwurf: !!r.entwurf || undefined,
      fortschritt,
      gefuehrt: !!r.gefuehrt || undefined,
    };
  }

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
      nErw: entry.nErw,
      gespeichert: entry.gespeichert ?? null,
      aktualisiert: ts,
    });
    return entry;
  }

  const api = {
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
        nErw: r.n_erw ?? undefined,
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

    // ── Testnachrichten ─────────────────────────────────────────────────

    /** Index-Liste (ohne xml), absteigend nach aktualisiert. */
    tmList() {
      return stmt.tmList.all().map(tmEntry);
    },

    /** Roh-XML zu einer id oder null. */
    tmLoadXml(id) {
      const row = stmt.tmGetXml.get(id);
      return row ? row.xml : null;
    },

    /** Gespeicherter Entscheidungsstand (JSON) oder null. */
    tmLoadEntscheidungen(id) {
      const row = stmt.tmGetEntscheidungen.get(id);
      if (!row || !row.entscheidungen) return null;
      try {
        return JSON.parse(row.entscheidungen);
      } catch {
        return null;
      }
    },

    /** Neue Testnachricht; id serverseitig vergeben. Gibt { id, entry }. */
    tmCreate({ name, xml, nachricht, fachmodul, xjustizVersion, groesse, entwurf, fortschritt, entscheidungen }, ts) {
      const id = randomUUID();
      const stamp = ts ?? Date.now();
      stmt.tmInsert.run({
        id,
        xml: String(xml ?? ''),
        name: name ?? null,
        nachricht: nachricht ?? null,
        fachmodul: fachmodul ?? null,
        xjustizVersion: xjustizVersion ?? null,
        groesse: groesse ?? (xml ? String(xml).length : 0),
        notiz: null,
        entwurf: entwurf ? 1 : null,
        fortschritt: fortschritt ? JSON.stringify(fortschritt) : null,
        entscheidungen: entscheidungen ? JSON.stringify(entscheidungen) : null,
        ts: stamp,
      });
      return { id, entry: tmEntry(stmt.tmGet.get(id)) };
    },

    /**
     * Felder ändern; nur die im Patch gesetzten werden übernommen (undefined =
     * unberührt). Aktualisiert-Zeitstempel setzen. Gibt entry oder null.
     */
    tmUpdate(id, { notiz, name, xml, entwurf, fortschritt, entscheidungen }, ts) {
      const row = stmt.tmGetRow.get(id);
      if (!row) return null;
      const nextXml = xml !== undefined ? String(xml) : row.xml;
      const next = {
        xml: nextXml,
        groesse: xml !== undefined ? nextXml.length : row.groesse,
        notiz: notiz !== undefined ? (notiz || null) : row.notiz,
        name: name !== undefined ? (name || null) : row.name,
        entwurf: entwurf !== undefined ? (entwurf ? 1 : null) : row.entwurf,
        fortschritt:
          fortschritt !== undefined ? (fortschritt ? JSON.stringify(fortschritt) : null) : row.fortschritt,
        entscheidungen:
          entscheidungen !== undefined
            ? (entscheidungen ? JSON.stringify(entscheidungen) : null)
            : row.entscheidungen,
        aktualisiert: ts ?? Date.now(),
      };
      stmt.tmUpdate.run({ id, ...next });
      return tmEntry(stmt.tmGet.get(id));
    },

    /** Löschen. Gibt true, wenn eine Zeile entfernt wurde. */
    tmDelete(id) {
      return stmt.tmDel.run(id).changes > 0;
    },

    /**
     * Trägt fehlende XJustiz-Versionen nach: leitet sie best-effort aus dem
     * gespeicherten XML ab (Attribut `xjustizVersion` an Wurzel oder
     * Nachrichtenkopf). Idempotent — wirkt nur auf Einträge ohne Version; läuft
     * beim Öffnen der DB. Gibt die Anzahl ergänzter Einträge zurück.
     */
    tmBackfillVersionen() {
      const offen = db
        .prepare(`SELECT id, xml FROM testmessages WHERE xjustiz_version IS NULL OR xjustiz_version = ''`)
        .all();
      const set = db.prepare(`UPDATE testmessages SET xjustiz_version = ? WHERE id = ?`);
      let n = 0;
      db.transaction(() => {
        for (const r of offen) {
          const m = String(r.xml).match(/xjustizVersion\s*=\s*"([^"]+)"/);
          if (m) {
            set.run(m[1].trim(), r.id);
            n++;
          }
        }
      })();
      return n;
    },

    close() {
      db.close();
    },
  };

  // Alt-Bestand ohne erkannte XJustiz-Version einmalig aus dem XML nachziehen.
  api.tmBackfillVersionen();
  return api;
}
