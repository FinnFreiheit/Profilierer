import { Injectable, effect, inject } from '@angular/core';
import { XsdDoc } from '../../models/xsd-index.model';
import { Hinweis, ProfileDoc } from '../../models/profile.model';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';
import { ProfileStoreService } from './profile-store.service';
import { DownloadService } from './download.service';
import { BundledSchemaService } from './bundled-schema.service';
import { RolleService } from './rolle.service';
import { HinweisStoreService } from './hinweis-store.service';
import { GuidedService } from './guided.service';
import { hinweiseAusDatei } from '../util/hinweis.util';
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
  private readonly rolle = inject(RolleService);
  private readonly hinweise = inject(HinweisStoreService);
  private readonly guided = inject(GuidedService);

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Verhindert parallele Upserts (Reihenfolge/Lost-Update-Schutz). */
  private autosaveInFlight = false;
  /** Waehrend eines laufenden Upserts eingegangene Aenderung → danach nachziehen. */
  private autosavePending = false;
  /** Fehler-Toast nur einmal pro Ausfall zeigen (nicht bei jedem 800-ms-Tick). */
  private autosaveErrorShown = false;
  /** Letzter Autosave fehlgeschlagen (Backend-Ausfall laeuft). */
  private autosaveFehlgeschlagen = false;
  /**
   * Laufender Upsert als Promise — flushAutosave wartet auch darauf, damit
   * z. B. "Version anlegen" nicht den Stand von vor ~1 s einfriert.
   */
  private laufenderUpsert: Promise<void> | null = null;

  constructor() {
    // Autosave: bei jeder Profil-/Nachrichtenaenderung debounced in den aktiven
    // Bibliothekseintrag sichern (scheduleAutosave, Z.1471). Der Effekt liest
    // nur — geschrieben (async) wird ausserhalb der Effekt-Ausfuehrung in autosaveNow.
    effect(() => {
      this.state.profileDoc();
      const msg = this.state.msgName();
      const id = this.state.activeProfileId();
      // Abnahme-Schreibschutz (Rolle Extern): nichts sichern — der Server
      // wiese den Upsert mit 403 ab; zum Weiterarbeiten dupliziert man.
      if (this.state.abnahmeSchreibschutz()) return;
      if (!msg || !id) return;
      if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => {
        this.autosaveTimer = null;
        void this.autosaveNow();
      }, 800);
    });
    // Rollenwechsel bei offenem, abgenommenem Profil: Schreibschutz nachziehen —
    // AG-Anmeldung entsperrt den Editor, Abmelden sperrt ihn wieder.
    effect(() => {
      const ag = this.rolle.agAktiv();
      const id = this.state.activeProfileId();
      if (!id) return;
      const entry = this.store.entries().find((e) => e.id === id);
      if (!entry?.abgenommen) return;
      const schutz = !ag;
      if (schutz === this.state.abnahmeSchreibschutz()) return;
      this.state.abnahmeSchreibschutz.set(schutz);
      this.state.readOnly.set(schutz);
      this.state.autosaveInfo.set(schutz ? 'von der BLK-AG abgenommen — schreibgeschützt' : '');
    });
    // Hinweise folgen dem offenen Profil: sie liegen in eigener Ablage (ADR 0014)
    // und laufen nicht ueber den Autosave. Ein Profilwechsel laedt sie nach, das
    // Verlassen des Editors (Nachrichten-Modus, Dashboard) leert sie.
    effect(() => {
      void this.hinweise.lade(this.state.activeProfileId());
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
    } catch {
      /* ignorieren */
    }
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
        this.log.warn(
          'Schema',
          `Parse-Fehler in ${f.name}`,
          parseFehler[0]?.textContent ?? undefined,
        );
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
   * Haengenden Autosave sofort ausfuehren und laufende Upserts abwarten.
   * Noetig vor einem temporaeren State-Swap (Testnachricht-Generierung) und
   * vor Versions-Operationen: wird `activeProfileId` genullt, waehrend der
   * 800-ms-Timer laeuft, ginge die letzte Aenderung verloren; ein Snapshot
   * waehrend eines laufenden Upserts fröre einen veralteten Stand ein.
   */
  async flushAutosave(): Promise<void> {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      await this.autosaveNow();
    }
    // Einen bereits laufenden Upsert (inkl. Nachzieher) zusaetzlich abwarten.
    while (this.laufenderUpsert) await this.laufenderUpsert;
  }

  /**
   * autosaveNow (Z.1472-1483): den aktuellen Stand in den aktiven
   * Bibliothekseintrag schreiben. Nachricht und Version werden in die
   * gespeicherte Meta gemischt (ohne den Store zu mutieren — das wuerde den
   * Autosave-Effekt erneut ausloesen), damit der Bibliothekseintrag den
   * Nachrichtentyp anzeigt und ein Export vollstaendig bleibt.
   */
  /**
   * Stand der Entscheidungspunkte fuer den Fortschrittsbalken der Uebersicht
   * (#93). Nur der Client kennt ihn — der Server hat kein Schema.
   *
   * Bewusst zurueckhaltend: ohne geladenen Baum bliebe der Nenner geraten, und
   * im Instanz-Modus zaehlt `guided.fortschritt` die Pflichtangaben einer
   * Nachricht statt der Entscheidungen einer Profilierung. In beiden Faellen
   * bleibt ein zuvor gespeicherter Stand unangetastet, statt ihn mit einer
   * falschen Zahl zu ueberschreiben.
   */
  private punkteStand(): Pick<ProfileDoc, 'fortschritt'> {
    if (!this.state.hasRoot() || this.guided.instanzModus()) return {};
    const { x, y } = this.guided.fortschritt();
    return y > 0 ? { fortschritt: { x, y } } : {};
  }

  private autosaveNow(): Promise<void> {
    // Laeuft noch ein Upsert, den naechsten nach dessen Abschluss nachziehen.
    if (this.autosaveInFlight) {
      this.autosavePending = true;
      return this.laufenderUpsert ?? Promise.resolve();
    }
    const p = this.autosaveLauf().finally(() => {
      // Nur zuruecksetzen, wenn nicht schon ein Nachzieher uebernommen hat.
      if (this.laufenderUpsert === p) this.laufenderUpsert = null;
    });
    this.laufenderUpsert = p;
    return p;
  }

  private async autosaveLauf(): Promise<void> {
    const msg = this.state.msgName();
    const id = this.state.activeProfileId();
    if (!msg || !id) return;
    this.autosaveInFlight = true;
    try {
      const doc = this.state.profileDoc();
      const merged: ProfileDoc = {
        ...doc,
        meta: { ...doc.meta, nachricht: msg, xjustizVersion: this.state.version() },
        ...this.punkteStand(),
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
    // Haengende Aenderungen des zuvor aktiven Profils erst sichern.
    await this.flushAutosave();
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
    // Abnahme-Schreibschutz: abgenommene Profile sind fuer die Rolle Extern
    // nur lesbar — Autosave und Oeffnen-Snapshot wuerden am Server scheitern.
    const entry = this.store.entries().find((e) => e.id === id);
    const schreibschutz = !!entry?.abgenommen && !this.rolle.agAktiv();
    this.state.abnahmeSchreibschutz.set(schreibschutz);
    if (!schreibschutz) {
      // Oeffnen-Snapshot (serverseitig entprellt): Sicherheitsnetz fuers vergessene
      // "Version anlegen". Fire-and-forget — darf das Oeffnen weder verzoegern
      // noch scheitern lassen.
      void this.store
        .createVersion(id, { automatisch: true, kommentar: 'Stand beim Öffnen' })
        .catch((e) => this.log.warn('Persistenz', 'Öffnen-Snapshot fehlgeschlagen', e));
    }
    await this.uebernehmeDoc(doc);
    if (schreibschutz) {
      // Editor wirklich sperren (nicht nur den Autosave): Externe betrachten
      // abgenommene Profile read-only — nach uebernehmeDoc setzen, da
      // loadProfile readOnly zuruecksetzt.
      this.state.readOnly.set(true);
      this.state.autosaveInfo.set('von der BLK-AG abgenommen — schreibgeschützt');
      this.toast.show(
        'Von der BLK-AG abgenommen — nur betrachten. Zum Bearbeiten als BLK-AG anmelden oder eine Kopie anlegen.',
      );
    }
  }

  /**
   * Version des aktiven Profils wiederherstellen (in-place). Der Server sichert
   * den Arbeitsstand unmittelbar davor als Sicherheits-Version. Bewusst NICHT
   * ueber openFromLibrary: der Oeffnen-Snapshot wuerde nach dem Restore sofort
   * eine weitere Automatik-Version erzeugen. Gibt false bei Fehler.
   */
  async restoreVersion(versionId: string): Promise<boolean> {
    const id = this.state.activeProfileId();
    if (!id) return false;
    await this.flushAutosave();
    let doc: ProfileDoc;
    try {
      doc = await this.store.restoreVersion(id, versionId);
    } catch (e) {
      this.log.error('Persistenz', `Version ${versionId} nicht wiederherstellbar`, e);
      this.toast.show('Version konnte nicht wiederhergestellt werden — Backend nicht erreichbar.');
      return false;
    }
    await this.uebernehmeDoc(doc);
    this.toast.show(
      'Version wiederhergestellt — der vorherige Arbeitsstand ist als Sicherheits-Version gesichert.',
    );
    return true;
  }

  /**
   * Geladenes bzw. wiederhergestelltes Dokument in den Editor uebernehmen:
   * Profil-State setzen, bei Bedarf die XJustiz-Version des Profils laden und
   * die Nachricht aufbauen. Gemeinsamer Schwanz von openFromLibrary und
   * restoreVersion.
   */
  private async uebernehmeDoc(doc: ProfileDoc): Promise<void> {
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
    this.state.abnahmeSchreibschutz.set(false);
    this.state.resetProfile();
    this.state.msgName.set(null);
    this.state.root.set(null);
    // Neue Profilierung startet gefuehrt (US "Profilierung gefuehrt erstellen");
    // nach resetProfile setzen, da loadProfile guided zuruecksetzt.
    this.state.guided.set(true);
    this.state.view.set('editor');
  }

  /**
   * Ein beliebiges Profil-Dokument als Datei exportieren (auch nicht-aktiv).
   * Die Hinweise stehen unter einem eigenen Top-Level-Schluessel neben
   * `elemente`/`auspraegungen` — sie sind kein Teil des Dokuments (ADR 0014),
   * sollen den Dateiaustausch aber ueberleben.
   */
  exportDoc(doc: ProfileDoc, hinweise: Hinweis[] = []): void {
    const json = JSON.stringify(
      {
        app: 'xjustiz-profilierer',
        formatVersion: 4,
        meta: doc.meta,
        statuses: doc.statuses,
        elemente: doc.elemente,
        auspraegungen: doc.auspraegungen,
        erweiterungen: doc.erweiterungen,
        hinweise: hinweise.map(({ pfad, text, autor, rolle, zeit, erledigt }) => ({
          pfad,
          text,
          autor,
          rolle,
          zeit,
          erledigt,
        })),
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
    this.exportDoc(this.state.profileDoc(), this.hinweise.hinweise());
    this.toast.show('Profil gespeichert.');
  }

  /**
   * Ein Profil aus der Bibliothek als Datei exportieren (Dashboard, ohne es zu
   * oeffnen): Dokument und Hinweise liegen getrennt und werden hier wieder
   * zusammengefuehrt. Gibt false, wenn nichts geschrieben wurde.
   */
  async exportProfil(id: string): Promise<boolean> {
    const doc = await this.store.load(id);
    if (!doc) return false;
    let hinweise: Hinweis[] = [];
    try {
      hinweise = await this.hinweise.hole(id);
    } catch (e) {
      // Ohne Hinweise exportieren ist besser als gar nicht.
      this.log.warn('Persistenz', `Hinweise zu ${id} nicht ladbar — Export ohne sie`, e);
    }
    this.exportDoc(doc, hinweise);
    return true;
  }

  /**
   * migrateV1 (Z.1794-1804): altes Format auf v2 heben.
   * `any` ist hier gewollt — die Eingabe ist eine ungetypte v1-JSON-Struktur,
   * die es als Interface nie gab. Typisierung waere Fiktion.
   */
  /* eslint-disable @typescript-eslint/no-explicit-any */
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
  /* eslint-enable @typescript-eslint/no-explicit-any */

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
      // Hinweise aus dem eigenen Schluessel bzw. — bei Dateien vor v4 — aus den
      // Altfeldern im Dokument; sie werden getrennt geschrieben, nicht mit dem
      // Dokument. Ein Import ersetzt die Hinweise, er fuehrt sie nicht zusammen.
      const hinweise = hinweiseAusDatei(data, prof, Date.now());
      const id = await this.store.create(prof);
      if (hinweise.length) await this.hinweise.ersetzeAlle(id, hinweise);
      await this.openFromLibrary(id);
    } catch (e) {
      this.toast.show(
        'Profil konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : e),
      );
    }
  }
}
