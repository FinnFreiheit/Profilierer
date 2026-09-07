import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterEveryRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { ExportService } from '../../core/services/export.service';
import { GuidedService } from '../../core/services/guided.service';
import { NavService } from '../../core/services/nav.service';
import { DownloadService } from '../../core/services/download.service';
import { ToastService } from '../../core/services/toast.service';
import { TeilenService } from '../../core/services/teilen.service';
import { itemPath } from '../../models/node.model';
import {
  XmlToken,
  XmlTokenArt,
  kommentarOffen,
  tokenisiereXmlZeile,
} from '../../core/util/xml-hervorhebung.util';

/** Marken-Art → Klasse der Zeile; die Farbe steht in `styles.scss`. */
const MARKEN_KLASSE: Record<XmlTokenArt, string> = {
  dekl: 'xmlDekl',
  kommentar: 'xmlKommentar',
  tag: 'xmlTag',
  attr: 'xmlAttr',
  attrwert: 'xmlAttrWert',
  wert: 'xmlWert',
  text: 'xmlText',
};

/** Eine Zeile der XML-Karte: Nummer, zugehoeriger Pfad im Baum, Marken. */
export interface XmlZeile {
  nr: number;
  /** Pfad des Elements, das diese Zeile erzeugt hat (null = Rahmenzeile). */
  pfad: string | null;
  tokens: XmlToken[];
}

/**
 * **XML-Darstellung** (Editor v4, Etappe E6). Dieselbe Nachricht wie im Baum,
 * nur in der Form, in der sie am Ende die Leitung verlaesst — als
 * XJustiz-XML. Sie ist die Bruecke zwischen Werkstatt und Ergebnis: im
 * Workshop laesst sich an ihr zeigen, was die Antworten im Baum konkret
 * bewirken, ohne dass jemand die Datei erst herunterladen muss.
 *
 * Die Karte ist **kein zweiter Editor**: sie zeigt, sie aendert nichts. Der
 * Klick auf eine Zeile waehlt das zugehoerige Element aus — der Detailbereich
 * rechts folgt, die Darstellung bleibt XML. So arbeitet man an der Nachricht
 * entlang statt am Baum entlang, wenn das die naheliegendere Ordnung ist.
 *
 * Der Inhalt kommt aus `ExportService.buildBeispielXmlMitPfaden` — demselben
 * Erzeuger wie der Download, damit die Ansicht nie etwas anderes zeigt als
 * die Datei. Im Nachrichten-Modus (`msgMode`) traegt sie die eingetragenen
 * Werte statt der Platzhalter.
 */
@Component({
  selector: 'app-xml-ansicht',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './xml-ansicht.html',
})
export class XmlAnsicht {
  protected readonly state = inject(StateService);
  private readonly exporter = inject(ExportService);
  private readonly guided = inject(GuidedService);
  private readonly nav = inject(NavService);
  private readonly dl = inject(DownloadService);
  private readonly toast = inject(ToastService);
  private readonly teilen = inject(TeilenService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** null = keine Nachricht (Typ-Ansicht) — dafuer gibt es kein XML. */
  protected readonly ergebnis = computed(() =>
    this.exporter.buildBeispielXmlMitPfaden({ instanz: this.state.msgMode() }),
  );

  protected readonly zeilen = computed<XmlZeile[]>(() => {
    const res = this.ergebnis();
    if (!res) return [];
    // Der Kommentar-Zustand laeuft von Zeile zu Zeile mit: der Vorspann der
    // Beispielnachricht ist mehrzeilig, und die Marken-Funktion bleibt rein.
    let imKommentar = false;
    return res.xml.split('\n').map((text, i) => {
      const tokens = tokenisiereXmlZeile(text, imKommentar);
      imKommentar = kommentarOffen(text, imKommentar);
      return { nr: i + 1, pfad: res.zeilenPfade.get(i + 1) ?? null, tokens };
    });
  });

  protected readonly aktiverPfad = computed(() => {
    const it = this.state.selItem();
    return it ? itemPath(it) : null;
  });

  /** Elemente der Nachricht — je Pfad eines, nicht je Zeile (Tags zaehlen doppelt). */
  protected readonly elementZahl = computed(() => {
    const res = this.ergebnis();
    return res ? new Set(res.zeilenPfade.values()).size : 0;
  });

  /**
   * Zweite Zahl der Bilanz. Im Profil zaehlt sie die Auswahlen, bei denen noch
   * keine Alternative erlaubt ist — genau die Stellen, an denen das Beispiel
   * raet. In der konkreten Nachricht gibt es keine Auswahl-Entscheidung; dort
   * ist die offene Restarbeit die Pflichtangabe ohne Wert.
   */
  protected readonly offeneZahl = computed(() => {
    if (this.state.msgMode()) {
      const f = this.guided.fortschritt();
      return f.y - f.x;
    }
    const offen = this.guided.offeneSet();
    return this.guided.punkte().filter((p) => p.art === 'auswahl' && offen.has(p.path)).length;
  });

  protected readonly offenLabel = computed(() =>
    this.state.msgMode() ? 'offene Pflichtangaben' : 'offene Auswahl',
  );

  protected readonly titel = computed(() =>
    this.state.msgMode() ? 'Nachricht' : 'Beispiel-Nachricht',
  );

  protected readonly untertext = computed(() =>
    this.state.msgMode()
      ? 'Die Nachricht mit den eingetragenen Werten.'
      : 'So sieht eine Nachricht aus, die zu Ihren Antworten passt. Die Werte sind Beispiele.',
  );

  protected readonly fussHinweis = computed(() =>
    this.state.msgMode()
      ? 'Enthalten sind nur Felder mit eingetragenem Wert.'
      : 'Nicht enthalten: Felder mit „Weglassen“ und Felder ohne Antwort, die der Standard nicht verlangt.',
  );

  /** Kurze Rueckmeldung am Knopf statt eines Toasts — die Hand ist noch dort. */
  protected readonly kopiert = signal(false);

  /** Zuletzt angesprungener Pfad: ohne ihn scrollte jeder Render erneut. */
  private zuletztGescrollt: string | null = null;
  /** Erste Positionierung nach dem Aufschlagen der Karte (springt statt gleitet). */
  private erstePositionierung = true;

  constructor() {
    afterEveryRender(() => {
      const pfad = this.aktiverPfad();
      if (!pfad || pfad === this.zuletztGescrollt) return;
      this.zuletztGescrollt = pfad;
      this.zeigeAktiveZeile();
    });
  }

  protected zeileKlick(z: XmlZeile): void {
    if (!z.pfad) return;
    // Ohne `sichtbarMachen`: die Zeile steht ja im XML, sie kann nicht von
    // einem Ansichtsfilter des Baums verborgen sein.
    this.nav.jumpTo(z.pfad);
  }

  protected zeilenTitel(z: XmlZeile): string {
    return z.pfad ? 'Zu diesem Feld springen' : '';
  }

  protected markenKlasse(t: XmlToken): string {
    return MARKEN_KLASSE[t.art];
  }

  /**
   * Kopieren laeuft ueber den `TeilenService` — dort liegt der Rueckfall auf
   * `execCommand`, den es ausserhalb des Secure Context (http-Instanz) braucht.
   */
  protected async kopieren(): Promise<void> {
    const res = this.ergebnis();
    if (!res) return;
    if (!(await this.teilen.kopiere(res.xml))) {
      this.toast.show('Kopieren fehlgeschlagen — bitte den Text markieren und kopieren.');
      return;
    }
    this.kopiert.set(true);
    setTimeout(() => this.kopiert.set(false), 1600);
  }

  /**
   * Herunterladen. Im Profil geht das durch `genBeispielXml()` — dort haengen
   * die Rueckfrage zu offenen Entscheidungen und die Schemavalidierung dran,
   * und die duerfen nicht daran vorbeifallen, nur weil der Knopf woanders
   * steht. Im Nachrichten-Modus gibt es diesen Weg nicht: der getreue
   * Instanz-Export (`InstanceExportService`) baut aus dem Quell-DOM und wuerde
   * etwas anderes liefern als die Karte zeigt — heruntergeladen wird deshalb
   * genau der angezeigte Stand.
   */
  protected async herunterladen(): Promise<void> {
    if (!this.state.msgMode()) {
      await this.exporter.genBeispielXml();
      return;
    }
    const res = this.ergebnis();
    if (!res) return;
    const name =
      this.state.messageEdit()?.quellName ||
      this.state.messageCreate()?.name ||
      this.state.msgName() ||
      '';
    this.dl.download(this.dl.xmlFilename(name), res.xml, 'application/xml');
    this.toast.show('Nachricht heruntergeladen — angezeigter Stand.');
  }

  /**
   * Die ausgewaehlte Zeile in den Blick holen — aber nur, wenn sie nicht
   * ohnehin zu sehen ist: ein Ruck bei jedem Klick in die sichtbare Liste
   * waere Unruhe ohne Nutzen.
   */
  private zeigeAktiveZeile(): void {
    const el = this.host.nativeElement.querySelector<HTMLElement>('.xmlZeile.aktiv');
    if (!el?.scrollIntoView) return;
    const behaelter = el.closest('#colWrap');
    const r = el.getBoundingClientRect();
    const b = behaelter
      ? behaelter.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    if (r.top >= b.top && r.bottom <= b.bottom) {
      this.erstePositionierung = false;
      return;
    }
    // Beim Aufschlagen der Karte wird gesprungen, danach geglitten: die Liste
    // findet ihre endgueltige Hoehe erst, waehrend die Zeilen sichtbar werden
    // (`content-visibility: auto`) — eine weiche Bewegung bricht daran ab.
    el.scrollIntoView({
      block: 'center',
      behavior: this.erstePositionierung ? 'auto' : 'smooth',
    });
    this.erstePositionierung = false;
  }
}
