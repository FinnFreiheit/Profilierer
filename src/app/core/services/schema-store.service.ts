import { Injectable, inject, signal } from '@angular/core';
import { BundledVersion, SchemaDatei } from '../../models/schema-bundle.model';
import { BackendClient } from './backend-client.service';
import { LoggerService } from './logger.service';

/**
 * Ablage der von xjustiz.de geholten Schemaversionen (`/api/schemas`).
 *
 * Sie lagen bisher nur im Speicher des Browsers: nach dem Neuladen war eine
 * frisch abgerufene Version (4.1.0) wieder aus dem Umschalter verschwunden —
 * und eine Profilierung dieser Version fand ihr Schema nicht mehr. Hier bleiben
 * sie liegen, bis sie **auf Zuruf** aktualisiert werden; im Backend und nicht im
 * Browser, weil das Schema keine Arbeitsplatz-Einstellung ist, sondern die
 * Grundlage, auf der alle an derselben Instanz arbeiten ([ADR 0007](../../../../docs/adr/0007-datenbank-backend.md)).
 *
 * Bewusst "dumm": kennt weder StateService noch die aktive Version. Entpackt
 * wird im `RemoteSchemaService`, zusammengefuehrt im `BundledSchemaService`.
 */
@Injectable({ providedIn: 'root' })
export class SchemaStoreService {
  private readonly log = inject(LoggerService);
  private readonly http = inject(BackendClient).fuer('Schema-Speicher');

  /**
   * Gespeicherte Versionen (Index ohne Dateiinhalte), neueste zuerst. Wird vom
   * Start gefuellt (`refresh`) — der Umschalter liest sie ueber
   * `StateService.bundledVersions`, in die sie eingemischt werden.
   */
  readonly entries = signal<BundledVersion[]>([]);

  /** Index vom Server laden. Wirft bei Backend-Ausfall. */
  async refresh(): Promise<void> {
    this.entries.set(await this.http.json<BundledVersion[]>('/schemas'));
  }

  /** XSD-Dateien einer gespeicherten Version; nicht gespeichert → null. */
  async dateien(id: string): Promise<SchemaDatei[] | null> {
    return this.http.jsonOderNull<SchemaDatei[]>(`/schemas/${encodeURIComponent(id)}/files`);
  }

  /**
   * Version ablegen oder ersetzen. Ein Fehlschlag ist **kein** Abbruch: die
   * Dateien liegen dem Aufrufer bereits vor, er arbeitet damit weiter — nur der
   * naechste Start muss sie wieder holen.
   */
  async merke(v: BundledVersion, files: SchemaDatei[]): Promise<void> {
    await this.schreibe(v, files);
  }

  /**
   * Nur die **Bezugsquelle** merken (ohne Dateien): die Version steht damit im
   * Umschalter und ueberlebt das Neuladen, ihr ZIP wird beim ersten Waehlen
   * geholt. Das ist der Weg fuer die Versionsliste von xjustiz.de — ohne ihn
   * ueberlebte nur, was auch tatsaechlich geladen wurde, und wer die Liste bloss
   * abrief, fand nach dem Neuladen wieder die beiden hinterlegten Versionen vor.
   *
   * Vorhandene Dateien bleiben unberuehrt (der Server ruehrt sie ohne `files`
   * nicht an) — ein Listenabruf leert keinen geholten Stand.
   */
  async merkeQuellen(versionen: BundledVersion[]): Promise<void> {
    for (const v of versionen) if (v.zipUrl) await this.schreibe(v, undefined);
  }

  /** Gemeinsamer Schreibweg; `files` weggelassen = nur die Bezugsquelle. */
  private async schreibe(v: BundledVersion, files: SchemaDatei[] | undefined): Promise<void> {
    try {
      const { entry } = await this.http.json<{ entry: BundledVersion }>(
        `/schemas/${encodeURIComponent(v.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ label: v.label, hinweis: v.hinweis, zipUrl: v.zipUrl, files }),
        },
      );
      this.entries.update((liste) => [entry, ...liste.filter((x) => x.id !== entry.id)]);
    } catch (e) {
      this.log.warn('Schema-Speicher', `XJustiz ${v.id} nicht gespeichert`, e);
    }
  }

  /** Liegen die XSD-Dateien dieser Version im Speicher (nicht nur die Quelle)? */
  hatDateien(id: string): boolean {
    return !!this.entries().find((e) => e.id === id)?.files.length;
  }

  /** Gespeicherte Version samt Dateien entfernen. */
  async entferne(id: string): Promise<void> {
    await this.http.json<void>(`/schemas/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.entries.update((liste) => liste.filter((x) => x.id !== id));
  }
}
