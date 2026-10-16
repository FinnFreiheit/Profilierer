import { Injectable, inject, signal } from '@angular/core';
import { StateService } from './state.service';
import { CodelistService } from './codelist.service';
import { LoggerService } from './logger.service';
import { NachrichtUebersicht, nachrichtUebersicht } from '../util/nachricht-uebersicht.util';

/** Uebersicht samt Dateiname — das, was die Druckansicht zeigt. */
export interface TestnachrichtDruck extends NachrichtUebersicht {
  datei: string;
}

/** Body-Klasse waehrend des Drucks: blendet alles ausser der Uebersicht aus. */
const DRUCK_KLASSE = 'druckt-testnachricht';

/**
 * PDF-Export einer Testnachricht als kompakte Uebersicht. Das PDF entsteht
 * wie beim Profil-Druck ueber den Druckdialog des Browsers („Als PDF
 * sichern"); die Ansicht selbst ist `app-testnachricht-druck` in der Shell.
 * Vorher werden die in der Nachricht benutzten Codelisten nachgeladen, damit
 * neben den Codes ihre Bezeichnung steht — best-effort, sonst bleibt der Code.
 */
@Injectable({ providedIn: 'root' })
export class TestnachrichtDruckService {
  private readonly state = inject(StateService);
  private readonly codelists = inject(CodelistService);
  private readonly log = inject(LoggerService);

  readonly druck = signal<TestnachrichtDruck | null>(null);

  /** false, wenn das XML nicht lesbar ist. */
  async drucke(xml: string, datei: string): Promise<boolean> {
    await this.ladeCodelisten(xml);
    const cl = this.state.codelists();
    const u = nachrichtUebersicht(
      xml,
      (uri, code) => cl[uri]?.werte.find((w) => w.value === code)?.label || null,
    );
    if (!u) return false;
    this.druck.set({ ...u, datei });
    document.body.classList.add(DRUCK_KLASSE);
    window.addEventListener('afterprint', () => document.body.classList.remove(DRUCK_KLASSE), {
      once: true,
    });
    setTimeout(() => window.print(), 60);
    return true;
  }

  private async ladeCodelisten(xml: string): Promise<void> {
    const vorhanden = this.state.codelists();
    const fehlend = [
      ...new Set(Array.from(xml.matchAll(/listURI="([^"]+)"/g), (m) => m[1]!)),
    ].filter((uri) => !vorhanden[uri]);
    const r = await Promise.allSettled(fehlend.map((k) => this.codelists.fetchSingleCodelist(k)));
    const fehler = r.filter((x) => x.status === 'rejected').length;
    if (fehler) this.log.warn('Testnachricht-Druck', `${fehler} Codelisten nicht geladen`);
  }
}
