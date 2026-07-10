import { Injectable, computed, signal } from '@angular/core';
import {
  Auspraegung,
  ElementProfile,
  ProfileDoc,
  ProfileMeta,
  Status,
  Wirkung,
} from '../../models/profile.model';
import { TreeItem, TreeNode, itemPath } from '../../models/node.model';
import { Codelist } from '../../models/codelist.model';
import { DiffAnc, DiffEntry } from '../../models/diff.model';
import { XsdDoc, XsdIndex } from '../../models/xsd-index.model';
import { newProfile } from '../profile-defaults';
import { pretty } from '../util/pretty.util';
import { REF_TARGETS } from '../refs';

/**
 * Zentraler Signals-Store. Ersetzt das globale `S`/`S.profile` aus
 * Profilierer.html (Z.327-335). Jedes Zustandsfeld ist ein Signal; abgeleitete
 * Sichten sind `computed`. Die imperative `renderAll()`-Kaskade entfaellt —
 * die Angular-Change-Detection reagiert auf Signal-Aenderungen.
 *
 * Wichtig: Signals vergleichen per Referenz. Jede Mutation der pfad-indizierten
 * Maps erzeugt daher eine neue Objekt-/Set-Referenz.
 */
@Injectable({ providedIn: 'root' })
export class StateService {
  // ── Schema / Nachricht ──────────────────────────────────────────────
  readonly docs = signal<XsdDoc[]>([]);
  readonly idx = signal<XsdIndex | null>(null);
  readonly version = signal('');
  readonly standardKennung = signal('');
  readonly msgName = signal<string | null>(null);
  readonly root = signal<TreeNode | null>(null);

  // ── Profil (frueher S.profile) ──────────────────────────────────────
  readonly meta = signal<ProfileMeta>({});
  readonly statuses = signal<Status[]>(newProfile().statuses);
  readonly elemente = signal<Record<string, ElementProfile>>({});
  readonly auspraegungen = signal<Record<string, Auspraegung[]>>({});

  // ── UI-Zustand ──────────────────────────────────────────────────────
  readonly selItem = signal<TreeItem | null>(null);
  readonly open = signal<ReadonlySet<string>>(new Set());
  readonly codelists = signal<Record<string, Codelist>>({});
  readonly showTech = signal(false);
  readonly onlyProfile = signal(false);
  readonly showRefs = signal(true);
  readonly focusMode = signal(true);
  /** Profil, das vor dem XSD-Ordner geladen wurde (loadProfileFile, Z.1813). */
  readonly pendingMsg = signal<ProfileDoc | null>(null);
  /** Anzeige "automatisch gesichert HH:MM" (autosaveNow, Z.1481). */
  readonly autosaveInfo = signal('');

  /** Scroll-/Flash-Anforderung an den TreeCanvas (scrollToPath, Z.682-691). */
  readonly scrollTarget = signal<{ path: string; seq: number } | null>(null);
  private scrollN = 0;
  requestScroll(path: string): void {
    this.scrollTarget.set({ path, seq: ++this.scrollN });
  }

  // ── Versionsvergleich (Diff) ────────────────────────────────────────
  readonly showDiff = signal(false);
  readonly diffMap = signal<Map<string, DiffEntry> | null>(null);
  readonly diffAnc = signal<Map<string, DiffAnc> | null>(null);
  readonly diffMsgMissing = signal(false);
  readonly idxB = signal<XsdIndex | null>(null);

  /** Laufender Zaehler fuer Ausprägungs-IDs (wie AUSPN, Z.1016). */
  private auspN = 0;

  // ── Abgeleitete Sichten ─────────────────────────────────────────────

  /** Das komplette Profil-Dokument als eine Sicht (fuer Persistenz/Export). */
  readonly profileDoc = computed<ProfileDoc>(() => ({
    meta: this.meta(),
    statuses: this.statuses(),
    elemente: this.elemente(),
    auspraegungen: this.auspraegungen(),
  }));

  /** Fortschrittszaehler (updateFortschritt, Z.1453-1456). */
  readonly fortschritt = computed(() => {
    const nStatus = Object.values(this.elemente()).filter((p) => p.status).length;
    const nAusp = Object.values(this.auspraegungen()).reduce((s, l) => s + l.length, 0);
    return { nStatus, nAusp };
  });

  // ── Status-Zugriff ──────────────────────────────────────────────────

  /** statusById (Z.335). */
  statusById(id: string): Status | null {
    return this.statuses().find((s) => s.id === id) ?? null;
  }

  /** Die Statusstufe mit Wirkung "ausgeschlossen" (exclStatus, Z.603). */
  exclStatus(): Status | null {
    return this.statuses().find((s) => s.wirkung === 'ausgeschlossen') ?? null;
  }

  /** statusOf (Z.997). */
  statusOf(path: string): Status | null {
    const p = this.elemente()[path];
    return p?.status ? this.statusById(p.status) : null;
  }

  /** wirkungOf (Z.998). */
  wirkungOf(path: string): Wirkung | null {
    return this.statusOf(path)?.wirkung ?? null;
  }

  /** ancestorPaths (Z.999-1003). */
  ancestorPaths(path: string): string[] {
    const segs = path.split('/');
    const r: string[] = [];
    for (let i = 1; i < segs.length; i++) r.push(segs.slice(0, i).join('/'));
    return r;
  }

  /** inheritedExcluded (Z.1004-1006). */
  inheritedExcluded(path: string): boolean {
    return this.ancestorPaths(path).some((a) => this.wirkungOf(a) === 'ausgeschlossen');
  }

  /** hasNotes (Z.1011-1014). */
  hasNotes(path: string): boolean {
    const p = this.elemente()[path];
    return !!(p && (p.anmerkung || p.beispiel || (p.werte && p.werte.length)));
  }

  /** "nur Profil" blendet Ausgeschlossenes aus (renderBox Z.1211). */
  boxHidden(path: string): boolean {
    if (!this.onlyProfile()) return false;
    const st = this.statusOf(path);
    return st?.wirkung === 'ausgeschlossen' || this.inheritedExcluded(path);
  }

  /** effKard (Z.1007-1010): effektive Kardinalitaet inkl. Override. */
  effKard(node: TreeNode): { min: string; max: string; changed: boolean } {
    const p = this.elemente()[node.path] ?? {};
    return { min: p.min || node.min, max: p.max || node.max, changed: !!(p.min || p.max) };
  }

  // ── Profil-Mutationen ───────────────────────────────────────────────

  /**
   * Merged `patch` in den Element-Eintrag und raeumt leere Eintraege weg
   * (kapselt pOf + pruneP, Z.987-996). Felder werden mit `undefined`
   * geloescht.
   */
  setElementProfile(path: string, patch: Partial<ElementProfile>): void {
    this.elemente.update((m) => {
      const merged: ElementProfile = { ...(m[path] ?? {}), ...patch };
      const next = { ...m, [path]: merged };
      if (this.isEmptyProfile(merged)) delete next[path];
      return next;
    });
  }

  /** pruneP-Kriterium (Z.994). */
  private isEmptyProfile(p: ElementProfile): boolean {
    return (
      !p.status && !p.anmerkung && !p.beispiel && !p.min && !p.max && !p.refZiel &&
      !(p.werte && p.werte.length)
    );
  }

  /** auspsOf (Z.1015). */
  auspsOf(path: string): Auspraegung[] | null {
    return this.auspraegungen()[path] ?? null;
  }

  /** addAusp (Z.1017-1022): haengt eine benannte Auspraegung an. */
  addAusp(path: string, name?: string): string {
    const id = 'a' + Date.now().toString(36) + ++this.auspN;
    this.auspraegungen.update((m) => {
      const list = m[path] ? [...m[path]!] : [];
      list.push({ id, name: name || 'Ausprägung ' + (list.length + 1) });
      return { ...m, [path]: list };
    });
    return id;
  }

  /**
   * removeAusp (Z.1023-1035): entfernt eine Auspraegung und kaskadierend alle
   * darunter liegenden Profil-Eintraege und Unter-Ausprägungen; bereinigt
   * Auswahl und Oeffnungszustaende.
   */
  removeAusp(path: string, id: string): void {
    const lists = this.auspraegungen();
    const list = lists[path];
    if (!list) return;
    const prefix = path + '@' + id;

    this.auspraegungen.update((m) => {
      const next = { ...m };
      const rest = (next[path] ?? []).filter((a) => a.id !== id);
      if (rest.length) next[path] = rest;
      else delete next[path];
      // Unter-Ausprägungen der entfernten Auspraegung wegraeumen.
      for (const k of Object.keys(next)) {
        if (k.startsWith(prefix + '/')) delete next[k];
      }
      return next;
    });

    this.elemente.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (k === prefix || k.startsWith(prefix + '/')) delete next[k];
      }
      return next;
    });

    const sel = this.selItem();
    if (sel && itemPath(sel).startsWith(prefix)) this.selItem.set(null);

    this.open.update((s) => {
      const next = new Set(s);
      for (const p of s) if (p.startsWith(prefix)) next.delete(p);
      return next;
    });
  }

  // ── Oeffnungszustaende ──────────────────────────────────────────────

  isOpen(path: string): boolean {
    return this.open().has(path);
  }

  toggleOpen(path: string): void {
    this.open.update((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  setOpen(path: string, open: boolean): void {
    this.open.update((s) => {
      if (s.has(path) === open) return s;
      const next = new Set(s);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  // ── Status-Konfiguration & Profil-Lebenszyklus ──────────────────────

  setStatuses(statuses: Status[]): void {
    this.statuses.set(statuses);
  }

  patchMeta(patch: Partial<ProfileMeta>): void {
    this.meta.update((m) => ({ ...m, ...patch }));
  }

  /** Setzt das Profil komplett neu (loadProfile). */
  loadProfile(doc: ProfileDoc): void {
    this.meta.set(doc.meta ?? {});
    this.statuses.set(doc.statuses ?? newProfile().statuses);
    this.elemente.set(doc.elemente ?? {});
    this.auspraegungen.set(doc.auspraegungen ?? {});
    this.selItem.set(null);
    this.open.set(new Set());
  }

  /** Frisches, leeres Profil (newProfile). */
  resetProfile(): void {
    this.loadProfile(newProfile());
  }

  // ── Ausprägungs-Nummern / -Label ────────────────────────────────────

  /** auspNumber (Z.626-633): 1-basierte Nummer einer Auspraegung. */
  auspNumber(auspPath: string): number | null {
    const i = auspPath.lastIndexOf('@');
    if (i < 0) return null;
    const list = this.auspsOf(auspPath.slice(0, i));
    if (!list) return null;
    const idx = list.findIndex((a) => a.id === auspPath.slice(i + 1));
    return idx >= 0 ? idx + 1 : null;
  }

  /** auspLabel (Z.634-640): "Element „Name"" fuer ein Verweisziel. */
  auspLabel(auspPath: string): string {
    const i = auspPath.lastIndexOf('@');
    if (i < 0) return auspPath;
    const a = (this.auspsOf(auspPath.slice(0, i)) ?? []).find((x) => x.id === auspPath.slice(i + 1));
    const elName = auspPath.slice(0, i).split('/').pop()!.split('#')[0]!;
    return a ? pretty(elName) + ' „' + a.name + '"' : '(gelöschtes Ziel)';
  }

  // ── Duplizieren (Z.1393-1434) ───────────────────────────────────────

  private moveSubProfile(fromPrefix: string, toPrefix: string): void {
    this.elemente.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = next[k]!;
          delete next[k];
        }
      }
      return next;
    });
    this.auspraegungen.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = next[k]!;
          delete next[k];
        }
      }
      return next;
    });
  }

  private copySubProfile(fromPrefix: string, toPrefix: string): void {
    this.elemente.update((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(m)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = { ...v, werte: v.werte ? [...v.werte] : undefined };
        }
      }
      return next;
    });
    this.auspraegungen.update((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(m)) {
        if (k.startsWith(fromPrefix)) {
          next[toPrefix + k.slice(fromPrefix.length)] = v.map((a) => ({ ...a }));
        }
      }
      return next;
    });
  }

  /** duplicateElement (Z.1416-1424): wiederholbares Element als Faelle fuehren. */
  duplicateElement(path: string): void {
    const ausps = this.auspsOf(path);
    if (ausps && ausps.length) {
      this.addAusp(path, 'Fall ' + (ausps.length + 1));
      this.setOpen(path, true);
      return;
    }
    const id1 = this.addAusp(path, 'Fall 1');
    this.moveSubProfile(path + '/', path + '@' + id1 + '/');
    this.addAusp(path, 'Fall 2');
    this.setOpen(path, true);
  }

  /**
   * renameAusp: Namen einer Auspraegung aendern. Mutiert den Namen in place
   * (damit ein evtl. ausgewaehltes Item konsistent bleibt) und setzt eine neue
   * Array-Referenz, damit das Signal feuert.
   */
  renameAusp(listPath: string, id: string, name: string): void {
    const clean = name.trim();
    this.auspraegungen.update((m) => {
      const list = m[listPath];
      if (!list) return m;
      const a = list.find((x) => x.id === id);
      if (a && clean) a.name = clean;
      return { ...m, [listPath]: [...list] };
    });
  }

  /** refZielKandidaten (Z.616-624): moegliche Verweisziele fuer eine Ref-Art. */
  refZielKandidaten(kind: string): { path: string; label: string }[] {
    const names = REF_TARGETS[kind] ?? null;
    const out: { path: string; label: string }[] = [];
    for (const [path, list] of Object.entries(this.auspraegungen())) {
      const elName = path.split('/').pop()!.split('#')[0]!.split('@')[0]!;
      if (names && !names.includes(elName)) continue;
      for (const a of list) out.push({ path: path + '@' + a.id, label: pretty(elName) + ' → ' + a.name });
    }
    return out;
  }

  // ── Status-Konfiguration (openStatusDlg, Z.1669-1702) ───────────────

  addStatus(): void {
    this.statuses.update((l) => [
      ...l,
      { id: 's' + Date.now().toString(36), name: 'neuer Status', farbe: '#378ADD', wirkung: 'markierung' },
    ]);
  }

  updateStatus(id: string, patch: Partial<Status>): void {
    this.statuses.update((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  statusUsed(id: string): boolean {
    return Object.values(this.elemente()).some((p) => p.status === id);
  }

  /** Status loeschen; betroffene Elemente fallen auf "wie Standard" zurueck. */
  removeStatus(id: string): void {
    this.statuses.update((l) => l.filter((s) => s.id !== id));
    this.elemente.update((m) => {
      const next = { ...m };
      for (const [k, v] of Object.entries(next)) {
        if (v.status === id) {
          const cleaned: ElementProfile = { ...v };
          delete cleaned.status;
          if (this.isEmptyProfile(cleaned)) delete next[k];
          else next[k] = cleaned;
        }
      }
      return next;
    });
  }

  /** copyAusp (Z.1425-1434): Auspraegung samt Unter-Profilierung kopieren. */
  copyAusp(parentPath: string, auspId: string): void {
    const list = this.auspsOf(parentPath) ?? [];
    const src = list.find((a) => a.id === auspId);
    if (!src) return;
    const nid = this.addAusp(parentPath, src.name + ' (Kopie)');
    const from = parentPath + '@' + auspId;
    const to = parentPath + '@' + nid;
    const fromProfile = this.elemente()[from];
    if (fromProfile) this.setElementProfile(to, { ...fromProfile });
    this.copySubProfile(from + '/', to + '/');
    this.setOpen(parentPath, true);
  }
}
