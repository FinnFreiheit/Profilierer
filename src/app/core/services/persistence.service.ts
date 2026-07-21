import { Injectable, effect, inject } from '@angular/core';
import { XsdDoc } from '../../models/xsd-index.model';
import { ProfileDoc } from '../../models/profile.model';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';
import { ProfileStoreService } from './profile-store.service';
import { DownloadService } from './download.service';
import { BundledSchemaService } from './bundled-schema.service';
import { defaultStatuses, newProfile } from '../profile-defaults';

/** localStorage-Prefix der Notfallkopien (Backend beim Autosave nicht erreichbar). */
const NOTFALL_PREFIX = 'xjp.notfall.';

/**
 * Laden von XSD-Ordnern, Profil-Persistenz und Autosave. Portiert aus
 * Profilierer.html (Funktionsgruppe G, Z.1471-1502 + 1746-1823).
 *
 * Autosave und manuelles Speichern arbeiten gegen die Profil-Bibliothek
 * (ProfileStoreService): der Autosave schreibt fortlaufend in den aktiven
 * Bibliothekseintrag (state.activeProfileId), nicht mehr in einen anonymen Slot.
 *
 * Datenverlust-Schutz bei Backend-Ausfall: Schlaegt der Autosave fehl, wird der
 * Stand als **Notfallkopie** im localStorage gehalten und der Autosave alle 5 s
 * wiederholt; die Toolbar zeigt einen dauerhaften Warnhinweis. Beim naechsten
 * App-Start (oder sobald das Backend wieder antwortet) werden Notfallkopien
 * automatisch ans Backend nachgetragen. Zusaetzlich warnt der Browser beim
 * Verlassen der Seite, solange Aenderungen nicht gesichert sind.
 */
@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private readonly state = inject(StateService);
  private readonly parser = inject(XsdParserService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerService);
  private readonly store = inject(ProfileStoreService);
  private readonly dl = inject(DownloadService);
  private readonly bundled = inject(BundledSchemaService);

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Verhindert parallele Upserts (Reihenfolge/Lost-Update-Schutz). */
  private autosaveInFlight = false;
  /** Waehrend eines laufenden Upserts eingegangene Aenderung → danach nachziehen. */
  private autosavePending = false;
  /** Fehler-Toast nur einmal pro Ausfall zeigen (nicht bei jedem 800-ms-Tick). */
  private autosaveErrorShown = false;
  /** Letzter Autosave fehlgeschlagen (Backend-Ausfall laeuft). */
  private autosaveFehlgeschlagen = false;

  constructor() {
    // Autosave: bei jeder Profil-/Nachrichtenaenderung debounced in den aktiven
    // Bibliothekseintrag sichern (scheduleAutosave, Z.1471). Der Effekt liest
    // nur — geschrieben (async) wird ausserhalb der Effekt-Ausfuehrung in autosaveNow.
    effect(() => {
      this.state.profileDoc();
      const msg = this.state.msgName();
      const id = this.state.activeProfileId();
      if (!msg || !id) return;
      if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => {
        this.autosaveTimer = null;
        void this.autosaveNow();
      }, 800);
    });
    // Notfallkopien frueherer Sitzungen ans Backend nachtragen (best effort).
    void this.flushNotfallkopien();
    // Browser-Warnung, solange Aenderungen noch nicht im Backend gesichert sind.
    window.addEventListener('beforeunload', (e) => {
      if (this.ungesichert()) e.preventDefault();
    });
  }

  /** Stehen Aenderungen aus, die das Backend noch nicht hat? */
  private ungesichert(): boolean {
    return (
      this.autosaveTimer !== null ||
      this.autosaveInFlight ||
      this.autosavePending ||
      this.autosaveFehlgeschlagen
    );
  }

  // ── Notfallkopien (Backend-Ausfall) ─────────────────────────────────

  /** Notfallkopie schreiben; localStorage-Fehler (Quota o. ae.) bewusst schlucken. */
  private schreibeNotfallkopie(id: string, doc: ProfileDoc): void {
    try {
      localStorage.setItem(NOTFALL_PREFIX + id, JSON.stringify({ doc, ts: Date.now() }));
    } catch {
      /* volle/gesperrte Storage: der 5-s-Retry bleibt die einzige Sicherung */
    }
  }

  private loescheNotfallkopie(id: string): void {
    try {
      localStorage.removeItem(NOTFALL_PREFIX + id);
    } catch { /* ignorieren */ }
  }

  /**
   * Alle vorhandenen Notfallkopien ans Backend nachtragen (App-Start bzw.
   * sobald das Backend wieder erreichbar ist). Bei Erfolg werden die lokalen
   * Kopien entfernt; bleibt das Backend weg, bleiben sie liegen.
   */
  async flushNotfallkopien(): Promise<void> {
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NOTFALL_PREFIX)) keys.push(k);
      }
    } catch {
      return;
    }
    if (!keys.length) return;
    let ok = 0;
    for (const k of keys) {
      try {
        const { doc } = JSON.parse(localStorage.getItem(k) ?? '') as { doc: ProfileDoc };
        await this.store.upsert(k.slice(NOTFALL_PREFIX.length), doc);
        localStorage.removeItem(k);
        ok++;
      } catch (e) {
        // Backend weiterhin weg oder Eintrag defekt → Kopie behalten.
        this.log.warn('Persistenz', `Notfallkopie ${k} konnte nicht nachgetragen werden`, e);
      }
    }
    if (ok)
      this.toast.show(
        ok === 1
          ? 'Eine lokal zwischengespeicherte Profilierung wurde ans Backend nachgetragen.'
          : `${ok} lokal zwischengespeicherte Profilierungen wurden ans Backend nachgetragen.`,
      );
    else
      this.toast.show(
        'Lokale Notfallkopie vorhanden — Backend nicht erreichbar, Nachtrag folgt automatisch.',
      );
  }

  /** loadXsdFiles (Z.1746-1768). */
  async loadXsdFiles(files: FileList | File[]): Promise<number> {
    const xsds = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.xsd'));
    if (!xsds.length) throw new Error('Keine .xsd-Dateien im gewählten Ordner gefunden.');
    const docs: XsdDoc[] = [];
    const parser = new DOMParser();
    for (const f of xsds) {
      const text = await f.text();
      const dom = parser.parseFromString(text, 'application/xml');
      const parseFehler = dom.getElementsByTagName('parsererror');
      if (parseFehler.length) {
        this.log.warn('Schema', `Parse-Fehler in ${f.name}`, parseFehler[0]?.textContent ?? undefined);
        continue;
      }
      docs.push({ file: f.name, dom });
    }
    const { idx, version, kennung } = this.parser.buildIndexFrom(docs);
    this.state.docs.set(docs);
    this.state.idx.set(idx);
    this.state.version.set(version);
    if (kennung) this.state.standardKennung.set(kennung);

    // Profil-first-Fall: ein vor dem Schema geoeffnetes Profil jetzt anwenden
    // (Z.1763-1768). Die Wiederherstellung eines Arbeitsstands laeuft nun ueber
    // das Dashboard (Bibliothek), nicht mehr ueber offerAutosaveRestore.
    const pending = this.state.pendingMsg();
    if (pending) {
      this.state.pendingMsg.set(null);
      const nachricht = pending.meta.nachricht;
      if (nachricht && idx.el[nachricht]) {
        this.state.loadProfile(pending);
        this.nav.loadMessage(nachricht, true);
      } else {
        this.toast.show('Nachricht aus dem Profil nicht in diesen Schemata gefunden: ' + nachricht);
      }
    }
    return docs.length;
  }

  /**
   * Haengenden Autosave sofort ausfuehren. Noetig vor einem temporaeren
   * State-Swap (Testnachricht-Generierung): wird `activeProfileId` genullt,
   * waehrend der 800-ms-Timer laeuft, ginge die letzte Aenderung verloren.
   */
  async flushAutosave(): Promise<void> {
    if (this.autosaveTimer === null) return;
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    await this.autosaveNow();
  }

  /**
   * autosaveNow (Z.1472-1483): den aktuellen Stand in den aktiven
   * Bibliothekseintrag schreiben. Nachricht und Version werden in die
   * gespeicherte Meta gemischt (ohne den Store zu mutieren — das wuerde den
   * Autosave-Effekt erneut ausloesen), damit der Bibliothekseintrag den
   * Nachrichtentyp anzeigt und ein Export vollstaendig bleibt.
   */
  private async autosaveNow(): Promise<void> {
    const msg = this.state.msgName();
    const id = this.state.activeProfileId();
    if (!msg || !id) return;
    // Laeuft noch ein Upsert, den naechsten nach dessen Abschluss nachziehen.
    if (this.autosaveInFlight) {
      this.autosavePending = true;
      return;
    }
    this.autosaveInFlight = true;
    try {
      const doc = this.state.profileDoc();
      const merged: ProfileDoc = {
        ...doc,
        meta: { ...doc.meta, nachricht: msg, xjustizVersion: this.state.version() },
      };
      await this.store.upsert(id, merged);
      this.autosaveErrorShown = false;
      const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      if (this.autosaveFehlgeschlagen) {
        // Backend wieder da: Notfallkopie ist ueberholt; evtl. weitere nachtragen.
        this.autosaveFehlgeschlagen = false;
        this.loescheNotfallkopie(id);
        this.toast.show('Backend wieder erreichbar — Stand gesichert.');
        void this.flushNotfallkopien().catch((e) =>
          this.log.warn('Persistenz', 'Nachtrag der Notfallkopien fehlgeschlagen', e),
        );
      }
      this.state.autosaveInfo.set('automatisch gesichert ' + zeit);
    } catch (e) {
      // Kein Datenverlust bei Backend-Ausfall: Stand lokal sichern, dauerhaft
      // warnen und den Autosave automatisch wiederholen.
      this.log.error('Persistenz', 'Autosave fehlgeschlagen — Notfallkopie lokal', e);
      this.autosaveFehlgeschlagen = true;
      const doc = this.state.profileDoc();
      this.schreibeNotfallkopie(id, {
        ...doc,
        meta: { ...doc.meta, nachricht: msg, xjustizVersion: this.state.version() },
      });
      const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      this.state.autosaveInfo.set(`⚠ NICHT im Backend gesichert — Notfallkopie lokal ${zeit}`);
      if (!this.autosaveErrorShown) {
        this.autosaveErrorShown = true;
        this.toast.show(
          'Backend nicht erreichbar — Änderungen werden lokal zwischengespeichert und automatisch nachgetragen.',
        );
      }
      if (!this.autosaveTimer) {
        this.autosaveTimer = setTimeout(() => {
          this.autosaveTimer = null;
          void this.autosaveNow();
        }, 5000);
      }
    } finally {
      this.autosaveInFlight = false;
      // Zwischenzeitliche Aenderung mit dem jeweils aktuellen Stand nachspeichern.
      if (this.autosavePending) {
        this.autosavePending = false;
        void this.autosaveNow();
      }
    }
  }

  // ── Bibliothek: Oeffnen / Neu / Import / Export ─────────────────────

  /** Ein Bibliotheksprofil oeffnen und in den Editor wechseln. */
  async openFromLibrary(id: string): Promise<void> {
    let doc: ProfileDoc | null;
    try {
      doc = await this.store.load(id);
    } catch (e) {
      this.log.error('Persistenz', `Profil ${id} konnte nicht geladen werden`, e);
      this.toast.show('Profil konnte nicht geladen werden — Backend nicht erreichbar.');
      return;
    }
    if (!doc) {
      this.toast.show('Profil nicht gefunden.');
      return;
    }
    this.state.activeProfileId.set(id);
    this.state.loadProfile(doc);
    // Bestehende Profilierungen oeffnen im freien Modus; gefuehrt ist zuschaltbar
    // (Fortschritt wird dann aus den gespeicherten Entscheidungen berechnet).
    this.state.guided.set(false);
    const nachricht = doc.meta.nachricht;

    // Versions-Angleich: Wurde das Profil mit einer anderen hinterlegten
    // XJustiz-Version erstellt, zuerst deren Schemata laden — sonst endet das
    // Oeffnen bei versions-exklusiven Nachrichten (z. B. nur in 4.0.0) im
    // leeren Editor ("Nachricht aus dem Profil nicht gefunden").
    const ver = doc.meta.xjustizVersion;
    if (ver && ver !== this.state.version()) {
      let versions = this.state.bundledVersions();
      if (!versions.length) {
        try {
          versions = await this.bundled.manifest();
          this.state.bundledVersions.set(versions);
        } catch {
          versions = [];
        }
      }
      const bundle = versions.find((v) => v.id === ver);
      if (bundle) {
        try {
          await this.loadXsdFiles(await this.bundled.files(bundle));
          this.state.activeBundle.set(bundle.dir);
          this.toast.show(`XJustiz ${bundle.label} geladen (Version des Profils).`);
        } catch {
          // Bundle nicht ladbar: mit dem aktuellen Index fortfahren (Hinweis unten).
        }
      }
    }

    if (!this.state.idx()) {
      // Schema noch nicht geladen (selten dank Auto-Load): nach XSD anwenden.
      this.state.pendingMsg.set(doc);
      this.state.view.set('editor');
      this.toast.show('Profil geladen — bitte den XSD-Ordner laden.');
      return;
    }
    if (nachricht && this.state.idx()!.el[nachricht]) {
      this.nav.loadMessage(nachricht, true);
      if (doc.meta.xjustizVersion && doc.meta.xjustizVersion !== this.state.version())
        this.toast.show(
          `Hinweis: Profil mit XJustiz ${doc.meta.xjustizVersion} erstellt, geladen ist ${this.state.version()}.`,
        );
    } else {
      // Kein/unbekannter Nachrichtentyp: leerer Editor, Nachricht dort waehlen.
      this.state.msgName.set(null);
      this.state.root.set(null);
      if (nachricht) this.toast.show('Nachricht aus dem Profil nicht gefunden: ' + nachricht);
    }
    this.state.view.set('editor');
  }

  /** Neues, leeres Profil anlegen und in den Editor wechseln. */
  async createNew(): Promise<void> {
    let id: string;
    try {
      id = await this.store.create(newProfile());
    } catch {
      this.toast.show('Neues Profil konnte nicht angelegt werden — Backend nicht erreichbar.');
      return;
    }
    this.state.activeProfileId.set(id);
    this.state.resetProfile();
    this.state.msgName.set(null);
    this.state.root.set(null);
    // Neue Profilierung startet gefuehrt (US "Profilierung gefuehrt erstellen");
    // nach resetProfile setzen, da loadProfile guided zuruecksetzt.
    this.state.guided.set(true);
    this.state.view.set('editor');
  }

  /** Ein beliebiges Profil-Dokument als Datei exportieren (auch nicht-aktiv). */
  exportDoc(doc: ProfileDoc): void {
    const json = JSON.stringify(
      {
        app: 'xjustiz-profilierer',
        formatVersion: 3,
        meta: doc.meta,
        statuses: doc.statuses,
        elemente: doc.elemente,
        auspraegungen: doc.auspraegungen,
        erweiterungen: doc.erweiterungen,
      },
      null,
      2,
    );
    const n = (doc.meta.name || 'Profil').replace(/[^\wäöüÄÖÜß-]+/g, '_');
    const msg = (doc.meta.nachricht || '').split('.').slice(1, -1).join('.') || 'xjustiz';
    this.dl.download(`${n}_${msg}.profil.json`, json, 'application/json');
  }

  // ── Profil speichern / laden (Z.1772-1823) ──────────────────────────

  /** saveProfile (Z.1782-1792): Meta finalisieren und als Datei exportieren. */
  saveProfile(): void {
    this.state.patchMeta({
      name: (this.state.meta().name || '').trim(),
      nachricht: this.state.msgName(),
      xjustizVersion: this.state.version(),
      gespeichert: new Date().toISOString().slice(0, 10),
    });
    this.exportDoc(this.state.profileDoc());
    this.toast.show('Profil gespeichert.');
  }

  /** migrateV1 (Z.1794-1804): altes Format auf v2 heben. */
  private migrateV1(data: any): ProfileDoc {
    const st = defaultStatuses();
    const map: Record<string, string> = { pflicht: 's1', ausgeschlossen: 's3' };
    const elemente: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(data.elemente || {})) {
      const e = { ...v };
      if (e.status) e.status = map[e.status] || undefined;
      elemente[k] = e;
    }
    return { meta: data.meta || {}, statuses: st, elemente, auspraegungen: {}, erweiterungen: {} };
  }

  /**
   * loadProfileFile (Z.1806-1822): eine Profildatei importieren. Das Profil
   * wird als neuer Bibliothekseintrag angelegt und direkt geoeffnet, sodass es
   * dauerhaft im Dashboard erscheint.
   */
  async loadProfileFile(file: File): Promise<void> {
    try {
      const data = JSON.parse(await file.text());
      if (!data.elemente || !data.meta) throw new Error('kein Profilierer-Profil');
      const prof: ProfileDoc =
        data.formatVersion >= 2
          ? {
              meta: data.meta,
              statuses: data.statuses || defaultStatuses(),
              elemente: data.elemente,
              auspraegungen: data.auspraegungen || {},
              // v2-Dateien tragen noch keine Schema-Erweiterungen.
              erweiterungen: data.erweiterungen || {},
            }
          : this.migrateV1(data);
      const id = await this.store.create(prof);
      await this.openFromLibrary(id);
    } catch (e) {
      this.toast.show('Profil konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : e));
    }
  }
}
