import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * BETA-Kennzeichnung des Werkzeugs: steht in jeder Kopfzeile neben dem
 * Rollen-Badge (Uebersichten und Editor-Kopfleiste), damit der Entwurfsstand
 * in jeder Ansicht sichtbar bleibt.
 */
@Component({
  selector: 'app-beta-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="pill betaPill"
    title="Beta-Fassung — Funktionsumfang und Oberfläche können sich noch ändern"
    >BETA</span
  >`,
})
export class BetaBadge {}
