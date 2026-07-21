import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { MessageRef } from '../../models/xsd-index.model';

interface MsgGroup {
  file: string;
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

  /** renderMsgList (Z.1704-1721): nach Datei gruppiert, gefiltert. */
  protected readonly groups = computed<MsgGroup[]>(() => {
    const idx = this.state.idx();
    if (!idx) return [];
    const f = this.filter().toLowerCase();
    const byFile: Record<string, MessageRef[]> = {};
    for (const m of idx.messages) {
      if (f && !(m.name.toLowerCase().includes(f) || m.doc.toLowerCase().includes(f))) continue;
      (byFile[m.file] ??= []).push(m);
    }
    return Object.keys(byFile)
      .sort()
      .map((file) => ({ file, messages: byFile[file]! }));
  });

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

  protected firstLine(doc: string): string {
    return doc.split('\n')[0]!;
  }
}
