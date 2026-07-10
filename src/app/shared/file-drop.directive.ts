import { Directive, output } from '@angular/core';

/**
 * Drag&Drop von Dateien (Profilierer.html Z.2433-2442). Verhindert das
 * Standard-Browserverhalten und meldet die abgelegten Dateien; die Zuordnung
 * (XSD / Profil / Codelisten) erledigt der Empfaenger.
 */
@Directive({
  selector: '[appFileDrop]',
  host: {
    '(dragover)': 'onOver($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class FileDropDirective {
  readonly filesDropped = output<File[]>();

  onOver(e: DragEvent): void {
    e.preventDefault();
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length) this.filesDropped.emit(Array.from(files));
  }
}
