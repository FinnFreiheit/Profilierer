import { Injectable, inject } from '@angular/core';
import { BundledVersion } from '../../models/schema-bundle.model';
import { LoggerService } from './logger.service';

/** Basis der offiziellen Veroeffentlichungsseite. */
const XJUSTIZ = 'https://xjustiz.justiz.de';
/** Uebersichtsseite mit den Links auf Schemata/Schematron/Spezifikation je Version. */
const VERSIONSSEITE = '/XJustiz-Versionen/index.php';
/** Dev-Proxy (proxy.conf.json) bzw. Server-Proxy (server/index.js) — same-origin. */
const PROXY = 'xjustiz-api';
/** Zustimmung zu oeffentlichen CORS-Weiterleitungen — geteilt mit dem CodelistService. */
const CORS_KEY = 'xjp.corsproxy';

/** Oeffentliche CORS-Weiterleitungsdienste (Fallback, wie beim XRepository-Abruf). */
const CORS_PROXIES: Array<(u: string) => string> = [
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
];

/** Ergebnis des Seiten-Parsers. */
export interface Versionsseite {
  /** Vollstaendige XSD-Pakete, neueste zuerst. */
  versionen: BundledVersion[];
  /**
   * Versionen, zu denen die Seite (nur) eine **Nachlieferung** anbietet —
   * ein Teilpaket mit den geaenderten Fachmodulen, kein Ersatz fuer das
   * vollstaendige Schema. Wird nicht geladen, sondern gemeldet.
   */
  nachlieferungen: string[];
}

/**
 * Laedt XJustiz-Schemaversionen direkt von xjustiz.de — analog zum
 * Codelisten-Abruf aus dem XRepository (CodelistService). Zweck: den jeweils
 * veroeffentlichten Stand holen, ohne auf die im Projekt hinterlegten Kopien
 * (public/schemas/) angewiesen zu sein. Wichtig bei Nachlieferungen, die eine
 * bestehende Version (z. B. 3.6.2) nachtraeglich aendern.
 *
 * xjustiz.de sendet keine CORS-Header, deshalb laeuft der Abruf ueber den
 * gleichnamigen Proxy-Pfad (Dev: proxy.conf.json, Prod: server/index.js);
 * oeffentliche Weiterleitungsdienste dienen nur als Notnagel.
 */
@Injectable({ providedIn: 'root' })
export class RemoteSchemaService {
  private readonly log = inject(LoggerService);

  /** Versionsliste der letzten Abfrage (pro Sitzung, per `versionen(true)` verworfen). */
  private listeCache: Promise<Versionsseite> | null = null;
  /** Entpackte ZIPs je Pfad — Dateiinhalte, aus denen `File`-Objekte erzeugt werden. */
  private readonly zipCache = new Map<string, Promise<{ name: string; text: string }[]>>();

  /**
   * Verfuegbare Versionen von der Uebersichtsseite. `neu = true` verwirft den
   * Sitzungs-Cache (Aktualisieren nach einer Nachlieferung).
   */
  versionen(neu = false): Promise<Versionsseite> {
    if (neu) {
      this.listeCache = null;
      this.zipCache.clear();
    }
    if (!this.listeCache) {
      this.listeCache = this.holeVersionen().catch((e) => {
        this.listeCache = null;
        throw e;
      });
    }
    return this.listeCache;
  }

  private async holeVersionen(): Promise<Versionsseite> {
    const resp = await this.hole(VERSIONSSEITE);
    const seite = this.parseVersionsseite(await resp.text());
    if (!seite.versionen.length)
      throw new Error('Auf der Versionsseite von xjustiz.de wurden keine Schema-ZIPs gefunden');
    return seite;
  }

  /**
   * Extrahiert die Schema-ZIP-Links aus dem HTML der Versionsseite. Bewusst
   * ueber ein Muster statt fester URLs: die Dateinamen sind uneinheitlich
   * (`XJustiz_3_6_2_XSD.zip` vs. `XJustiz-4_0_0-XSD.zip`). Schematron-Pakete
   * (`..._SCH.zip`, `...-Schematron.zip`) werden ausgeschlossen.
   *
   * **Nachlieferungen** (`XJustiz_3_6_2_Nachlieferung:ZVSTR_08_2026_XSD.zip`)
   * zaehlen nicht als Version: sie enthalten nur die geaenderten Fachmodule
   * und wuerden, als Paket geladen, das vollstaendige Schema derselben Version
   * durch ein Bruchstueck ersetzen. Sie werden getrennt gemeldet.
   */
  parseVersionsseite(html: string): Versionsseite {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const gefunden = new Map<string, BundledVersion>();
    const nachlieferungen = new Set<string>();
    for (const a of Array.from(dom.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') || '';
      if (!/\.zip($|\?)/i.test(href)) continue;
      const datei = href.split(/[/\\]/).pop() || '';
      if (!/xsd|schemata/i.test(datei)) continue;
      if (/schematron|[._-]sch[._-]/i.test(datei)) continue;
      const m = datei.match(/(\d+)[._-](\d+)(?:[._-](\d+))?/);
      if (!m) continue;
      const version = [m[1], m[2], m[3] ?? '0'].join('.');
      if (/nachlieferung/i.test(datei)) {
        nachlieferungen.add(version);
        continue;
      }
      if (gefunden.has(version)) continue;
      gefunden.set(version, {
        id: version,
        label: version,
        dir: `xjustiz.de/${version}`,
        files: [],
        zipUrl: this.absoluterPfad(href),
        hinweis: (a.textContent ?? '').trim() || datei,
      });
    }
    return {
      // Neueste Version zuerst.
      versionen: Array.from(gefunden.values()).sort((a, b) =>
        b.id.localeCompare(a.id, undefined, { numeric: true }),
      ),
      nachlieferungen: Array.from(nachlieferungen).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true }),
      ),
    };
  }

  /** Relative Links der Versionsseite (`../system/zip/…`) auf einen Serverpfad bringen. */
  private absoluterPfad(href: string): string {
    if (/^https?:\/\//i.test(href)) return new URL(href).pathname;
    return new URL(href, XJUSTIZ + VERSIONSSEITE).pathname;
  }

  /**
   * XSD-Dateien einer von xjustiz.de bezogenen Version als `File[]` — gleicher
   * Ladeweg wie bei den hinterlegten Schemata. Der ZIP-Ordner im Archiv wird
   * abgeschnitten, die Dateinamen bleiben flach (Imports zwischen den XSDs
   * verweisen ohne Pfad aufeinander).
   */
  async files(v: BundledVersion): Promise<File[]> {
    if (!v.zipUrl) throw new Error('Keine Bezugsquelle hinterlegt: ' + v.id);
    const dateien = await this.zipInhalt(v.zipUrl);
    return dateien.map((d) => new File([d.text], d.name, { type: 'application/xml' }));
  }

  private zipInhalt(pfad: string): Promise<{ name: string; text: string }[]> {
    let p = this.zipCache.get(pfad);
    if (!p) {
      p = (async () => {
        const resp = await this.hole(pfad);
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(await resp.arrayBuffer());
        const out: { name: string; text: string }[] = [];
        for (const name of Object.keys(zip.files)) {
          const entry = zip.files[name]!;
          if (entry.dir || !name.toLowerCase().endsWith('.xsd')) continue;
          out.push({ name: name.split(/[/\\]/).pop()!, text: await entry.async('string') });
        }
        if (!out.length) throw new Error('Das ZIP von xjustiz.de enthaelt keine XSD-Dateien');
        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
      })();
      p.catch(() => this.zipCache.delete(pfad));
      this.zipCache.set(pfad, p);
    }
    return p;
  }

  /**
   * Abrufkette: Proxy (same-origin) → Direktabruf → oeffentliche Weiterleitung.
   * Der letzte Schritt nur, wenn der Nutzer ihr fuer diese Sitzung/Installation
   * schon zugestimmt hat (gleicher Schalter wie beim XRepository-Abruf) —
   * ungefragt wird nichts an Dritte weitergereicht.
   */
  private async hole(pfad: string): Promise<Response> {
    const url = XJUSTIZ + pfad;
    let letzterFehler: unknown;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try {
        const r = await fetch(PROXY + pfad);
        if (r.ok) return r;
        letzterFehler = new Error('HTTP ' + r.status);
      } catch (e) {
        letzterFehler = e;
      }
    }
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      letzterFehler = new Error('HTTP ' + r.status);
    } catch (e) {
      letzterFehler = e;
    }
    let erlaubt = false;
    try {
      erlaubt = localStorage.getItem(CORS_KEY) === 'ja';
    } catch {
      /* ignore */
    }
    if (erlaubt) {
      for (const p of CORS_PROXIES) {
        try {
          const r = await fetch(p(url));
          if (r.ok) return r;
          letzterFehler = new Error('HTTP ' + r.status);
        } catch (e) {
          letzterFehler = e;
        }
      }
    }
    this.log.warn('xjustiz.de', 'Abruf fehlgeschlagen: ' + url, letzterFehler);
    throw new Error(
      ((letzterFehler instanceof Error && letzterFehler.message) || 'Abruf fehlgeschlagen') +
        ' — xjustiz.de erlaubt keinen Direktabruf aus dem Browser; zuverlaessig klappt es ' +
        'ueber den Dev-Proxy (npm start) oder den Server (npm run start:prod)',
    );
  }
}
