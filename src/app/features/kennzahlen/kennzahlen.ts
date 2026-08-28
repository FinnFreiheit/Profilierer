import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { KennzahlenStoreService } from '../../core/services/kennzahlen-store.service';
import { RolleService } from '../../core/services/rolle.service';
import { StateService } from '../../core/services/state.service';
import { BetaBadge } from '../../shared/beta-badge/beta-badge';
import { RolleBadge } from '../../shared/rolle-badge/rolle-badge';
import { BalkenDiagramm } from './balken-diagramm';
import { VerlaufDiagramm } from './verlauf-diagramm';

/** Ein Balken des Tagesprofils. */
interface Stundenbalken {
  x: number;
  y: number;
  hoehe: number;
  stunde: number;
  zugriffe: number;
}

const PROFIL = { breite: 720, hoehe: 120, unten: 18 };

/**
 * Kennzahlen der Instanz (#kennzahlen): wie stark das Werkzeug genutzt wird
 * (anonyme Zaehlung, siehe KlientService) und was darin liegt (Bestand).
 *
 * AG-exklusiv — Nutzungszahlen gehen die externen Betrachter der offen
 * erreichbaren Instanz nichts an. Faellt die Rolle waehrend der Ansicht weg
 * (Abmelden), wechselt sie zurueck in die Bibliothek.
 */
@Component({
  selector: 'app-kennzahlen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BetaBadge, RolleBadge, VerlaufDiagramm, BalkenDiagramm],
  templateUrl: './kennzahlen.html',
})
export class Kennzahlen {
  private readonly state = inject(StateService);
  protected readonly store = inject(KennzahlenStoreService);
  protected readonly rolle = inject(RolleService);

  /** Laenge des betrachteten Zeitraums in Tagen. */
  protected readonly tage = signal(30);
  protected readonly zeitraeume = [7, 30, 90];

  protected readonly daten = this.store.daten;
  protected readonly nutzung = computed(() => this.daten()?.nutzung ?? null);
  protected readonly bestand = computed(() => this.daten()?.bestand ?? null);

  protected readonly profilBreite = PROFIL.breite;
  protected readonly profilHoehe = PROFIL.hoehe;

  constructor() {
    void this.store.refresh(this.tage());
    effect(() => {
      if (!this.rolle.agAktiv()) this.state.view.set('dashboard');
    });
  }

  protected waehleZeitraum(tage: number): void {
    this.tage.set(tage);
    void this.store.refresh(tage);
  }

  protected aktualisieren(): void {
    void this.store.refresh(this.tage());
  }

  /** Tagesprofil der letzten sieben Tage als Balken. */
  protected readonly stundenbalken = computed<Stundenbalken[]>(() => {
    const profil = this.nutzung()?.stundenprofil ?? [];
    const max = Math.max(1, ...profil);
    const platz = PROFIL.hoehe - PROFIL.unten;
    const breite = PROFIL.breite / 24;
    return profil.map((zugriffe, stunde) => {
      const hoehe = (zugriffe / max) * platz;
      return {
        x: stunde * breite + 2,
        y: PROFIL.hoehe - PROFIL.unten - hoehe,
        hoehe,
        stunde,
        zugriffe,
      };
    });
  });

  protected readonly stundenBalkenBreite = PROFIL.breite / 24 - 4;
  protected readonly stundenprofilLeer = computed(() =>
    (this.nutzung()?.stundenprofil ?? []).every((n) => n === 0),
  );

  /** Anteil abgenommener Profile (fuer den Balken auf der Kachel). */
  protected readonly abnahmeQuote = computed(() => {
    const b = this.bestand();
    return b && b.profile > 0 ? (b.profileAbgenommen / b.profile) * 100 : 0;
  });

  /** Anteil entschiedener Profilierungspunkte ueber die ganze Bibliothek. */
  protected readonly fortschrittQuote = computed(() => {
    const b = this.bestand();
    return b && b.punkteGesamt > 0 ? (b.punkteEntschieden / b.punkteGesamt) * 100 : 0;
  });

  protected readonly fehlerQuote = computed(() => {
    const n = this.nutzung();
    return n && n.fenster.zugriffe > 0 ? (n.fenster.fehler / n.fenster.zugriffe) * 100 : 0;
  });

  /** Antwortzeiten: unter einer Sekunde in ms, darueber in Sekunden. */
  protected dauerText(ms: number): string {
    if (!ms) return '—';
    return ms < 1000
      ? `${String(ms).replace('.', ',')} ms`
      : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  }

  protected prozentText(anteil: number): string {
    return `${anteil.toFixed(anteil > 0 && anteil < 10 ? 1 : 0).replace('.', ',')} %`;
  }

  protected zeitraumText(): string {
    const z = this.daten()?.zeitraum;
    return z ? `${datum(z.von)} bis ${datum(z.bis)}` : '';
  }

  protected standText(): string {
    const e = this.daten()?.erzeugt;
    return e ? new Date(e).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  }

  protected goProjekte(): void {
    this.state.view.set('projekte');
  }
  protected goDashboard(): void {
    this.state.view.set('dashboard');
  }
  protected goTestdaten(): void {
    this.state.view.set('testdaten');
  }
  protected goHowto(): void {
    this.state.view.set('howto');
  }
}

/** 'YYYY-MM-DD' -> 'TT.MM.JJJJ'. */
function datum(tag: string): string {
  const [j, m, t] = tag.split('-');
  return `${t}.${m}.${j}`;
}
