import { Injectable, effect, inject } from '@angular/core';
import { XsdDoc } from '../../models/xsd-index.model';
import { ProfileDoc } from '../../models/profile.model';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { ProfileStoreService } from './profile-store.service';
import { defaultStatuses, newProfile } from '../profile-defaults';

/**
 * Laden von XSD-Ordnern, Profil-Persistenz und Autosave. Portiert aus
 * Profilierer.html (Funktionsgruppe G, Z.1471-1502 + 1746-1823).
 *
 * Autosave und manuelles Speichern arbeiten gegen die Profil-Bibliothek
 * (ProfileStoreService): der Autosave schreibt fortlaufend in den aktiven
 * Bibliothekseintrag (state.activeProfileId), nicht mehr in einen anonymen Slot.
 */
@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private readonly state = inject(StateService);
  private readonly parser = inject(XsdParserService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);
  private readonly store = inject(ProfileStoreService);

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Autosave: bei jeder Profil-/Nachrichtenaenderung debounced in den aktiven
    // Bibliothekseintrag sichern (scheduleAutosave, Z.1471). Der Effekt liest
    // nur — geschrieben wird ausserhalb der Effekt-Ausfuehrung in autosaveNow.
    effect(() => {
      this.state.profileDoc();
      const msg = this.state.msgName();
      const id = this.state.activeProfileId();
      if (!msg || !id) return;
      if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => this.autosaveNow(), 800);
    });
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
      if (dom.getElementsByTagName('parsererror').length) {
        console.warn('Parse-Fehler in', f.name);
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
   * autosaveNow (Z.1472-1483): den aktuellen Stand in den aktiven
   * Bibliothekseintrag schreiben. Nachricht und Version werden in die
   * gespeicherte Meta gemischt (ohne den Store zu mutieren — das wuerde den
   * Autosave-Effekt erneut ausloesen), damit der Bibliothekseintrag den
   * Nachrichtentyp anzeigt und ein Export vollstaendig bleibt.
   */
  private autosaveNow(): void {
    const msg = this.state.msgName();
    const id = this.state.activeProfileId();
    if (!msg || !id) return;
    try {
      const doc = this.state.profileDoc();
      const merged: ProfileDoc = {
        ...doc,
        meta: { ...doc.meta, nachricht: msg, xjustizVersion: this.state.version() },
      };
      this.store.upsert(id, merged);
      this.state.autosaveInfo.set(
        'automatisch gesichert ' +
          new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      );
    } catch {
      /* Speicher nicht verfuegbar */
    }
  }

  // ── Bibliothek: Oeffnen / Neu / Import / Export ─────────────────────

  /** Ein Bibliotheksprofil oeffnen und in den Editor wechseln. */
  openFromLibrary(id: string): void {
    const doc = this.store.load(id);
    if (!doc) {
      this.toast.show('Profil nicht gefunden.');
      return;
    }
    this.state.activeProfileId.set(id);
    this.state.loadProfile(doc);
    const nachricht = doc.meta.nachricht;

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
  createNew(): void {
    const id = this.store.create(newProfile());
    this.state.activeProfileId.set(id);
    this.state.resetProfile();
    this.state.msgName.set(null);
    this.state.root.set(null);
    this.state.view.set('editor');
  }

  /** Ein beliebiges Profil-Dokument als Datei exportieren (auch nicht-aktiv). */
  exportDoc(doc: ProfileDoc): void {
    const json = JSON.stringify(
      {
        app: 'xjustiz-profilierer',
        formatVersion: 2,
        meta: doc.meta,
        statuses: doc.statuses,
        elemente: doc.elemente,
        auspraegungen: doc.auspraegungen,
      },
      null,
      2,
    );
    const n = (doc.meta.name || 'Profil').replace(/[^\wäöüÄÖÜß-]+/g, '_');
    const msg = (doc.meta.nachricht || '').split('.').slice(1, -1).join('.') || 'xjustiz';
    this.download(`${n}_${msg}.profil.json`, json, 'application/json');
  }

  // ── Profil speichern / laden (Z.1772-1823) ──────────────────────────

  private download(name: string, content: string, mime: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

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
    return { meta: data.meta || {}, statuses: st, elemente, auspraegungen: {} };
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
            }
          : this.migrateV1(data);
      const id = this.store.create(prof);
      this.openFromLibrary(id);
    } catch (e) {
      this.toast.show('Profil konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : e));
    }
  }
}
