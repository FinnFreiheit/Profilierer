import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { KennzahlenTag } from '../../models/kennzahlen.model';
import { RAND, VB, netteObergrenze, tagKurz, xPos, yPos } from './diagramm.util';

/** Ein Messpunkt samt Beschriftung fuers Template. */
interface Punkt {
  x: number;
  y: number;
  tag: string;
  wert: number;
  titel: string;
}

/**
 * Verlauf einer Tagesreihe als Flaeche mit Linie. Bewusst ein Diagramm je
 * Reihe: Zugriffe und aktive Klienten liegen um ein Vielfaches auseinander —
 * auf einer gemeinsamen Achse waere die kleinere Reihe ein Strich am Boden,
 * mit zwei Achsen waere das Bild unehrlich.
 */
@Component({
  selector: 'app-verlauf-diagramm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verlauf-diagramm.html',
})
export class VerlaufDiagramm {
  readonly tage = input.required<KennzahlenTag[]>();
  /** Welche Reihe gezeigt wird. */
  readonly reihe = input<'zugriffe' | 'klienten'>('zugriffe');
  /** Bezeichnung der Reihe (Achse, Vorlesetext, Tooltip). */
  readonly beschriftung = input('Zugriffe');

  protected readonly vb = VB;
  protected readonly rand = RAND;

  protected readonly werte = computed(() =>
    this.tage().map((t) => (this.reihe() === 'klienten' ? t.klienten : t.zugriffe)),
  );

  protected readonly obergrenze = computed(() => netteObergrenze(Math.max(...this.werte(), 0)));

  protected readonly punkte = computed<Punkt[]>(() => {
    const tage = this.tage();
    const werte = this.werte();
    const grenze = this.obergrenze();
    return tage.map((t, i) => {
      const wert = werte[i] ?? 0;
      return {
        x: xPos(i, tage.length),
        y: yPos(wert, grenze),
        tag: t.tag,
        wert,
        titel: `${tagKurz(t.tag)} ${wert} ${this.beschriftung()}`,
      };
    });
  });

  protected readonly linie = computed(() =>
    this.punkte()
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly flaeche = computed(() => {
    const p = this.punkte();
    const erster = p[0];
    const letzter = p[p.length - 1];
    if (!erster || !letzter || p.length < 2) return '';
    const boden = VB.hoehe - RAND.unten;
    return `${this.linie()} L ${letzter.x.toFixed(1)} ${boden} L ${erster.x.toFixed(1)} ${boden} Z`;
  });

  /** Waagerechte Hilfslinien samt Zahl: 0, Haelfte, Obergrenze. */
  protected readonly gitter = computed(() =>
    [0, 0.5, 1].map((anteil) => {
      const wert = Math.round(this.obergrenze() * anteil);
      return { wert, y: yPos(wert, this.obergrenze()) };
    }),
  );

  /** Nur jede n-te Tagesbeschriftung, sonst ueberlappen die Zahlen. */
  protected readonly achse = computed(() => {
    const p = this.punkte();
    const schritt = Math.max(1, Math.ceil(p.length / 7));
    return p
      .filter((_, i) => i % schritt === 0 || i === p.length - 1)
      .map((q) => ({
        x: q.x,
        text: tagKurz(q.tag),
      }));
  });

  /** Zu wenig Punkte fuer eine Linie — dann sagt die Ansicht das, statt eine leere Flaeche zu zeigen. */
  protected readonly leer = computed(() => this.punkte().length < 2);

  /** Ein Satz fuer Screenreader statt einer stummen Grafik. */
  protected readonly vorlesetext = computed(() => {
    const p = this.punkte();
    const erster = p[0];
    const letzter = p[p.length - 1];
    if (!erster || !letzter) return `${this.beschriftung()}: keine Daten`;
    const spitze = p.reduce((a, b) => (b.wert > a.wert ? b : a));
    return `${this.beschriftung()} je Tag vom ${tagKurz(erster.tag)} bis ${tagKurz(letzter.tag)}, Höchstwert ${spitze.wert} am ${tagKurz(spitze.tag)}.`;
  });
}
