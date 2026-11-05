import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AnlagenVorschauService } from '../../core/services/anlagen-vorschau.service';
import { SendungService } from '../../core/services/sendung.service';
import { groesseText } from '../../core/util/anlage-vorschau.util';
import {
  MARKEN_KLASSE,
  XmlToken,
  kommentarOffen,
  tokenisiereXmlZeile,
} from '../../core/util/xml-hervorhebung.util';

/**
 * Vorschau einer Datei der Testsendung: PDF eingebettet, XML mit
 * Hervorhebung, Signaturen und andere Binaerdateien mit ihren Kenndaten.
 * Gesteuert vom `AnlagenVorschauService`; in der Shell eingebunden, damit
 * Sendungsansicht und Detail-Karte denselben Dialog nutzen.
 */
@Component({
  selector: 'app-anlage-vorschau',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './anlage-vorschau.html',
})
export class AnlageVorschau {
  protected readonly vorschau = inject(AnlagenVorschauService);
  protected readonly sendung = inject(SendungService);
  private readonly san = inject(DomSanitizer);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly v = this.vorschau.offen;

  /** Objekt-URL der eigenen Ablage — fuer das iframe freigegeben. */
  protected readonly sichereUrl = computed<SafeResourceUrl | null>(() => {
    const v = this.v();
    return v ? this.san.bypassSecurityTrustResourceUrl(v.url) : null;
  });

  protected readonly zeilen = computed<{ nr: number; tokens: XmlToken[] }[]>(() => {
    const v = this.v();
    if (!v || v.art !== 'xml') return [];
    let imKommentar = false;
    return v.text.split(/\r?\n/).map((text, i) => {
      const tokens = tokenisiereXmlZeile(text, imKommentar);
      imKommentar = kommentarOffen(text, imKommentar);
      return { nr: i + 1, tokens };
    });
  });

  /** Kenndaten in einer Zeile: Groesse, Pruefwert, wer und wann. */
  protected readonly kenndaten = computed(() => {
    const a = this.v()?.anlage;
    if (!a) return '';
    const teile = [groesseText(a.groesse), `SHA-256 ${a.sha256.slice(0, 16)}…`];
    if (a.autor) teile.push(a.autor);
    if (a.hochgeladen) teile.push(new Date(a.hochgeladen).toLocaleString('de-DE'));
    return teile.join(' · ');
  });

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.v()) {
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected markenKlasse(t: XmlToken): string {
    return MARKEN_KLASSE[t.art];
  }

  protected herunterladen(): void {
    const v = this.v();
    if (v) void this.sendung.anlageHerunterladen(v.dateiname);
  }
}
