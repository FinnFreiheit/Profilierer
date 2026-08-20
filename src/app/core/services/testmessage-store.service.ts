import { Injectable, inject, signal } from '@angular/core';
import {
  AuspBezeichnungen,
  GuidedMessageState,
  TestmessageEntry,
  TestmessageFortschritt,
  TestmessageInput,
} from '../../models/testmessage.model';
import { ProfileDoc } from '../../models/profile.model';
import { LoggerService } from './logger.service';
import { BackendClient } from './backend-client.service';
import { mitEintrag, neuesteZuerst, ohneEintrag } from '../util/eintragsliste.util';

/** Patch fuer PATCH /api/testmessages/:id — nur gesetzte Felder werden geaendert. */
export interface TestmessagePatch {
  name?: string;
  notiz?: string;
  /** Schlagworte der Ablage; ersetzen die bestehende Liste vollstaendig. */
  tags?: string[];
  xml?: string;
  entwurf?: boolean;
  fortschritt?: TestmessageFortschritt;
  entscheidungen?: GuidedMessageState;
  bezeichnungen?: AuspBezeichnungen;
}

/**
 * Persistenz-Layer des zentralen Testdaten-Speichers — spricht das Backend
 * (SQLite) per nativem fetch an, konsistent mit dem ProfileStoreService. Ein
 * schlanker Index (`GET /api/testmessages` → TestmessageEntry[]) fuellt das
 * reaktive `entries`-Signal fuer die Kachel-Ansicht; das Roh-XML wird je
 * Nachricht einzeln geladen (`GET /api/testmessages/:id/xml`).
 *
 * Bewusst "dumm": kennt weder StateService noch die aktive Ansicht. Nachricht/
 * Fachmodul werden vom Aufrufer aus dem XML abgeleitet (parseTestmessage) und
 * hier nur durchgereicht.
 */
@Injectable({ providedIn: 'root' })
export class TestmessageStoreService {
  private readonly log = inject(LoggerService);
  private readonly http = inject(BackendClient).fuer('Testdaten-Backend');

  /** Testnachrichten-Index, nach letzter Änderung absteigend. */
  readonly entries = signal<TestmessageEntry[]>([]);

  constructor() {
    void this.refresh().catch((e) =>
      this.log.warn('Testdaten-Backend', 'Index beim Start nicht ladbar (Backend offline?)', e),
    );
  }

  // ── Lesen ───────────────────────────────────────────────────────────

  /** Index vom Server neu laden (Start + Fehler-Resync). */
  async refresh(): Promise<void> {
    this.entries.set(neuesteZuerst(await this.http.json<TestmessageEntry[]>('/testmessages')));
  }

  /** Roh-XML einer Testnachricht (fuer Download/Vorschau); 404 → null. */
  async loadXml(id: string): Promise<string | null> {
    return this.http.textOderNull(`/testmessages/${encodeURIComponent(id)}/xml`);
  }

  /** Entscheidungsstand einer gefuehrt erstellten Nachricht; 404 → null. */
  async loadEntscheidungen(id: string): Promise<GuidedMessageState | null> {
    return this.http.jsonOderNull<GuidedMessageState>(
      `/testmessages/${encodeURIComponent(id)}/entscheidungen`,
    );
  }

  /**
   * Bezeichnungen der benannten Vorkommen; 404 → null. Das ist der Normalfall
   * (Upload, Altbestand, Nachricht ohne Vorkommen) — dann bleiben die
   * generischen Namen aus dem Import stehen.
   */
  async loadBezeichnungen(id: string): Promise<AuspBezeichnungen | null> {
    return this.http.jsonOderNull<AuspBezeichnungen>(
      `/testmessages/${encodeURIComponent(id)}/bezeichnungen`,
    );
  }

  /**
   * Die eingefrorene Kopie der gebundenen Profilfassung (Vorgabe des
   * Durchlaufs); 404 → null (Nachricht ohne Profil-Bindung).
   */
  async loadVorgabe(id: string): Promise<ProfileDoc | null> {
    return this.http.jsonOderNull<ProfileDoc>(`/testmessages/${encodeURIComponent(id)}/vorgabe`);
  }

  // ── Schreiben ───────────────────────────────────────────────────────

  /**
   * Profilbindung loesen (#32): die eingefrorene Kopie faellt weg — damit enden
   * Sperren, Fuehrung und das Kennzeichen "Profil weiterentwickelt". Die
   * Herkunft (`profilName`/`fassung`) bleibt als Historie am Eintrag.
   */
  async loeseBindung(id: string): Promise<void> {
    const { entry } = await this.http.json<{ entry: TestmessageEntry }>(
      `/testmessages/${encodeURIComponent(id)}/vorgabe`,
      { method: 'DELETE' },
    );
    this.putEntry(entry);
  }

  /** Neue Testnachricht anlegen; gibt die (serverseitig vergebene) id zurueck. */
  async create(input: TestmessageInput): Promise<string> {
    const { id, entry } = await this.http.json<{ id: string; entry: TestmessageEntry }>(
      '/testmessages',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
    this.putEntry(entry);
    return id;
  }

  /**
   * Variante anlegen (#133): serverseitige Kopie mit derselben Profil-Bindung,
   * aus der die naechste Auspraegung entsteht. Gibt die id der Kopie zurueck.
   */
  async dupliziere(id: string): Promise<string> {
    const { id: neueId, entry } = await this.http.json<{ id: string; entry: TestmessageEntry }>(
      `/testmessages/${encodeURIComponent(id)}/duplicate`,
      { method: 'POST' },
    );
    this.putEntry(entry);
    return neueId;
  }

  /**
   * Felder aendern: Metadaten (Name/Notiz) und — bei gefuehrt erstellten
   * Nachrichten — XML, Entwurfs-Kennzeichen, Fortschritt, Entscheidungsstand.
   * Nur die gesetzten Felder werden gesendet; das Backend laesst weggelassene
   * unberuehrt.
   */
  async updateMeta(id: string, patch: TestmessagePatch): Promise<void> {
    const { entry } = await this.http.json<{ entry: TestmessageEntry }>(
      `/testmessages/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    this.putEntry(entry);
  }

  /** Testnachricht entfernen. */
  async delete(id: string): Promise<void> {
    await this.http.json<void>(`/testmessages/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.entries.update((list) => ohneEintrag(list, id));
  }

  // ── Abnahme (BLK-AG) ────────────────────────────────────────────────

  /** Abnehmen: friert die aktuelle XML-Fassung serverseitig ein. */
  async abnehmen(id: string, kommentar?: string): Promise<void> {
    const { entry } = await this.http.json<{ entry: TestmessageEntry }>(
      `/testmessages/${encodeURIComponent(id)}/abnahme`,
      { method: 'POST', body: JSON.stringify({ kommentar }) },
    );
    this.putEntry(entry);
  }

  /** Abnahme-Kennzeichen samt eingefrorener Fassung entfernen. */
  async abnahmeEntfernen(id: string): Promise<void> {
    const { entry } = await this.http.json<{ entry: TestmessageEntry }>(
      `/testmessages/${encodeURIComponent(id)}/abnahme`,
      { method: 'DELETE' },
    );
    this.putEntry(entry);
  }

  /** Eingefrorene Abnahme-Fassung (Anzeige/Download); 404 → null. */
  async loadAbnahmeXml(id: string): Promise<string | null> {
    return this.http.textOderNull(`/testmessages/${encodeURIComponent(id)}/abnahme/xml`);
  }

  // ── Index-Signal pflegen ────────────────────────────────────────────

  /** Eintrag ersetzen/voranstellen und nach aktualisiert absteigend sortieren. */
  private putEntry(entry: TestmessageEntry): void {
    this.entries.update((list) => mitEintrag(list, entry));
  }
}
