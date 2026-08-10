import { Injectable, computed, inject, signal } from '@angular/core';
import { Hinweis, LibraryEntry } from '../../models/profile.model';
import { LoggerService } from './logger.service';
import { BackendClient } from './backend-client.service';
import { Injector } from '@angular/core';
import { ProfileStoreService } from './profile-store.service';
import { HinweisEingabe } from '../util/hinweis.util';
import { unterPfad, vorfahren } from '../util/pfad.util';

/**
 * Browser-Ablage des Autornamens (Issue #40) — Selbstauskunft, einmal
 * hinterlegt und danach vorbelegt, analog zum gemerkten AG-Schluessel.
 */
export const AUTOR_STORAGE = 'xjp.hinweisAutor';

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
  private readonly http = inject(BackendClient).fuer('Hinweise');
  /**
   * Nur, um den vom Server mitgelieferten Index-Eintrag durchzureichen: die
   * Zaehler der Dashboard-Karte sollen ohne Neuladen stimmen (Issue #43). Der
   * Store bleibt sonst "dumm" — er kennt weder StateService noch Oeffnen-Fluss.
   *
   * Bewusst **spaet** aufgeloest: der Profil-Store laedt in seinem Konstruktor
   * den Bibliotheks-Index nach, und dieser Store soll ihn nicht allein durch
   * seine Existenz anstossen.
   */
  private readonly injector = inject(Injector);

  private uebernehmeEntry(entry: LibraryEntry): void {
    this.injector.get(ProfileStoreService).uebernehmeEntry(entry);
  }

  /**
   * Selbst angelegte Hinweise dieser Sitzung: id -> Urheber-Geheimnis (#42).
   * Nur im Speicher — mit dem Tab endet die Sitzung und damit das Recht, den
   * eigenen Eintrag an einer abgenommenen Profilierung noch zu aendern.
   */
  private readonly eigene = new Map<string, string>();

  /** Profil, dessen Hinweise geladen sind (null = keins offen). */
  private readonly profilId = signal<string | null>(null);

  /** Hinweise des offenen Profils, in Server-Reihenfolge. */
  readonly hinweise = signal<Hinweis[]>([]);

  /**
   * Bitte um die Hinweis-Uebersicht (Issue #43): das Dashboard-Badge oeffnet
   * die Profilierung **und** die Uebersicht. Weil der Dialog erst mit der
   * Editor-Ansicht entsteht, laeuft die Bitte ueber ein Signal statt ueber
   * einen direkten Aufruf — der Dialog nimmt sie beim Erscheinen entgegen und
   * setzt sie zurueck.
   */
  readonly uebersichtAnfrage = signal(false);

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
      for (const p of vorfahren(h.pfad)) anc.set(p, (anc.get(p) ?? 0) + 1);
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
      const liste = await this.http.json<Hinweis[]>(this.pfad(profilId));
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
    return this.http.json<Hinweis[]>(this.pfad(profilId));
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
    const { hinweis, entry } = await this.http.json<{
      hinweis: Hinweis & { token?: string };
      entry?: LibraryEntry;
    }>(this.pfad(id), {
      method: 'POST',
      body: JSON.stringify({ pfad, text: text.trim(), autor: autor || undefined }),
    });
    if (entry) this.uebernehmeEntry(entry);
    // Urheber-Merkmal (Issue #42): nur in dieser Antwort. Damit darf der
    // Anleger seinen eigenen Eintrag in **derselben Sitzung** noch korrigieren
    // oder zuruecknehmen, auch ohne AG-Schluessel an einem abgenommenen Profil.
    // Bewusst nur im Speicher: mit dem Tab endet die Sitzung.
    const { token, ...rest } = hinweis;
    if (token) this.eigene.set(hinweis.id, token);
    this.hinweise.update((l) => [...l, rest]);
    return rest;
  }

  /** Text aendern und/oder abhaken (nur die uebergebenen Felder). */
  async aendern(hinweisId: string, patch: { text?: string; erledigt?: boolean }): Promise<void> {
    const id = this.profilId();
    if (!id) return;
    const { hinweis, entry } = await this.http.json<{ hinweis: Hinweis; entry?: LibraryEntry }>(
      this.pfad(id, `/${encodeURIComponent(hinweisId)}`),
      { method: 'PATCH', body: JSON.stringify(patch), headers: this.urheberHeader(hinweisId) },
    );
    if (entry) this.uebernehmeEntry(entry);
    this.hinweise.update((l) => l.map((h) => (h.id === hinweisId ? hinweis : h)));
  }

  /** Einen Hinweis loeschen. */
  async loeschen(hinweisId: string): Promise<void> {
    const id = this.profilId();
    if (!id) return;
    const antwort = await this.http.json<{ entry?: LibraryEntry } | undefined>(
      this.pfad(id, `/${encodeURIComponent(hinweisId)}`),
      { method: 'DELETE', headers: this.urheberHeader(hinweisId) },
    );
    if (antwort?.entry) this.uebernehmeEntry(antwort.entry);
    this.eigene.delete(hinweisId);
    this.hinweise.update((l) => l.filter((h) => h.id !== hinweisId));
  }

  /** Nachweis der Urheberschaft, soweit dieser Browser den Eintrag angelegt hat. */
  private urheberHeader(hinweisId: string): Record<string, string> {
    const token = this.eigene.get(hinweisId);
    return token ? { 'x-hinweis-token': token } : {};
  }

  /** Darf dieser Browser den Eintrag ohne AG-Schluessel anfassen (#42)? */
  istEigener(hinweisId: string): boolean {
    return this.eigene.has(hinweisId);
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
    await this.http.json<void>(this.pfad(id, `?praefix=${encodeURIComponent(pfad)}`), {
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
    const neu = await this.http.json<Hinweis[]>(this.pfad(profilId), {
      method: 'PUT',
      body: JSON.stringify(liste),
    });
    if (this.profilId() === profilId) this.hinweise.set(neu);
  }
}
