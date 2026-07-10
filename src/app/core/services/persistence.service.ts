import { Injectable, effect, inject } from '@angular/core';
import { XsdDoc } from '../../models/xsd-index.model';
import { ProfileDoc } from '../../models/profile.model';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';
import { NavService } from './nav.service';
import { ToastService } from './toast.service';
import { defaultStatuses } from '../profile-defaults';

const AUTOSAVE_KEY = 'xjp.autosave';

/**
 * Laden von XSD-Ordnern, Profil-Persistenz und Autosave. Portiert aus
 * Profilierer.html (Funktionsgruppe G, Z.1471-1502 + 1746-1823).
 */
@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private readonly state = inject(StateService);
  private readonly parser = inject(XsdParserService);
  private readonly nav = inject(NavService);
  private readonly toast = inject(ToastService);

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Autosave: bei jeder Profil-/Nachrichtenaenderung debounced sichern
    // (scheduleAutosave, Z.1471). Der Effekt liest nur — geschrieben wird in
    // localStorage; autosaveInfo wird ausserhalb der Effekt-Ausfuehrung gesetzt.
    effect(() => {
      this.state.profileDoc();
      const msg = this.state.msgName();
      if (!msg) return;
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

    // Profil-first-Fall bzw. Autosave-Wiederherstellung (Z.1763-1768).
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
    } else if (!this.state.msgName()) {
      this.offerAutosaveRestore();
    }
    return docs.length;
  }

  /** autosaveNow (Z.1472-1483). */
  private autosaveNow(): void {
    const msg = this.state.msgName();
    if (!msg) return;
    try {
      const doc = this.state.profileDoc();
      localStorage.setItem(
        AUTOSAVE_KEY,
        JSON.stringify({
          t: Date.now(),
          msgName: msg,
          version: this.state.version(),
          meta: doc.meta,
          statuses: doc.statuses,
          elemente: doc.elemente,
          auspraegungen: doc.auspraegungen,
          name: doc.meta.name || '',
        }),
      );
      this.state.autosaveInfo.set(
        'automatisch gesichert ' +
          new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      );
    } catch {
      /* Speicher nicht verfuegbar */
    }
  }

  /** offerAutosaveRestore (Z.1484-1502). */
  offerAutosaveRestore(): boolean {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      const a = JSON.parse(raw);
      const idx = this.state.idx();
      if (!a.msgName || !idx?.el[a.msgName]) return false;
      if (!Object.keys(a.elemente || {}).length && !Object.keys(a.auspraegungen || {}).length)
        return false;
      const when = new Date(a.t).toLocaleString('de-DE');
      if (
        confirm(
          `Automatisch gesicherter Arbeitsstand gefunden:\n„${a.name || '(ohne Namen)'}" — ${a.msgName}\nStand: ${when}\n\nWiederherstellen?`,
        )
      ) {
        this.state.loadProfile({
          meta: a.meta || {},
          statuses: a.statuses || defaultStatuses(),
          elemente: a.elemente || {},
          auspraegungen: a.auspraegungen || {},
        });
        this.nav.loadMessage(a.msgName, true);
        this.toast.show('Arbeitsstand wiederhergestellt.');
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  // ── Profil speichern / laden (Z.1772-1823) ──────────────────────────

  private download(name: string, content: string, mime: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  private profilFilename(ext: string): string {
    const n = (this.state.meta().name || 'Profil').replace(/[^\wäöüÄÖÜß-]+/g, '_');
    const msg = (this.state.msgName() || '').split('.').slice(1, -1).join('.') || 'xjustiz';
    return `${n}_${msg}.${ext}`;
  }

  /** saveProfile (Z.1782-1792). */
  saveProfile(): void {
    this.state.patchMeta({
      name: (this.state.meta().name || '').trim(),
      nachricht: this.state.msgName(),
      xjustizVersion: this.state.version(),
      gespeichert: new Date().toISOString().slice(0, 10),
    });
    const doc = this.state.profileDoc();
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
    this.download(this.profilFilename('profil.json'), json, 'application/json');
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

  /** loadProfileFile (Z.1806-1822). */
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
      if (!this.state.idx()) {
        this.state.pendingMsg.set(prof);
        this.toast.show('Profil geladen — bitte jetzt den XSD-Ordner laden.');
        return;
      }
      const nachricht = prof.meta.nachricht;
      if (nachricht && this.state.idx()!.el[nachricht]) {
        this.state.loadProfile(prof);
        this.nav.loadMessage(nachricht, true);
        if (prof.meta.xjustizVersion && prof.meta.xjustizVersion !== this.state.version())
          this.toast.show(
            `Hinweis: Profil mit XJustiz ${prof.meta.xjustizVersion} erstellt, geladen ist ${this.state.version()}.`,
          );
        else this.toast.show('Profil geladen.');
      } else {
        this.toast.show('Nachricht aus dem Profil nicht gefunden: ' + (nachricht || '?'));
      }
    } catch (e) {
      this.toast.show('Profil konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : e));
    }
  }
}
