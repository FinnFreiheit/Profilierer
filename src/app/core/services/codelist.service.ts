import { Injectable, inject } from '@angular/core';
import { Codelist } from '../../models/codelist.model';
import { StateService } from './state.service';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';
import { escapeRegExp } from '../util/xml.util';

const XREP = 'https://www.xrepository.de/api';
const CACHE_KEY = 'xjp.clcache';
const CORS_KEY = 'xjp.corsproxy';

/** Oeffentliche CORS-Weiterleitungsdienste (Fallback, Z.882-886). */
const XREP_PROXIES: Array<(u: string) => string> = [
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
];

/**
 * Codelisten: Genericode-Parsing, ZIP-/Datei-Import, XRepository-REST-Abruf und
 * localStorage-Cache. Portiert aus Profilierer.html (Funktionsgruppe C,
 * Z.797-978). JSZip wird dynamisch geladen (schlanker Initial-Bundle).
 */
@Injectable({ providedIn: 'root' })
export class CodelistService {
  private readonly state = inject(StateService);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerService);

  constructor() {
    this.loadCodelistCache();
  }

  /** parseGenericode (Z.808-838). */
  parseGenericode(dom: Document): Codelist | null {
    const root = dom.documentElement;
    if (!root || root.localName !== 'CodeList') return null;
    const all = (ln: string): Element[] =>
      Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === ln);
    const ident = all('Identification')[0];
    if (!ident) return null;
    const gv = (ln: string): string => {
      const e = Array.from(ident.getElementsByTagName('*')).find((x) => x.localName === ln);
      return e ? (e.textContent ?? '').trim() : '';
    };
    const kennung = gv('CanonicalUri');
    if (!kennung) return null;
    const verUri = gv('CanonicalVersionUri');
    let version = '';
    if (verUri && verUri.startsWith(kennung + '_')) version = verUri.slice(kennung.length + 1);

    const cols = all('Column').map((c) => c.getAttribute('Id') || '');
    const codeCol = cols.find((c) => c.toLowerCase() === 'code') || cols[0] || 'code';
    const labelPref = ['wert', 'beschreibung', 'bezeichnung', 'name', 'kurzbezeichnung', 'gericht', 'wertebeschreibung'];
    const labelCol =
      cols.find((c) => labelPref.includes(c.toLowerCase())) || cols.find((c) => c !== codeCol) || '';

    const werte: { value: string; label: string }[] = [];
    for (const row of all('Row')) {
      let code = '';
      let label = '';
      for (const v of Array.from(row.getElementsByTagName('*')).filter((e) => e.localName === 'Value')) {
        const ref = v.getAttribute('ColumnRef') || '';
        const sv = Array.from(v.getElementsByTagName('*')).find((e) => e.localName === 'SimpleValue');
        const txt = sv ? (sv.textContent ?? '').trim() : '';
        if (ref === codeCol) code = txt;
        else if (ref === labelCol && !label) label = txt;
      }
      if (code) werte.push({ value: code, label });
    }
    return { kennung, name: gv('ShortName') || gv('LongName'), version, werte };
  }

  /** mergeCodelist (Z.839-843): neuere/gleich aktuelle Version gewinnt. */
  mergeCodelist(cl: Codelist): void {
    this.state.codelists.update((m) => {
      const prev = m[cl.kennung];
      if (!prev || String(cl.version).localeCompare(String(prev.version), undefined, { numeric: true }) >= 0)
        return { ...m, [cl.kennung]: cl };
      return m;
    });
  }

  /** importCodelistZip (Z.844-857): alle Genericode-XML aus einem ZIP. */
  async importCodelistZip(buf: ArrayBuffer): Promise<number> {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const parser = new DOMParser();
    let ok = 0;
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name]!;
      if (entry.dir || !name.toLowerCase().endsWith('.xml')) continue;
      try {
        const cl = this.parseGenericode(parser.parseFromString(await entry.async('string'), 'application/xml'));
        if (cl && cl.werte.length) {
          this.mergeCodelist(cl);
          ok++;
        }
      } catch {
        /* keine Genericode-Datei */
      }
    }
    return ok;
  }

  /** loadCodelistFiles (Z.858-876). */
  async loadCodelistFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    const parser = new DOMParser();
    let ok = 0;
    for (const f of list.filter((f) => f.name.toLowerCase().endsWith('.zip'))) {
      try {
        ok += await this.importCodelistZip(await f.arrayBuffer());
      } catch (e) {
        this.toast.show('ZIP konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : e));
      }
    }
    for (const f of list.filter((f) => f.name.toLowerCase().endsWith('.xml'))) {
      try {
        const cl = this.parseGenericode(parser.parseFromString(await f.text(), 'application/xml'));
        if (cl && cl.werte.length) {
          this.mergeCodelist(cl);
          ok++;
        }
      } catch {
        /* keine Genericode-Datei */
      }
    }
    this.cacheCodelists();
    this.toast.show(ok ? ok + ' Codelisten geladen.' : 'Keine Genericode-Codelisten in den Dateien gefunden.');
  }

  // ── XRepository-REST ────────────────────────────────────────────────

  private viaLocalProxy(url: string): string | null {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
    return 'xrep-api/' + url.slice(XREP.length + 1);
  }

  /**
   * xrepFetch (Z.892-924): Dev-Proxy → Direktabruf → CORS-Weiterleitung.
   * `quiet`: kein CORS-Zustimmungsdialog — scheitert im Zweifel still (für das
   * automatische Vorab-Laden beim Import, das den Betrachter nicht blockieren darf).
   */
  private async xrepFetch(url: string, quiet = false): Promise<Response> {
    const lokal = this.viaLocalProxy(url);
    if (lokal) {
      try {
        const r = await fetch(lokal);
        if (r.ok) return r;
      } catch {
        /* weiter */
      }
    }
    let lastErr: unknown;
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      lastErr = new Error('HTTP ' + r.status);
    } catch (e) {
      lastErr = e;
    }
    let allowed = false;
    try {
      allowed = localStorage.getItem(CORS_KEY) === 'ja';
    } catch {
      /* ignore */
    }
    if (!allowed) {
      if (quiet)
        throw new Error('Direktabruf blockiert (CORS) — im Auto-Modus ohne Nachfrage übersprungen');
      if (
        !confirm(
          'Der Browser blockiert den Direktabruf vom XRepository (fehlende CORS-Freigabe des Servers).\n\n' +
            'Zuverlässigste Lösung: das Tool über den Angular-Dev-Server (proxy.conf.json) betreiben.\n\n' +
            'Alternativ kann der Abruf jetzt über öffentliche Weiterleitungsdienste versucht werden ' +
            '(codetabs.com, corsproxy.io, allorigins.win — nicht immer verfügbar). Die Codelisten sind öffentliche Daten.\n\n' +
            'Weiterleitungsdienste versuchen? (Zustimmung wird gemerkt)',
        )
      )
        throw new Error('Direktabruf blockiert (CORS) — ZIP über „Codelisten: Datei…" laden oder über den Dev-Proxy betreiben');
      try {
        localStorage.setItem(CORS_KEY, 'ja');
      } catch {
        /* ignore */
      }
    }
    for (const p of XREP_PROXIES) {
      try {
        const r = await fetch(p(url));
        if (r.ok) return r;
        lastErr = new Error('HTTP ' + r.status);
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(
      ((lastErr instanceof Error && lastErr.message) || 'Abruf fehlgeschlagen') +
        ' — zuverlässig klappt es über den Dev-Proxy oder den ZIP-Download',
    );
  }

  /** Standard-Kennungen, für die in dieser Sitzung schon vorab geladen wurde. */
  private readonly autoLoaded = new Set<string>();

  private standardVersionKey(): string {
    return (
      (this.state.standardKennung() || 'urn:xoev-de:blk-ag-it-standards:standard:xjustiz') +
      '_' +
      this.state.version()
    );
  }

  /**
   * Lädt die genutzten Codelisten einmalig automatisch beim Import einer
   * Nachricht — damit belegte Codes im Betrachtungsmodus zu Klartext aufgelöst
   * werden (Story 4). Still und best-effort: bereits (aus dem Cache) geladene
   * Listen werden nicht erneut aus dem Netz geholt, Fehler blockieren nicht.
   */
  async ensureUsedCodelists(): Promise<void> {
    if (!this.state.idx()) return;
    const key = this.standardVersionKey();
    if (this.autoLoaded.has(key)) return;
    // Bereits geladene/aus dem Cache stammende Listen: kein erneuter Netzabruf.
    if (Object.keys(this.state.codelists()).length) {
      this.autoLoaded.add(key);
      return;
    }
    this.autoLoaded.add(key);
    await this.loadFromXRepository(true);
  }

  /**
   * loadFromXRepository (Z.925-946): alle genutzten Codelisten des Standards.
   * `auto`: stiller Vorab-Abruf beim Import — ohne Fortschritts-Toast und ohne
   * Fehler-/Download-Dialoge (Codes bleiben dann eben roh).
   */
  async loadFromXRepository(auto = false): Promise<void> {
    if (!this.state.idx()) {
      if (!auto) this.toast.show('Bitte zuerst den XSD-Ordner laden.');
      return;
    }
    const kennung =
      (this.state.standardKennung() || 'urn:xoev-de:blk-ag-it-standards:standard:xjustiz') +
      '_' +
      this.state.version();
    const url = XREP + '/version_standard/' + encodeURIComponent(kennung) + '/genutzteAktuelleCodelisten';
    if (!auto) this.toast.show('Rufe alle genutzten Codelisten ab (kann etwas dauern)…');
    try {
      const resp = await this.xrepFetch(url, auto);
      const n = await this.importCodelistZip(await resp.arrayBuffer());
      this.cacheCodelists();
      this.toast.show(
        auto
          ? `${n} Codelisten geladen — belegte Codes werden jetzt aufgelöst.`
          : n + ' Codelisten aus dem XRepository geladen (inkl. Typ 3, aktuell gültige Versionen).',
      );
    } catch (e) {
      this.log.warn('XRepository', 'Abruf fehlgeschlagen', e);
      // Auto-Modus: still scheitern, Betrachten bleibt möglich (Codes roh).
      if (auto) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (
        confirm(
          'Direkter Abruf fehlgeschlagen (' +
            msg +
            ') — vermutlich Netzwerk- oder Browser-Beschränkung (CORS).\n\n' +
            'Alternative: ZIP im Browser herunterladen und danach über „Codelisten: Datei…" einbinden.\n\nOK öffnet den Download-Link.',
        )
      )
        window.open(url, '_blank');
    }
  }

  /** fetchSingleCodelist (Z.948-958): eine einzelne Liste ueber ihre Kennung. */
  async fetchSingleCodelist(kennung: string): Promise<Codelist> {
    const r = await this.xrepFetch(XREP + '/codeliste/' + encodeURIComponent(kennung) + '/gueltigeVersion');
    const m = (await r.text()).match(new RegExp(escapeRegExp(kennung) + '_[0-9][^<"\\s]*'));
    if (!m) throw new Error('Versionskennung nicht ermittelbar');
    const g = await this.xrepFetch(XREP + '/version_codeliste/' + encodeURIComponent(m[0]) + '/genericode');
    const cl = this.parseGenericode(new DOMParser().parseFromString(await g.text(), 'application/xml'));
    if (!cl || !cl.werte.length) throw new Error('Genericode nicht lesbar');
    this.mergeCodelist(cl);
    this.cacheCodelists();
    return cl;
  }

  // ── Cache ───────────────────────────────────────────────────────────

  /** cacheCodelists (Z.959-967). */
  cacheCodelists(): void {
    const cls = this.state.codelists();
    if (!Object.keys(cls).length) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), cls }));
    } catch (e) {
      this.log.warn('Codelisten', 'Cache konnte nicht geschrieben werden (localStorage voll?)', e);
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        /* ignore */
      }
      this.toast.show('Hinweis: Codelisten zu groß für den Browser-Cache — sie gelten nur für diese Sitzung.');
    }
  }

  /** loadCodelistCache (Z.968-978). */
  loadCodelistCache(): void {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw);
      if (c && c.cls && typeof c.cls === 'object') this.state.codelists.set(c.cls);
    } catch (e) {
      this.log.warn('Codelisten', 'Cache nicht lesbar — wird ignoriert', e);
    }
  }
}
