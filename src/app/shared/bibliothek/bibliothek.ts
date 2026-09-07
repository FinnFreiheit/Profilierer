import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { RolleService } from '../../core/services/rolle.service';
import { BetaBadge } from '../beta-badge/beta-badge';
import { RolleBadge } from '../rolle-badge/rolle-badge';
import { SchemaSuche } from '../schema-suche/schema-suche';

/** Die Bibliotheks-Ansichten, zwischen denen die Reiterleiste umschaltet. */
export type BibliothekReiter = 'projekte' | 'dashboard' | 'testdaten' | 'howto' | 'kennzahlen';

/** Ein Reiter der Kopfleiste — Beschriftung und Erklaerung stehen hier einmal. */
interface Reiter {
  id: BibliothekReiter;
  label: string;
  titel: string;
}

/**
 * **Gemeinsamer Rahmen der Bibliotheks-Ansichten** (Profile, Testdaten,
 * Projekte, Anleitung, Kennzahlen). Er traegt die Kopfleiste (Reiter,
 * Schema-Suche, Beta- und Rollen-Badge) und den Koerper aus fester
 * Filterspalte und rollendem Inhalt — bis hierher war die Kopfleiste in
 * fuenf Templates kopiert.
 *
 * Der Rahmen ist der **Scroll-Container**: er selbst nimmt die Hoehe des
 * Fensters ein (`grid-template-rows: auto minmax(0, 1fr)`), Kopfleiste und
 * Filterspalte stehen, nur `.dashMain` rollt. Deshalb bringt der Host die
 * Klasse `dashV4` mit — die v4-Regeln gelten damit in allen Ansichten, ohne
 * dass jedes Template sie wiederholt.
 *
 * Zwei Einschuebe: `[filter]` fuellt die linke Spalte (der Rahmen stellt das
 * `aside`), der Standard-Einschub den Inhalt.
 */
@Component({
  selector: 'app-bibliothek',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BetaBadge, RolleBadge, SchemaSuche],
  templateUrl: './bibliothek.html',
  host: { class: 'dashV4' },
})
export class Bibliothek {
  private readonly state = inject(StateService);
  protected readonly rolle = inject(RolleService);

  /** Welcher Reiter als aktiv gilt — er wird nicht anklickbar dargestellt. */
  readonly aktiv = input.required<BibliothekReiter>();
  /** Ansichten ohne Achsen (Anleitung, Kennzahlen) rollen einspaltig. */
  readonly mitFilter = input(true);
  /** Beschriftung der Filterspalte fuer Hilfsmittel (`aria-label`). */
  readonly filterLabel = input('Eingrenzen');

  /** Kennzahlen sind AG-exklusiv; die uebrigen Reiter stehen immer. */
  protected readonly reiter = computed<Reiter[]>(() => {
    const alle: Reiter[] = [
      { id: 'projekte', label: 'Projekte', titel: 'Vorhaben mit ihren Kommunikationsszenarien' },
      { id: 'dashboard', label: 'Profile', titel: 'Profilierungen der XJustiz-Nachrichten' },
      { id: 'testdaten', label: 'Testdaten', titel: 'Sammlung der erzeugten Testnachrichten' },
      {
        id: 'howto',
        label: 'Anleitung',
        titel: 'Bebilderte Anleitung: profilieren und Testnachrichten erstellen',
      },
    ];
    if (this.rolle.agAktiv())
      alle.push({
        id: 'kennzahlen',
        label: 'Kennzahlen',
        titel: 'Nutzung und Bestand dieser Instanz (AG)',
      });
    return alle;
  });

  /** Reiterwechsel — die Ansicht steht im Store, nicht im Router. */
  protected waehle(id: BibliothekReiter): void {
    this.state.view.set(id);
  }
}
