import { Injectable, inject } from '@angular/core';
import { StateService } from './state.service';
import { BundledSchemaService } from './bundled-schema.service';
import { XsdDoc } from '../../models/xsd-index.model';
import { ValidierungsFehler } from '../../models/validation.model';
import { parseTestmessage } from '../util/testmessage.util';

/**
 * Ergebnis einer Schemavalidierung.
 * `unpruefbar`: kein passendes Schema verfuegbar (fremde Version, nichts
 * geladen) — Aufrufer an Export-/Speicher-Toren behandeln das wie invalide,
 * denn Validitaet laesst sich nicht belegen.
 */
export interface XmlValidierung {
  status: 'valide' | 'invalide' | 'unpruefbar';
  fehler: string[];
  /** Strukturierte Fehler (gleiche Reihenfolge wie `fehler`) — Grundlage der Baum-Markierung. */
  fehlerDetails: ValidierungsFehler[];
}

interface SchemaDatei {
  fileName: string;
  contents: string;
}

/**
 * xmllint-wasm zur Laufzeit aus den mitgelieferten Assets laden (angular.json
 * kopiert index-browser.mjs, Worker und .wasm nach `xmllint/`). Bewusst kein
 * Bundler-Import: esbuild buendelt den `new Worker(...)`-Aufruf innerhalb des
 * Pakets nicht mit; ueber die Asset-URL loesen sich Worker und .wasm relativ
 * zum Modul selbst auf. Die URL wird zur Laufzeit gebaut, damit esbuild den
 * Import nicht statisch aufloest.
 */
function ladeXmllint(): Promise<typeof import('xmllint-wasm')> {
  const url = new URL('xmllint/index-browser.mjs', document.baseURI).href;
  return import(url) as Promise<typeof import('xmllint-wasm')>;
}

/**
 * XSD-Validierung von XJustiz-Instanzen im Browser (Anforderung: nur valide
 * Nachrichten duerfen exportiert/gespeichert werden). Nutzt xmllint-wasm
 * (libxml2 als WebAssembly, lazy geladen wie ExcelJS); die Schemata kommen
 * aus dem aktuell geladenen Stand (`state.docs()`, deckt auch eigene
 * XSD-Ordner ab) oder werden fuer die Version der Nachricht aus den
 * hinterlegten Schemata (`public/schemas/`) nachgeladen.
 */
@Injectable({ providedIn: 'root' })
export class XmlValidationService {
  private readonly state = inject(StateService);
  private readonly bundled = inject(BundledSchemaService);

  /** Serialisierte geladene Schemata, gecacht je docs()-Referenz. */
  private stateCache: { docs: XsdDoc[]; dateien: SchemaDatei[] } | null = null;
  /** Texte hinterlegter Versionen, gecacht je Versions-id. */
  private readonly bundleCache = new Map<string, Promise<SchemaDatei[]>>();

  /** Instanz gegen das zur Nachricht passende Schema pruefen. */
  async validiere(xmlText: string): Promise<XmlValidierung> {
    const meta = parseTestmessage(xmlText);
    if (!meta) return this.ohneZeile('invalide', ['Kein lesbares XJustiz-XML (Wurzelelement `nachricht.*` fehlt).']);

    const schemata = await this.schemataFuer(meta.nachricht, meta.xjustizVersion);
    if (!schemata) {
      return this.ohneZeile('unpruefbar', [
        `Kein passendes Schema für „${meta.nachricht}"` +
          (meta.xjustizVersion ? ` (XJustiz ${meta.xjustizVersion})` : '') +
          ' verfügbar — Validität nicht prüfbar.',
      ]);
    }

    const haupt = schemata.find((d) => d.contents.includes(`name="${meta.nachricht}"`));
    if (!haupt) {
      return this.ohneZeile('unpruefbar', [`Die Nachricht „${meta.nachricht}" ist im verfügbaren Schema nicht deklariert.`]);
    }

    try {
      const { validateXML, memoryPages } = await ladeXmllint();
      const ergebnis = await validateXML({
        xml: [{ fileName: 'nachricht.xml', contents: xmlText }],
        schema: [haupt],
        preload: schemata.filter((d) => d !== haupt),
        initialMemoryPages: memoryPages.MiB * 64,
        maxMemoryPages: memoryPages.MiB * 512,
      });
      if (ergebnis.valid) return { status: 'valide', fehler: [], fehlerDetails: [] };
      const details = ergebnis.errors.map((e) => ({ text: this.lesbar(e), zeile: e.loc?.lineNumber }));
      return { status: 'invalide', fehler: details.map((f) => f.text), fehlerDetails: details };
    } catch (e) {
      return this.ohneZeile('unpruefbar', ['Validierung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e))]);
    }
  }

  /** Ergebnis aus reinen Meldungstexten (keine Fundstellen). */
  private ohneZeile(status: XmlValidierung['status'], texte: string[]): XmlValidierung {
    return { status, fehler: texte, fehlerDetails: texte.map((text) => ({ text })) };
  }

  /** libxml2-Meldung fuer die Anzeige aufbereiten (Zeile, Namespace-Klammern). */
  private lesbar(e: { message: string; loc?: { lineNumber: number } | null }): string {
    const text = e.message
      .replace(/^Schemas validity error\s*:\s*/, '')
      .replace(/\{http:\/\/www\.xjustiz\.de\}/g, '')
      .trim();
    return e.loc?.lineNumber ? `Zeile ${e.loc.lineNumber}: ${text}` : text;
  }

  /**
   * Schemadateien fuer Nachricht+Version beschaffen: zuerst der geladene
   * Stand (wenn er die Nachricht deklariert und die Version nicht
   * widerspricht), sonst die passende hinterlegte Version; ohne
   * Versionsangabe alle hinterlegten Versionen (Standard zuerst) absuchen.
   */
  private async schemataFuer(msgName: string, version?: string): Promise<SchemaDatei[] | null> {
    const geladene = this.serialisiereDocs();
    const stateVersion = this.state.version();
    if (
      geladene.some((d) => d.contents.includes(`name="${msgName}"`)) &&
      (!version || !stateVersion || version === stateVersion)
    ) {
      return geladene;
    }

    const versionen = await this.verfuegbareVersionen();
    const kandidaten = version
      ? versionen.filter((v) => v.id === version)
      : [...versionen].sort((a, b) => Number(!!b.default) - Number(!!a.default));
    for (const v of kandidaten) {
      const dateien = await this.ladeBundle(v.id).catch(() => null);
      if (!dateien) continue;
      if (dateien.some((d) => d.contents.includes(`name="${msgName}"`))) return dateien;
    }
    return null;
  }

  private serialisiereDocs(): SchemaDatei[] {
    const docs = this.state.docs();
    if (this.stateCache?.docs === docs) return this.stateCache.dateien;
    const ser = new XMLSerializer();
    const dateien = docs.map((d) => ({ fileName: d.file, contents: ser.serializeToString(d.dom) }));
    this.stateCache = { docs, dateien };
    return dateien;
  }

  private async verfuegbareVersionen() {
    const imState = this.state.bundledVersions();
    if (imState.length) return imState;
    return this.bundled.manifest().catch(() => []);
  }

  private ladeBundle(id: string): Promise<SchemaDatei[]> {
    let p = this.bundleCache.get(id);
    if (!p) {
      p = (async () => {
        const v = (await this.verfuegbareVersionen()).find((x) => x.id === id);
        if (!v) throw new Error('Version nicht hinterlegt: ' + id);
        const files = await this.bundled.files(v);
        return Promise.all(files.map(async (f) => ({ fileName: f.name, contents: await f.text() })));
      })();
      p.catch(() => this.bundleCache.delete(id));
      this.bundleCache.set(id, p);
    }
    return p;
  }
}
