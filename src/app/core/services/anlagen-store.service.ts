import { Injectable, inject } from '@angular/core';
import { AnlageEntry } from '../../models/testmessage.model';
import { BackendClient } from './backend-client.service';
import { AutorService } from './autor.service';

/**
 * Hochgeladene Anlagen einer Testsendung (ADR 0024) — der Client zu
 * `/api/testmessages/:id/anlagen`. Bewusst getrennt vom
 * TestmessageStoreService: Anlagen sind Binaerdaten mit eigenem Lebenszyklus
 * und werden nur in der Sendungs-Ansicht gebraucht, nicht im Index.
 */
@Injectable({ providedIn: 'root' })
export class AnlagenStoreService {
  private readonly http = inject(BackendClient).fuer('Anlagen-Backend');
  private readonly autoren = inject(AutorService);

  private pfad(id: string, dateiname?: string): string {
    const basis = `/testmessages/${encodeURIComponent(id)}/anlagen`;
    return dateiname === undefined ? basis : `${basis}/${encodeURIComponent(dateiname)}`;
  }

  /** Anlagen einer Testnachricht (ohne Bytes); unbekannte Nachricht → leer. */
  async liste(id: string): Promise<AnlageEntry[]> {
    return (await this.http.jsonOderNull<AnlageEntry[]>(this.pfad(id))) ?? [];
  }

  /** Datei unter dem Dateinamen ablegen bzw. ersetzen. */
  async ablegen(id: string, dateiname: string, datei: Blob): Promise<AnlageEntry> {
    const autor = this.autoren.sicherstellen();
    return this.http.json<AnlageEntry>(this.pfad(id, dateiname), {
      method: 'PUT',
      body: datei,
      headers: {
        'content-type': datei.type || 'application/octet-stream',
        'x-autor': encodeURIComponent(autor),
      },
    });
  }

  /** Bytes einer Anlage; fehlend → null. */
  async laden(id: string, dateiname: string): Promise<Blob | null> {
    return this.http.blobOderNull(this.pfad(id, dateiname));
  }

  async entfernen(id: string, dateiname: string): Promise<void> {
    await this.http.json<void>(this.pfad(id, dateiname), { method: 'DELETE' });
  }
}
