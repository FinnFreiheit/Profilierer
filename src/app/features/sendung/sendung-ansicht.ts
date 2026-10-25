import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { SendungService, SendungsPlatz } from '../../core/services/sendung.service';
import { AnlagenQuelle, Befund } from '../../../../server/sendung/pruefung.js';

const BESTANDTEIL_TEXT: Record<string, string> = {
  '001': 'Original',
  '002': 'Repräsentat',
  '003': 'Signatur',
  '004': 'signierte Vorversion',
  '006': 'Transfervermerk',
  '010': 'Prüfvermerk',
  '011': 'VHN',
  '012': 'hinlaufendes eEB',
  '013': 'ursprüngliches Format',
};

const QUELLE_TEXT: Record<AnlagenQuelle, string> = {
  upload: 'hochgeladen',
  platzhalter: 'Platzhalter',
  signatur: 'Testsignatur',
  testnachricht: 'Testnachricht',
};

const QUELLE_TITEL: Record<AnlagenQuelle, string> = {
  upload: 'Hochgeladene Datei — geht unverändert ins Paket',
  platzhalter: 'Wird beim Export als Platzhalter-PDF mit den Angaben aus der XML erzeugt',
  signatur:
    'Wird beim Export als abgesetzte Testsignatur über die beigelegte Bezugsdatei erzeugt (nicht qualifiziert)',
  testnachricht: 'Eingebundene Testnachricht',
};

/**
 * **Sendungs-Darstellung** (Testsendung, ADR 0024): die offene Testnachricht als
 * das, was beim Empfaenger ankommt — `xjustiz_nachricht.xml` und je Platz des
 * Schriftgutobjekts eine Datei. Dieselbe Karte wie die XML-Darstellung (Kopf,
 * Inhalt, Fuss), gegliedert nach Dokument. Hochladen, Ersetzen und Entfernen
 * nur im Bearbeiten-Modus; Herunterladen und Befunde immer.
 */
@Component({
  selector: 'app-sendung-ansicht',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sendung-ansicht.html',
})
export class SendungAnsicht {
  protected readonly sendung = inject(SendungService);
  private readonly state = inject(StateService);

  private readonly dateiInput = viewChild<ElementRef<HTMLInputElement>>('dateiInput');
  /** Platz, fuer den der Dateidialog gerade offen ist. */
  private ziel: string | null = null;

  protected readonly bilanz = computed(() => {
    const plaetze = new Set(this.sendung.plaetze().map((p) => p.dateiname)).size;
    const dateien = this.sendung.dateien();
    const hoch = dateien.filter((d) => d.quelle === 'upload').length;
    return `${plaetze} Plätze · ${hoch} hochgeladen · ${dateien.length - hoch} erzeugt · ${plaetze - dateien.length} leer`;
  });

  protected bestandteil(code: string | undefined): string {
    if (!code) return 'ohne Bestandteil';
    return BESTANDTEIL_TEXT[code] ?? `Bestandteil ${code}`;
  }

  protected quelleText(p: SendungsPlatz): string {
    return p.datei ? QUELLE_TEXT[p.datei.quelle] : 'leer';
  }

  protected quelleTitel(p: SendungsPlatz): string {
    if (p.datei) return QUELLE_TITEL[p.datei.quelle];
    return p.platz.bestandteil === '003'
      ? 'Keine Testsignatur möglich: die Bezugsdatei fehlt in der Sendung'
      : 'Für diese Dateiart erzeugt der Export nichts — bitte eine Datei hochladen';
  }

  protected quelleKlasse(p: SendungsPlatz): string {
    return 'quellePill q-' + (p.datei?.quelle ?? 'leer');
  }

  protected befundTitel(befunde: Befund[]): string {
    return befunde.map((b) => b.text).join('\n');
  }

  protected hatFehler(befunde: Befund[]): boolean {
    return befunde.some((b) => b.schwere === 'fehler');
  }

  protected beschaeftigt(dateiname: string): boolean {
    return this.sendung.beschaeftigt().has(dateiname);
  }

  protected waehleDatei(dateiname: string): void {
    const input = this.dateiInput()?.nativeElement;
    if (!input) return;
    this.ziel = dateiname;
    input.value = '';
    input.click();
  }

  protected async dateiGewaehlt(ev: Event): Promise<void> {
    const datei = (ev.target as HTMLInputElement).files?.[0];
    const ziel = this.ziel;
    this.ziel = null;
    if (datei && ziel) await this.sendung.ablegen(ziel, datei);
  }

  protected entfernen(dateiname: string): void {
    if (confirm(`Hochgeladene Datei „${dateiname}" entfernen?`))
      void this.sendung.entfernen(dateiname);
  }

  protected paket(): void {
    const { fehler } = this.sendung.zahlen();
    if (
      fehler &&
      !confirm(`Die Sendung hat ${fehler} Fehler (siehe Befunde). Trotzdem herunterladen?`)
    )
      return;
    const name =
      this.state.messageEdit()?.quellName ||
      this.state.messageCreate()?.name ||
      this.state.msgName() ||
      '';
    void this.sendung.paketHerunterladen(name);
  }
}
