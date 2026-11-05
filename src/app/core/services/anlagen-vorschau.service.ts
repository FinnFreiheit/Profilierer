import { Injectable, inject, signal } from '@angular/core';
import { AnlageEntry } from '../../models/testmessage.model';
import { AnlagenStoreService } from './anlagen-store.service';
import { SendungService } from './sendung.service';
import { ToastService } from './toast.service';
import { VorschauArt, alsText, vorschauArt } from '../util/anlage-vorschau.util';

/** Was der Vorschau-Dialog zeigt. */
export interface AnlagenVorschau {
  dateiname: string;
  art: VorschauArt;
  /** Kenndaten der Ablage (Groesse, Pruefwert, Autor). */
  anlage: AnlageEntry | null;
  /** Objekt-URL fuer pdf/bild (und den Knopf "In neuem Tab"). */
  url: string;
  /** Text fuer xml/text, sonst ''. */
  text: string;
}

/**
 * Dateien der Testsendung im Browser ansehen, ohne sie herunterzuladen. Haelt
 * genau eine offene Vorschau; die Objekt-URL wird beim Schliessen und beim
 * Wechsel freigegeben.
 */
@Injectable({ providedIn: 'root' })
export class AnlagenVorschauService {
  private readonly sendung = inject(SendungService);
  private readonly store = inject(AnlagenStoreService);
  private readonly toast = inject(ToastService);

  private readonly _offen = signal<AnlagenVorschau | null>(null);
  readonly offen = this._offen.asReadonly();

  async oeffne(dateiname: string): Promise<void> {
    const id = this.sendung.entryId();
    if (!id) return;
    let blob: Blob | null;
    try {
      blob = await this.store.laden(id, dateiname);
    } catch (e) {
      this.toast.showError(e, 'Datei konnte nicht geladen werden.');
      return;
    }
    if (!blob) {
      this.toast.show(`Zu „${dateiname}" liegt keine Datei vor.`);
      return;
    }
    const anlage = this.sendung.anlagen().find((a) => a.dateiname === dateiname) ?? null;
    const art = vorschauArt(dateiname, anlage?.mime ?? blob.type);
    // Der Typ der Objekt-URL folgt der Art — sonst bietet der Browser ein als
    // octet-stream abgelegtes PDF zum Download an, statt es zu zeigen.
    const typ = art === 'pdf' ? 'application/pdf' : blob.type || 'application/octet-stream';
    const text =
      art === 'xml' || art === 'text' ? alsText(new Uint8Array(await blob.arrayBuffer())) : '';
    this.schliesse();
    this._offen.set({
      dateiname,
      art,
      anlage,
      url: URL.createObjectURL(new Blob([blob], { type: typ })),
      text,
    });
  }

  schliesse(): void {
    const v = this._offen();
    if (!v) return;
    URL.revokeObjectURL(v.url);
    this._offen.set(null);
  }
}
