import { Injectable, signal } from '@angular/core';

/**
 * Was eingeordnet werden soll (#145). Profilierungen tragen Projekt und
 * Schlagworte, Testnachrichten zusaetzlich das Kommunikationsszenario.
 */
export type EinordnenZiel = { art: 'profil'; id: string } | { art: 'testnachricht'; id: string };

/**
 * Steuert den einen Einordnen-Dialog (#145).
 *
 * Vorher gab es drei Wege, die dasselbe zu bedeuten schienen: "Metadaten
 * bearbeiten…" (Name/Autor/Beschreibung), "Einsortieren…" (Projekt/Schlagworte)
 * und "Szenario zuordnen…" (Profilierung). Fuer den Anwender waren die letzten
 * beiden nicht unterscheidbar — sie beantworten dieselbe Frage: wohin gehoert
 * dieser Eintrag? Sie sind deshalb zu einem Dialog zusammengefasst; "Metadaten
 * bearbeiten…" bleibt daneben stehen, weil es etwas anderes tut (den Eintrag
 * benennen) und als einziges den AG-Schutz traegt.
 *
 * Muster wie VergleichService: der Dialog haengt global in der Shell und
 * reagiert per effect — die Einstiege liegen in drei Ansichten.
 */
@Injectable({ providedIn: 'root' })
export class EinordnenService {
  readonly ziel = signal<EinordnenZiel | null>(null);

  oeffneProfil(id: string): void {
    this.ziel.set({ art: 'profil', id });
  }

  oeffneTestnachricht(id: string): void {
    this.ziel.set({ art: 'testnachricht', id });
  }

  schliesse(): void {
    this.ziel.set(null);
  }
}
