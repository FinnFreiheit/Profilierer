import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { MessageRef } from '../../models/xsd-index.model';
import { firstLine } from '../../core/util/pretty.util';
import { nachFachmodul } from '../../core/util/fachmodul.util';

interface MsgGroup {
  /** Fachmodul-Kuerzel; leer = Sammelgruppe fuer abweichende Namen. */
  modul: string;
  /** Schemadateien der Gruppe — als Tooltip, zum Nachschlagen im Standard. */
  dateien: string;
  messages: MessageRef[];
}

/**
 * Nachrichtenauswahl (Profilierer.html Z.246-249, renderMsgList/openMsgPanel
 * Z.1704-1731, loadMessage-Trigger). Als Popover unter dem Button.
 */
@Component({
  selector: 'app-message-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-picker.html',
})
export class MessagePicker {
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);

  protected readonly open = signal(false);
  protected readonly filter = signal('');
  protected readonly pos = signal<{ left: number; top: number }>({ left: 0, top: 0 });

  protected readonly hasIdx = computed(() => !!this.state.idx());
  protected readonly label = computed(() => {
    const m = this.state.msgName();
    return m ? m + ' ▾' : 'Nachricht wählen ▾';
  });

  /**
   * renderMsgList (Z.1704-1721), gefiltert — seit #89 nach **Fachmodul**
   * gruppiert statt nach Schemadatei. Der Dateiname (`xjustiz_0500_straf_3_6.xsd`)
   * beantwortete die fachliche Frage nur indirekt; er bleibt als Tooltip der
   * Ueberschrift erhalten, weil er beim Nachschlagen im Standard hilft.
   */
  protected readonly groups = computed<MsgGroup[]>(() => {
    const idx = this.state.idx();
    if (!idx) return [];
    const f = this.filter().toLowerCase();
    const treffer = idx.messages.filter(
      (m) => !f || m.name.toLowerCase().includes(f) || m.doc.toLowerCase().includes(f),
    );
    return nachFachmodul(treffer, (m) => m.name).map((g) => ({
      modul: g.modul,
      dateien: [...new Set(g.items.map((m) => m.file))].sort().join(' · '),
      messages: g.items,
    }));
  });

  /** Ueberschrift einer Gruppe; ohne erkennbares Modul eine Sammelgruppe. */
  protected modulTitel(modul: string): string {
    return modul || 'weitere Nachrichten';
  }

  protected toggle(btn: HTMLElement): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const r = btn.getBoundingClientRect();
    this.pos.set({ left: r.left, top: r.bottom + 4 });
    this.filter.set('');
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onFilter(e: Event): void {
    this.filter.set((e.target as HTMLInputElement).value);
  }

  protected select(name: string): void {
    this.close();
    this.nav.loadMessage(name);
    // Neue Profilierung: Pflichtelemente sofort als "zwingend" vorbelegen —
    // entfaellt in der reinen Schema-Ansicht (dort gibt es keine Profilierung).
    if (!this.state.schemaView()) this.nav.prefillMandatoryStatus();
  }

  protected readonly firstLine = firstLine;
}
