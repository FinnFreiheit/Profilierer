import { Injectable, inject } from '@angular/core';
import { RolleService } from './rolle.service';

/**
 * Basis-URL der Backend-API (same-origin; im Dev via Proxy auf das Backend).
 * Relativ, loest gegen <base href> auf: Dev/Root -> /api, Unterpfad-Deployment
 * (xjw.freiheits.de/profilierer) -> /profilierer/api (nginx strippt den Praefix).
 */
const API_BASE = 'api';

/**
 * Fehler eines Backend-Requests, mit HTTP-Status. Der Status entscheidet die
 * Meldung an den Nutzer: 403 ist kein Ausfall, sondern der Abnahme-Schutz —
 * "Backend nicht erreichbar" waere dort eine falsche Ursache (siehe
 * `core/util/hinweis.util.ts`, liest den Status per Duck-Typing).
 */
export class BackendFehler extends Error {
  constructor(
    readonly status: number,
    nachricht: string,
  ) {
    super(nachricht);
    this.name = 'BackendFehler';
  }
}

/**
 * Der Zugriff einer Ressource auf das Backend — was ein Store kennen muss.
 * `…OderNull` bedeutet: 404 ist eine Aussage, kein Fehler (Profil geloescht,
 * Nachricht ohne Profilbindung, Version nicht vorhanden).
 */
export interface BackendZugriff {
  /** Request mit JSON-Antwort; 204 liefert `undefined`. */
  json<T>(pfad: string, init?: RequestInit): Promise<T>;
  /** Wie `json`, aber 404 → `null`. */
  jsonOderNull<T>(pfad: string, init?: RequestInit): Promise<T | null>;
  /** Antwort als Text (Roh-XML); 404 → `null`. */
  textOderNull(pfad: string): Promise<string | null>;
}

/** Ein an eine Quelle gebundener Zugriff (Fehlertexte nennen sie). */
class Zugriff implements BackendZugriff {
  constructor(
    private readonly quelle: string,
    private readonly authHeaders: () => Record<string, string>,
  ) {}

  private async anfrage(pfad: string, init?: RequestInit): Promise<Response> {
    return fetch(API_BASE + pfad, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        // Der AG-Schluessel geht an **jeden** Request, auch an die lesenden:
        // der Schutz abgenommener Objekte liegt am Server, und er kann nur
        // greifen, wenn die Rolle ihn erreicht.
        ...this.authHeaders(),
        ...init?.headers,
      },
    });
  }

  private pruefe(r: Response, pfad: string, init?: RequestInit): void {
    if (!r.ok)
      throw new BackendFehler(
        r.status,
        `${this.quelle}: ${init?.method ?? 'GET'} ${pfad} → ${r.status}`,
      );
  }

  async json<T>(pfad: string, init?: RequestInit): Promise<T> {
    const r = await this.anfrage(pfad, init);
    this.pruefe(r, pfad, init);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  async jsonOderNull<T>(pfad: string, init?: RequestInit): Promise<T | null> {
    const r = await this.anfrage(pfad, init);
    if (r.status === 404) return null;
    this.pruefe(r, pfad, init);
    return (await r.json()) as T;
  }

  async textOderNull(pfad: string): Promise<string | null> {
    const r = await this.anfrage(pfad);
    if (r.status === 404) return null;
    this.pruefe(r, pfad);
    return await r.text();
  }
}

/**
 * Der eine Weg ans Backend ([ADR 0007](../../../docs/adr/0007-datenbank-backend.md)).
 *
 * Vorher hatte jeder der drei Stores seinen eigenen `req`-Helfer (wortgleich)
 * **und** daneben nackte `fetch`-Aufrufe fuer die 404-toleranten Lesepfade —
 * sieben Stellen, die den AG-Schluessel nicht mitschickten. Die Rolle aus
 * [ADR 0012](../../../docs/adr/0012-abnahme-rollenkonzept.md) galt dort also
 * nicht. Hier faellt die Auth-Entscheidung einmal, fuer jeden Request.
 *
 * `fuer(quelle)` bindet den Namen, der in Fehlertexten steht; die Stores
 * kennen danach drei Methoden statt Header, Statuscodes und Basis-URL.
 */
@Injectable({ providedIn: 'root' })
export class BackendClient {
  private readonly rolle = inject(RolleService);

  fuer(quelle: string): BackendZugriff {
    return new Zugriff(quelle, () => this.rolle.authHeaders());
  }
}
