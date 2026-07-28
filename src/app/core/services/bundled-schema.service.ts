import { Injectable, inject } from '@angular/core';
import { BundledVersion } from '../../models/schema-bundle.model';
import { RemoteSchemaService } from './remote-schema.service';

/** Basis-URL der hinterlegten Schemata (Angular serviert public/ unter root). */
const SCHEMA_BASE = 'schemas';

/**
 * Laedt die im Projekt hinterlegten XJustiz-Schemata (public/schemas/) per
 * fetch, damit kein XSD-Ordner mehr hochgeladen werden muss. Die Dateien werden
 * in `File`-Objekte verpackt und ueber die bestehenden Ladewege
 * (PersistenceService.loadXsdFiles / DiffService.loadXsdB) verarbeitet.
 */
@Injectable({ providedIn: 'root' })
export class BundledSchemaService {
  private readonly remote = inject(RemoteSchemaService);
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
   * `zipUrl` stammen von xjustiz.de und kommen aus dem dortigen ZIP — fuer die
   * Konsumenten (Diff, Validierung, Testnachrichten) macht das keinen Unterschied.
   */
  async files(v: BundledVersion): Promise<File[]> {
    if (v.zipUrl) return this.remote.files(v);
    const out = await Promise.all(
      v.files.map(async (name) => {
        const r = await fetch(`${SCHEMA_BASE}/${v.dir}/${encodeURIComponent(name)}`);
        if (!r.ok) throw new Error(`Schemadatei nicht gefunden: ${name} (${r.status}).`);
        const text = await r.text();
        return new File([text], name, { type: 'application/xml' });
      }),
    );
    return out;
  }
}
