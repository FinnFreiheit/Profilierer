import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Projekt } from '../../models/projekt.model';
import { TagOption } from '../../core/util/tags.util';
import { TagEingabe } from '../tag-eingabe/tag-eingabe';

/** Auswahlwert des Projektfeldes, der das Anlegen eines neuen Projekts meint. */
export const PROJEKT_NEU = '~neu';

/**
 * Die Felder des Einsortieren-Dialogs (#134): Projekt und Schlagworte — die
 * **Ablage** eines Eintrags, nicht seine fachliche Aussage. Gemeinsam von
 * Profil-Uebersicht und Testdaten-Speicher genutzt, damit dieselbe Geste in
 * beiden Ansichten dasselbe tut.
 *
 * Ein neues Projekt entsteht hier nebenbei (Auswahl "neues Projekt anlegen"
 * blendet ein Namensfeld ein) statt in einem eigenen Dialog: einsortieren und
 * dabei merken, dass es den Behaelter noch nicht gibt, ist der haeufige Fall.
 *
 * Die Komponente **speichert nicht** — sie haelt nur die Eingabe. Was daraus
 * wird (Projekt anlegen, zuordnen, Schlagworte schreiben), entscheidet die
 * aufrufende Ansicht.
 */
@Component({
  selector: 'app-einsortieren',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './einsortieren.html',
  imports: [TagEingabe],
})
export class Einsortieren {
  /** Vorhandene Projekte zur Auswahl. */
  readonly projekte = input.required<Projekt[]>();
  /** Gewaehltes Projekt: id, '' (keines) oder PROJEKT_NEU. */
  readonly projektId = model.required<string>();
  /** Name des neu anzulegenden Projekts (nur bei PROJEKT_NEU). */
  readonly neuerName = model('');
  /** Schlagworte als kommagetrennter Text. */
  readonly tags = model.required<string>();
  /** Im Bestand vergebene Schlagworte (Vorschlaege). */
  readonly tagVorschlaege = input<TagOption[]>([]);
  /**
   * Name der Profilierung, von der das Projekt geerbt wird. Gesetzt = das
   * Projektfeld entfaellt: gebundene Testnachrichten folgen ihrer Profilierung,
   * ein zweiter Pflegeort erzeugte nur Widersprueche.
   */
  readonly geerbtVon = input<string | undefined>(undefined);

  protected readonly neu = PROJEKT_NEU;
  protected readonly legtNeuesAn = computed(() => this.projektId() === PROJEKT_NEU);
}
