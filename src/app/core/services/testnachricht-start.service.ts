import { Injectable, signal } from '@angular/core';
import { LibraryEntry } from '../../models/profile.model';

/**
 * Bitte um den gefuehrten Start einer Testnachricht aus einer Profilierung
 * (Issue #35). Die Profil-Kachel im Dashboard traegt den Einstieg, der Ablauf
 * selbst lebt im Testdaten-Speicher — es gibt genau **einen** Weg von der
 * Profilierung zur Testnachricht, und der ist der gefuehrte Durchlauf mit
 * Fassungswahl. Weil die Ansicht dabei wechselt, laeuft die Bitte ueber ein
 * Signal statt ueber einen Aufruf: der Testdaten-Speicher nimmt sie beim
 * Erscheinen entgegen und setzt sie zurueck (Muster: `uebersichtAnfrage` der
 * Hinweis-Ablage).
 */
@Injectable({ providedIn: 'root' })
export class TestnachrichtStartService {
  /** Profilierung, fuer die der gefuehrte Start geoeffnet werden soll. */
  readonly anfrage = signal<LibraryEntry | null>(null);
}
