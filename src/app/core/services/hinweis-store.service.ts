import { Injectable, computed, inject, signal } from '@angular/core';
import { Hinweis } from '../../models/profile.model';
import { LoggerService } from './logger.service';
import { RolleService } from './rolle.service';
import { HinweisEingabe, unterPfad } from '../util/hinweis.util';

/** Basis-URL der Profil-API (wie im ProfileStoreService: relativ, gegen <base href>). */
const API_BASE = 'api';

/**
 * Browser-Ablage des Autornamens (Issue #40) — Selbstauskunft, einmal
 * hinterlegt und danach vorbelegt, analog zum gemerkten AG-Schluessel.
 */
export const AUTOR_STORAGE = 'xjp.hinweisAutor';

/**
 * Fehler eines Hinweis-Requests, mit HTTP-Status. Der Status entscheidet die
 * Meldung an den Nutzer: 403 ist kein Ausfall, sondern der Abnahme-Schutz —
 * "Backend nicht erreichbar" waere dort eine falsche Ursache.
 */
export class HinweisFehler extends Error {
  constructor(
    readonly status: number,
    nachricht: string,
  ) {
    super(nachricht);
    this.name = 'HinweisFehler';
  }
}

/**
 * Ablage der Hinweise (Rueckmeldungen am Element) — eine eigene Ressource neben
 * der Profilierung (ADR 0014). Der Store haelt die Hinweise des **offenen**
 * Profils in einem eigenen Signal, nicht in der pfad-indizierten `elemente`-Map
 * des StateService: sie sind nicht Teil des Profil-Dokuments und laufen
 * ausschliesslich ueber eigene Endpunkte unterhalb der Profil-Ressource, nie
 * ueber den Autosave.
 *
 * Bewusst "dumm" wie der ProfileStoreService: kennt weder StateService noch den
 * Oeffnen-Fluss. Geladen und geleert wird er vom PersistenceService, sobald ein
 * Profil geoeffnet bzw. verlassen wird.
 */
@Injectable({ providedIn: 'root' })
export class HinweisStoreService {
  private readonly log = inject(LoggerService);
  private readonly rolle = inject(RolleService);

  /** Profil, dessen Hinweise geladen sind (null = keins offen). */
  private readonly profilId = signal<string | null>(null);

  /** Hinweise des offenen Profils, in Server-Reihenfolge. */
  readonly hinweise = signal<Hinweis[]>([]);

  /**
   * Der gemerkte Autorname (Issue #40). Reine Selbstauskunft: er wandert als
   * `autor` an den Server, das belastbare Rollenkennzeichen stempelt der Server
   * selbst aus dem AG-Schluessel. Ueberlebt den Reload im Browser-Storage.
   */
  readonly autor = signal<string>(localStorage.getItem(AUTOR_STORAGE) ?? '');

  /** Namen merken (leer = wieder fragen). */
  setzeAutor(name: string): void {
    const clean = name.trim();
    this.autor.set(clean);
    if (clean) localStorage.setItem(AUTOR_STORAGE, clean);
    else localStorage.removeItem(AUTOR_STORAGE);
  }

  // ── Abgeleitete Sichten ─────────────────────────────────────────────

  /**
   * Liste fuer die Uebersicht: offene vor erledigten, darin nach Pfad und Zeit
   * (deterministisch, unabhaengig von der Reihenfolge der Antwort).
   */
  readonly eintraege = computed<Hinweis[]>(() =>
    [...this.hinweise()].sort(
      (a, b) =>
        Number(!!a.erledigt) - Number(!!b.erledigt) ||
        a.pfad.localeCompare(b.pfad) ||
        a.zeit - b.zeit,
    ),
  );

  /** Anzahl offener Hinweise (Toolbar-Zaehler). */
  readonly nOffen = computed(() => this.hinweise().filter((h) => !h.erledigt).length);

  /** Alle Hinweise je Element (Detail-Panel zeigt offene und erledigte). */
  readonly jePfad = computed<ReadonlyMap<string, Hinweis[]>>(() => this.gruppiere(() => true));

  /** Nur die offenen je Element (Baum-Marker, Excel-Export). */
  readonly offeneJePfad = computed<ReadonlyMap<string, Hinweis[]>>(() =>
    this.gruppiere((h) => !h.erledigt),
  );

  /**
   * Vorfahren-Aggregat der offenen Hinweise: Pfad → Anzahl im Teilbaum darunter
   * (Sammel-Marker fuer zugeklappte Aeste; Praefix-Logik wie valAnc im
   * ValidationMarkerService, Grenzen '/' und '@').
   */
  readonly anc = computed<ReadonlyMap<string, number>>(() => {
    const anc = new Map<string, number>();
    for (const h of this.hinweise()) {
      if (h.erledigt) continue;
      for (let i = 0; i < h.pfad.length; i++) {
        if (h.pfad[i] === '/' || h.pfad[i] === '@') {
          const p = h.pfad.slice(0, i);
          anc.set(p, (anc.get(p) ?? 0) + 1);
        }
      }
    }
    return anc;
  });

  private gruppiere(nimm: (h: Hinweis) => boolean): ReadonlyMap<string, Hinweis[]> {
    const m = new Map<string, Hinweis[]>();
    for (const h of this.eintraege()) {
      if (!nimm(h)) continue;
      const liste = m.get(h.pfad);
      if (liste) liste.push(h);
      else m.set(h.pfad, [h]);
    }
    return m;
  }

  // ── HTTP ────────────────────────────────────────────────────────────

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(API_BASE + path, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...this.rolle.authHeaders(),
        ...init?.headers,
      },
    });
    if (!r.ok)
      throw new HinweisFehler(r.status, `Hinweise: ${init?.method ?? 'GET'} ${path} → ${r.status}`);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  private pfad(profilId: string, rest = ''): string {
    return `/profiles/${encodeURIComponent(profilId)}/hinweise${rest}`;
  }

  /**
   * Hinweise eines Profils laden (Oeffnen); `null` leert den Store (Dashboard,
   * Nachrichten-Modus). Fehler werden geloggt und leeren die Liste — ein
   * Backend-Ausfall darf das Oeffnen nicht scheitern lassen.
   */
  async lade(profilId: string | null): Promise<void> {
    this.profilId.set(profilId);
    if (!profilId) {
      this.hinweise.set([]);
      return;
    }
    try {
      const liste = await this.req<Hinweis[]>(this.pfad(profilId));
      // Zwischenzeitlicher Profilwechsel: veraltete Antwort verwerfen.
      if (this.profilId() === profilId) this.hinweise.set(liste);
    } catch (e) {
      this.log.warn('Hinweise', `Hinweise zu ${profilId} nicht ladbar`, e);
      if (this.profilId() === profilId) this.hinweise.set([]);
    }
  }

  /**
   * Hinweise eines beliebigen Profils lesen, ohne den Store umzuhaengen —
   * fuer den Export einer nicht geoeffneten Profilierung aus dem Dashboard.
   */
  async hole(profilId: string): Promise<Hinweis[]> {
    return this.req<Hinweis[]>(this.pfad(profilId));
  }

  /**
   * Neuen Hinweis am Element anlegen. Mitgeschickt wird allein der Name
   * (Selbstauskunft); Zeitpunkt und Rollenkennzeichen stempelt der Server —
   * er leitet die Rolle aus dem AG-Schluessel ab (Issue #40).
   */
  async anlegen(pfad: string, text: string): Promise<Hinweis | null> {
    const id = this.profilId();
    if (!id || !text.trim()) return null;
    const autor = this.autor().trim();
    const { hinweis } = await this.req<{ hinweis: Hinweis }>(this.pfad(id), {
      method: 'POST',
      body: JSON.stringify({ pfad, text: text.trim(), autor: autor || undefined }),
    });
    this.hinweise.update((l) => [...l, hinweis]);
    return hinweis;
  }

  /** Text aendern und/oder abhaken (nur die uebergebenen Felder). */
  async aendern(hinweisId: string, patch: { text?: string; erledigt?: boolean }): Promise<void> {
    const id = this.profilId();
    if (!id) return;
    const { hinweis } = await this.req<{ hinweis: Hinweis }>(
      this.pfad(id, `/${encodeURIComponent(hinweisId)}`),
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    this.hinweise.update((l) => l.map((h) => (h.id === hinweisId ? hinweis : h)));
  }

  /** Einen Hinweis loeschen. */
  async loeschen(hinweisId: string): Promise<void> {
    const id = this.profilId();
    if (!id) return;
    await this.req<void>(this.pfad(id, `/${encodeURIComponent(hinweisId)}`), { method: 'DELETE' });
    this.hinweise.update((l) => l.filter((h) => h.id !== hinweisId));
  }

  /**
   * Alle Hinweise unter einem Pfad loeschen — der Traeger selbst und alles
   * darunter ('/' und '@' als Grenzen, wie `anc`). Gegenstueck zur Kaskade in
   * `StateService.removeAusp`/`removeErweiterung`: verschwindet das Element,
   * darf sein Hinweis nicht in der Ablage zurueckbleiben, wo er weiterzaehlt
   * und einen Sammel-Marker an einem Vorfahren erzeugt, dessen Sprung ins Leere
   * geht. Ohne offenes Profil (Nachrichten-Modus, Dashboard) ein No-Op.
   */
  async loescheUnter(pfad: string): Promise<void> {
    const id = this.profilId();
    if (!id) return;
    // Nichts zu tun, wenn der Teilbaum keinen Hinweis traegt — der haeufige Fall,
    // und er spart den Request beim Aufraeumen ganzer Aeste.
    if (!this.hinweise().some((h) => unterPfad(h.pfad, pfad))) return;
    await this.req<void>(this.pfad(id, `?praefix=${encodeURIComponent(pfad)}`), {
      method: 'DELETE',
    });
    this.hinweise.update((l) => l.filter((h) => !unterPfad(h.pfad, pfad)));
  }

  /**
   * Alle Hinweise eines Profils ersetzen (JSON-Import). Volltausch, kein
   * Zusammenfuehren — so bleibt der Dateiaustausch ohne Konfliktlogik. Wirkt
   * auch auf ein nicht geoeffnetes Profil (Import legt es gerade erst an).
   */
  async ersetzeAlle(profilId: string, liste: HinweisEingabe[]): Promise<void> {
    const neu = await this.req<Hinweis[]>(this.pfad(profilId), {
      method: 'PUT',
      body: JSON.stringify(liste),
    });
    if (this.profilId() === profilId) this.hinweise.set(neu);
  }
}
