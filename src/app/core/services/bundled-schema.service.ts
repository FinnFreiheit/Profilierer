import { Injectable, inject } from '@angular/core';
import { BundledVersion } from '../../models/schema-bundle.model';
import { RemoteSchemaService } from './remote-schema.service';
import { SchemaStoreService } from './schema-store.service';
import { alsFiles } from '../util/schema-quellen.util';

/** Basis-URL der hinterlegten Schemata (Angular serviert public/ unter root). */
const SCHEMA_BASE = 'schemas';

/**
 * Laedt die im Projekt hinterlegten XJustiz-Schemata (public/schemas/) per
 * fetch, damit kein XSD-Ordner mehr hochgeladen werden muss. Die Dateien werden
 * in `File`-Objekte verpackt und ueber die bestehenden Ladewege
 * (PersistenceService.loadXsdFiles / DiffService.loadXsdB) verarbeitet.
 *
 * Fuer Versionen von xjustiz.de ist dieser Dienst die **Naht zwischen Ablage
 * und Quelle**: gespeichert wird bevorzugt gelesen, nur was fehlt (oder
 * ausdruecklich erneuert wird) kommt frisch aus dem ZIP — und wandert dabei in
 * den Speicher. Eine einmal geholte Version bleibt damit auch nach dem
 * Neuladen der Seite waehlbar.
 */
@Injectable({ providedIn: 'root' })
export class BundledSchemaService {
  private readonly remote = inject(RemoteSchemaService);
  private readonly schemas = inject(SchemaStoreService);
  private manifestCache: Promise<BundledVersion[]> | null = null;

  /** Manifest der verfuegbaren Versionen (einmalig geladen und gecacht). */
  manifest(): Promise<BundledVersion[]> {
    if (!this.manifestCache) {
      this.manifestCache = fetch(`${SCHEMA_BASE}/index.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`Schema-Manifest nicht gefunden (${r.status}).`);
          return r.json() as Promise<BundledVersion[]>;
        })
        .catch((e) => {
          this.manifestCache = null;
          throw e;
        });
    }
    return this.manifestCache;
  }

  /**
   * XSD-Dateien einer Version als `File[]` (fuer die Ladewege). Versionen mit
   * `zipUrl` stammen von xjustiz.de; fuer die Konsumenten (Diff, Validierung,
   * Testnachrichten) macht die Herkunft keinen Unterschied.
   *
   * `erneuern` uebergeht den Speicher und holt das ZIP neu — der eine Weg,
   * eine gespeicherte Version auf den veroeffentlichten Stand zu bringen
   * (Nachlieferung). Ohne das Kennzeichen wird nichts nachgeladen: der
   * Abruf bleibt eine bewusste Handlung.
   */
  async files(v: BundledVersion, opts: { erneuern?: boolean } = {}): Promise<File[]> {
    if (!v.zipUrl) return this.hinterlegteDateien(v);
    if (!opts.erneuern) {
      const gespeichert = await this.schemas.dateien(v.id).catch(() => null);
      if (gespeichert?.length) return alsFiles(gespeichert);
    }
    const dateien = await this.remote.dateien(v);
    // Best effort: der Aufrufer hat die Dateien schon, ein Ausfall der Ablage
    // kostet ihn nur den naechsten Abruf (der Store meldet ihn im Protokoll).
    await this.schemas.merke(v, dateien);
    return alsFiles(dateien);
  }

  private async hinterlegteDateien(v: BundledVersion): Promise<File[]> {
    return Promise.all(
      v.files.map(async (name) => {
        const r = await fetch(`${SCHEMA_BASE}/${v.dir}/${encodeURIComponent(name)}`);
        if (!r.ok) throw new Error(`Schemadatei nicht gefunden: ${name} (${r.status}).`);
        const text = await r.text();
        return new File([text], name, { type: 'application/xml' });
      }),
    );
  }
}
