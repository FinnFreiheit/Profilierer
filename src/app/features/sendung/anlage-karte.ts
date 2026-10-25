import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { SendungService } from '../../core/services/sendung.service';
import { QUELLE_TEXT, bestandteilText } from './sendung-texte';

/**
 * Die Datei eines gewaehlten `datei`-Elements (Testsendung S7) — kompakt im
 * Detailbereich: was auf dem Platz liegt, was die Paketpruefung sagt, und der
 * Sprung in die Sendungs-Ansicht. Ohne zugehoerigen Platz rendert sie nichts.
 */
@Component({
  selector: 'app-anlage-karte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './anlage-karte.html',
})
export class AnlageKarte {
  protected readonly sendung = inject(SendungService);

  /** Pfad des gewaehlten Elements (das `datei`-Element oder eines seiner Blaetter). */
  readonly pfad = input<string | null>(null);

  protected readonly sp = computed(() => this.sendung.platzAnPfad(this.pfad()));

  private readonly dateiInput = viewChild<ElementRef<HTMLInputElement>>('dateiInput');

  protected quelle(): string {
    const p = this.sp();
    if (!p) return '';
    if (p.einbindung && !p.einbindung.vorhanden) return 'gelöscht';
    return p.datei ? QUELLE_TEXT[p.datei.quelle] : 'leer';
  }

  protected quelleKlasse(): string {
    return 'quellePill q-' + (this.sp()?.datei?.quelle ?? 'leer');
  }

  protected bestandteil(): string {
    return bestandteilText(this.sp()?.platz.bestandteil);
  }

  protected waehle(): void {
    const input = this.dateiInput()?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  protected async gewaehlt(ev: Event): Promise<void> {
    const datei = (ev.target as HTMLInputElement).files?.[0];
    const p = this.sp();
    if (datei && p) await this.sendung.ablegen(p.platz.dateiname, datei);
  }

  protected zeige(): void {
    const p = this.sp();
    if (p) this.sendung.zeige(p.platz.dateiname);
  }
}
