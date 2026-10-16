import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestnachrichtDruckService } from '../../core/services/testnachricht-druck.service';

/**
 * Druckansicht der Testnachricht-Uebersicht: die Nachricht in ihrer
 * Gliederung, je Hauptelement eine Seite. Sichtbar nur im Druck, und auch
 * dort nur, solange der TestnachrichtDruckService druckt.
 */
@Component({
  selector: 'app-testnachricht-druck',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './testnachricht-druck.html',
})
export class TestnachrichtDruck {
  protected readonly druck = inject(TestnachrichtDruckService).druck;
}
