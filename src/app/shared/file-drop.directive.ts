import { Directive, ElementRef, inject, output, signal } from '@angular/core';

/**
 * Drag&Drop von Dateien (Profilierer.html Z.2433-2442). Verhindert das
 * Standard-Browserverhalten und meldet die abgelegten Dateien; die Zuordnung
 * (XSD / Profil / Codelisten / Testnachricht) erledigt der Empfaenger.
 *
 * Solange etwas ueber der Flaeche schwebt, traegt das Wirtselement die Klasse
 * `dateiUeber` — damit eine ausgewiesene Ablageflaeche (Upload-Dialog des
 * Testdaten-Speichers) zeigen kann, dass sie das Ziel ist.
 */
@Directive({
  selector: '[appFileDrop]',
  host: {
    '(dragover)': 'onOver($event)',
    '(dragleave)': 'onLeave($event)',
    '(drop)': 'onDrop($event)',
    '[class.dateiUeber]': 'ueberFlaeche()',
  },
})
export class FileDropDirective {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly filesDropped = output<File[]>();

  /** Schwebt gerade etwas ueber der Flaeche? */
  protected readonly ueberFlaeche = signal(false);

  onOver(e: DragEvent): void {
    e.preventDefault();
    this.ueberFlaeche.set(true);
  }

  /**
   * `dragleave` feuert auch beim Uebergang auf ein **Kindelement** der Flaeche
   * — dort liegt das Ziel aber weiterhin. Nur das Verlassen der Flaeche selbst
   * nimmt die Hervorhebung zurueck; ohne diese Pruefung flackerte sie ueber dem
   * Text der Ablageflaeche.
   */
  onLeave(e: DragEvent): void {
    const ziel = e.relatedTarget as Node | null;
    if (ziel && this.host.nativeElement.contains(ziel)) return;
    this.ueberFlaeche.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.ueberFlaeche.set(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) this.filesDropped.emit(Array.from(files));
  }
}
