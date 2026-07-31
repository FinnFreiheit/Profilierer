import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { HinweisStoreService } from '../../core/services/hinweis-store.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
import { ToastService } from '../../core/services/toast.service';
import { LoggerService } from '../../core/services/logger.service';
import { pretty } from '../../core/util/pretty.util';
import { hinweisFehlerText, hinweisHerkunft } from '../../core/util/hinweis.util';

/** Eine Zeile der Uebersicht: geparkter Punkt (#41) oder Hinweis. */
interface Zeile {
  id: string;
  pfad: string;
  geparkt: boolean;
  text: string;
  /** „Müller (BLK-AG), 26.07.30" — leer bei geparkten Punkten. */
  herkunft: string;
  badge: string;
  farbe: string;
  erledigt: boolean;
  /** Darf der Betrachter abhaken/loeschen? (Abnahme-Schutz, #42) */
  aenderbar: boolean;
}

/**
 * Uebersicht aller Hinweise (US "Hinweis pro Element"): jeder Hinweis steht
 * einzeln in der Liste — mehrere am selben Element nebeneinander —, Klick
 * springt zum Element, die Checkbox arbeitet ihn ab (reaktivierbar), das Kreuz
 * loescht ihn. Geoeffnet per open() aus der Toolbar (Muster MetaDialog); die
 * Liste kommt reaktiv aus dem HinweisStoreService.
 */
@Component({
  selector: 'app-hinweise-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hinweise-dialog.html',
})
export class HinweiseDialog {
  private readonly state = inject(StateService);
  protected readonly hinweise = inject(HinweisStoreService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerService);

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  /** Zahl der geparkten Punkte („zu klären", #41) — 0 ausserhalb des Profil-Modus. */
  protected readonly zuKlaeren = computed(() => this.guided.geparkteSet().size);

  /**
   * Die Liste der Uebersicht: **geparkte Punkte zuoberst** (Issue #41), danach
   * die Hinweise in ihrer gewohnten Ordnung. Ein geparkter Punkt ist kein
   * Hinweis, sondern eine Entscheidung — er zeigt darum ein farbiges Badge
   * statt der Erledigt-Checkbox und traegt den Text seiner offenen Hinweise
   * bzw. „(kein Text)", wenn der Anwender den Punkt ohne Notiz vertagt hat.
   * Hinweise an geparkten Pfaden erscheinen nicht zweimal.
   */
  protected readonly zeilen = computed<Zeile[]>(() => {
    const geparkt = this.guided.geparkteSet();
    const stufe = this.state.markierungStatus();
    const jePfad = this.hinweise.offeneJePfad();
    const oben: Zeile[] = [...geparkt].sort().map((pfad) => ({
      id: 'geparkt:' + pfad,
      pfad,
      geparkt: true,
      text: (jePfad.get(pfad) ?? []).map((h) => h.text).join(' · ') || '(kein Text)',
      herkunft: '',
      badge: stufe?.name ?? 'zu klären',
      farbe: stufe?.farbe ?? 'var(--muted)',
      erledigt: false,
      aenderbar: false,
    }));
    const rest: Zeile[] = this.hinweise
      .eintraege()
      .filter((h) => !geparkt.has(h.pfad))
      .map((h) => ({
        id: h.id,
        pfad: h.pfad,
        geparkt: false,
        text: h.text,
        herkunft: hinweisHerkunft(h),
        badge: '',
        farbe: '',
        erledigt: !!h.erledigt,
        // An einer abgenommenen Profilierung sind Abhaken, Aendern und Loeschen
        // der AG vorbehalten (#42) — Ausnahme ist der selbst angelegte Eintrag
        // derselben Sitzung. Was der Server abweist, bietet die Uebersicht gar
        // nicht erst an.
        aenderbar: !this.state.abnahmeSchreibschutz() || this.hinweise.istEigener(h.id),
      }));
    return [...oben, ...rest];
  });

  open(): void {
    this.dlg().nativeElement.showModal();
  }

  protected schliesse(): void {
    this.dlg().nativeElement.close();
  }

  /** Sprung zum betroffenen Knoten — der modale Dialog muss vorher zu. */
  protected springe(pfad: string): void {
    this.schliesse();
    this.nav.jumpTo(pfad);
  }

  protected async toggleErledigt(id: string, e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const checked = el.checked;
    // Scheitert das Schreiben, bleibt der Store unveraendert — die Checkbox
    // haette ihren neuen Zustand dann behalten, obwohl nichts passiert ist.
    if (!(await this.melde(this.hinweise.aendern(id, { erledigt: checked }))))
      el.checked = !checked;
  }

  protected loesche(id: string): void {
    void this.melde(this.hinweise.loeschen(id));
  }

  /** Sprechendes Label: letztes Pfadsegment, bei Auspraegungs-Pfaden mit Namen. */
  protected label(pfad: string): string {
    const seg = pfad.split('/').pop() ?? pfad;
    return seg.includes('@') ? this.state.auspLabel(pfad) : pretty(seg);
  }

  /**
   * Schreibfehler sichtbar machen — der Store haelt sonst einen alten Stand.
   * Gibt zurueck, ob der Schreibvorgang durchging.
   */
  private async melde(p: Promise<unknown>): Promise<boolean> {
    try {
      await p;
      return true;
    } catch (e) {
      this.log.error('Hinweise', 'Schreiben fehlgeschlagen', e);
      this.toast.show(hinweisFehlerText(e));
      return false;
    }
  }
}
