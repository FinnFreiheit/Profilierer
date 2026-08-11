import { Injectable, inject } from '@angular/core';
import { XsdDoc, XsdIndex } from '../../models/xsd-index.model';
import { BundledSchemaService } from './bundled-schema.service';
import { StateService } from './state.service';
import { XsdParserService } from './xsd-parser.service';

/**
 * Schema-Index zu einer XJustiz-Version — **ohne** den geladenen Stand zu
 * wechseln. `PersistenceService.ensureSchema` tauscht die Datenbasis der
 * ganzen Sitzung aus (`state.docs`/`idx`/`version`); fuer eine Auswertung, die
 * neben dem geoeffneten Editor laeuft, ist das der falsche Hebel: die Pruefung
 * einer 4.0.0-Nachricht duerfte den offenen 3.6.2-Baum nicht wegraeumen.
 *
 * Der geladene Stand wird trotzdem zuerst gefragt — passt seine Version, ist
 * der Index schon da und muss nicht ein zweites Mal geparst werden.
 *
 * Gecacht wird je Versions-id, weil dasselbe Schema in einer Sitzung mehrfach
 * geprueft wird (Serie von Testnachrichten zu einer Profilierung). Ein
 * gescheiterter Abruf raeumt seinen Eintrag wieder weg — sonst bliebe ein
 * einmaliger Netzfehler bis zum Neuladen bestehen (Muster wie
 * `BundledSchemaService.manifest`).
 */
@Injectable({ providedIn: 'root' })
export class SchemaIndexService {
  private readonly state = inject(StateService);
  private readonly bundled = inject(BundledSchemaService);
  private readonly parser = inject(XsdParserService);

  private readonly cache = new Map<string, Promise<XsdIndex>>();

  /**
   * Der Index zur Version — `null`, wenn sie nicht hinterlegt ist oder der
   * Abruf scheitert. Der Aufrufer meldet das als **unprüfbar**: ohne Schema
   * laesst sich weder ein Modell bilden noch Validitaet belegen (dieselbe
   * Haltung wie `XmlValidationService`).
   */
  async fuerVersion(version: string | undefined): Promise<XsdIndex | null> {
    const geladen = this.state.idx();
    if (geladen && (!version || this.state.version() === version)) return geladen;
    if (!version) return null;
    try {
      return await this.laden(version);
    } catch {
      return null;
    }
  }

  private laden(version: string): Promise<XsdIndex> {
    let p = this.cache.get(version);
    if (!p) {
      p = (async () => {
        const versionen = this.state.bundledVersions().length
          ? this.state.bundledVersions()
          : await this.bundled.manifest();
        const v = versionen.find((x) => x.id === version);
        if (!v) throw new Error('Version nicht hinterlegt: ' + version);
        const dateien = await this.bundled.files(v);
        const docs: XsdDoc[] = [];
        for (const f of dateien) {
          if (!f.name.toLowerCase().endsWith('.xsd')) continue;
          const dom = new DOMParser().parseFromString(await f.text(), 'application/xml');
          if (dom.getElementsByTagName('parsererror').length) continue;
          docs.push({ file: f.name, dom });
        }
        if (!docs.length) throw new Error('Keine lesbaren Schemadateien für ' + version);
        return this.parser.buildIndexFrom(docs).idx;
      })();
      p.catch(() => this.cache.delete(version));
      this.cache.set(version, p);
    }
    return p;
  }
}
