import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { GuidedService } from '../../core/services/guided.service';
import { ProfileStoreService } from '../../core/services/profile-store.service';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';
import {
  STANDARD_ERKLAERUNG,
  STANDARD_TASTE,
  WIRKUNGEN,
  WIRKUNG_ERKLAERUNG,
  WIRKUNG_TASTE,
} from '../../core/profile-defaults';
import { Crumbs } from '../crumbs/crumbs';
import { Menu } from '../../shared/menu/menu';

/** Eine Zeile der Antwort-Erklaerung im Hilfe-Menue. */
export interface HilfeAntwort {
  /** Id der Statusstufe — Namen sind frei und duerfen sich wiederholen. */
  id: string;
  name: string;
  punkt: string;
  text: string;
  taste: string;
}

/**
 * **Fusszeile** (Editor v4; aus `Legend` hervorgegangen, Profilierer.html
 * Z.1458-1466). Immer genau eine Zeile hoch und in drei Aufgaben geteilt:
 * links der volle Pfad zum ausgewaehlten Element (ungekuerzt, waagerecht
 * scrollend), in der Mitte die Systemtelemetrie (Autosave, Versionsstand),
 * rechts die Hilfe.
 *
 * Die Erklaerungen klappen seit Editor v4 nicht mehr als eigenes Band ueber
 * der Zeile auf, sondern stehen im Hilfe-Menue: dort erklaeren sie nicht nur
 * die Kennzeichen des Baums, sondern zuerst, was die Antworten bedeuten und
 * mit welcher Taste sie zu setzen sind — das ist die Frage, die im Workshop
 * gestellt wird.
 *
 * Die Ids `#legend` und `#zustandText` bleiben: an ihnen haengen die
 * Druck-Regel in `styles.scss` und die Specs.
 */
@Component({
  selector: 'app-fusszeile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Crumbs, Menu],
  templateUrl: './fusszeile.html',
})
export class Fusszeile {
  protected readonly state = inject(StateService);
  private readonly guidedSvc = inject(GuidedService);

  protected readonly statuses = this.state.statuses;
  /**
   * Tastenbelegung je Arbeitsweise (ADR 0023): beim Bearbeiten gehoeren die
   * Pfeile der Spur — beim Profilieren der Punkte, im Durchlauf einer
   * Nachricht den Stationen (ADR 0016) —, beim Betrachten dem Baum.
   */
  protected readonly profilieren = computed(
    () => !this.state.readOnly() && !this.guidedSvc.instanzModus(),
  );
  protected readonly durchlauf = computed(
    () => !this.state.readOnly() && this.guidedSvc.instanzModus(),
  );

  /**
   * Nachrichten-Ueberlagerung (#147): eigene Bildsprache unter den Blaettern —
   * die Legende erklaert sie, solange sie laeuft.
   */
  protected readonly ueberlagerung = inject(UeberlagerungService);

  private readonly store = inject(ProfileStoreService);

  /**
   * Die Antworten im Klartext: zuerst „wie im Standard" (kein eigener Status),
   * dann die Statusstufen der Profilierung. Verstaendlich wird eine Antwort
   * ueber ihre Wirkung — der Name ist frei gewaehlt.
   */
  protected readonly antworten = computed<HilfeAntwort[]>(() =>
    this.statuses().map((s) => ({
      id: s.id,
      name: s.name,
      punkt: s.farbe,
      text: WIRKUNG_ERKLAERUNG[s.wirkung],
      // Die Taste haengt an der Wirkung, nicht am Status: bei mehreren Stufen
      // derselben Wirkung greift sie an der ersten. Welche das ist, sagt
      // `statusFuerTaste` — dieselbe Stelle, an der die Taste im Editor
      // nachschlaegt; eine eigene Buchfuehrung koennte davon abweichen.
      taste:
        this.state.statusFuerTaste(WIRKUNG_TASTE[s.wirkung])?.id === s.id
          ? WIRKUNG_TASTE[s.wirkung]
          : '',
    })),
  );

  protected readonly standardErklaerung = STANDARD_ERKLAERUNG;
  protected readonly standardTaste = STANDARD_TASTE;

  /** Tastenreihe der Antworten in der Reihenfolge S · Z · O · N · K. */
  protected readonly antwortTasten = [STANDARD_TASTE, ...WIRKUNGEN.map(([w]) => WIRKUNG_TASTE[w])];

  /**
   * Gilt die Telemetrie dem geoeffneten Profil? Im Nachrichten- und
   * Erzeugen-Modus nicht: dort haengt der Versionsstand des zuletzt geoeffneten
   * Profils sonst weiter in der Fusszeile.
   */
  private readonly profilStand = computed(
    () => !this.state.isMessageEdit() && !this.state.isMessageCreate(),
  );

  /**
   * Autosave-/Schreibschutz-Meldung. Gilt seit #105 in **jedem** Modus: auch
   * Testnachrichten werden fortlaufend gesichert (TestmessageAutosaveService),
   * und ohne die Anzeige waere dem stillen Mechanismus nicht anzusehen, ob er
   * laeuft. Dass kein Text eines fremden Modus haengen bleibt, sichern die
   * Einstiege selbst, indem sie das Signal beim Sitzungsbeginn raeumen.
   */
  protected readonly zustand = this.state.autosaveInfo;

  /**
   * Entwurfs-Kennzeichen "geändert seit vX": der Arbeitsstand ist in keiner
   * Version eingefroren. Seit #80 Systemtelemetrie in der Fusszeile statt
   * einer Pille zwischen den Knoepfen der Kopfzone.
   */
  protected readonly versionsStand = computed(() => {
    if (!this.profilStand()) return '';
    const id = this.state.activeProfileId();
    const e = id ? this.store.entries().find((x) => x.id === id) : undefined;
    return e?.geaendert && e.letzteVersionNr ? `geändert seit v${e.letzteVersionNr}` : '';
  });
}
