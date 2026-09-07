import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MessagePicker } from '../message-picker/message-picker';
import { Search } from '../search/search';

/**
 * **Ort-Zeile** (Editor v4, Zeile 2 der Kopfzone): wo bin ich und wie finde
 * ich etwas — Nachrichtentyp links, Suche rechts. Bewusst getrennt von der
 * Arbeits-Zeile darunter: die beantwortet "wie arbeite ich" und "wie weit bin
 * ich", das ist eine andere Frage.
 *
 * Der Pfad (`app-crumbs`) steht noch in der Arbeits-Zeile; er wandert mit der
 * Fusszeile (E3) nach unten. Das Segment Baum|XML kommt mit der
 * XML-Darstellung (E6) rechts dazu.
 */
@Component({
  selector: 'app-ortzeile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessagePicker, Search],
  templateUrl: './ortzeile.html',
})
export class Ortzeile {}
