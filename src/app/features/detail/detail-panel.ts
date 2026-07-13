import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { ValueService } from '../../core/services/value.service';
import { NavService } from '../../core/services/nav.service';
import { CodelistService } from '../../core/services/codelist.service';
import { ToastService } from '../../core/services/toast.service';
import { itemPath } from '../../models/node.model';
import { fmtKard, kardText, pretty } from '../../core/util/pretty.util';
import { REF_LABELS, refKindOf } from '../../core/refs';

/**
 * Detailbereich (Profilierer.html Z.1506-1666): Status, Kardinalitaet,
 * Ausprägungen, Codelisten-Werte, Verweisziel, Anmerkung, Beispielwert.
 * Der XRepository-Einzelabruf (dClFetch) folgt in P5.
 */
@Component({
  selector: 'app-detail-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detail-panel.html',
})
export class DetailPanel {
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly values = inject(ValueService);
  private readonly nav = inject(NavService);
  private readonly codelistSvc = inject(CodelistService);
  private readonly toast = inject(ToastService);

  protected readonly clFilter = signal('');

  /** Betrachtungsmodus: Editier-Controls werden im Template ausgeblendet. */
  protected readonly ro = computed(() => this.state.readOnly());

  protected readonly vm = computed(() => {
    const it = this.state.selItem();
    if (!it) return null;
    const isAusp = it.kind === 'ausp';
    const n = isAusp ? it.parentNode : it.node;
    const path = itemPath(it);
    const p = this.state.elemente()[path] ?? {};
    const st = this.state.statusOf(path);

    const statusButtons = [
      { id: '', name: 'wie Standard', farbe: 'var(--accent)', active: !st },
      ...this.state.statuses().map((s) => ({
        id: s.id,
        name: s.name,
        farbe: s.farbe,
        active: !!st && st.id === s.id,
      })),
    ];

    const kmin = isAusp ? '1' : n.min;
    const kmax = isAusp ? '1' : n.max === 'unbounded' ? '*' : n.max;

    const showAusps = !isAusp && this.tree.isRepeatable(n) && !n.synthetic;
    const auspList = showAusps ? this.state.auspsOf(path) ?? [] : [];

    // Codeliste.
    let codelist: null | {
      nameLang: string;
      kennung: string;
      geladen: boolean;
      version: string | null;
      eff: { value: string; label: string; checked: boolean; search: string }[] | null;
      allowedCount: number;
      total: number;
      showFilter: boolean;
      manualText: string;
    } = null;
    if (n.codelist && (!isAusp || this.tree.isLeaf(n))) {
      const cl = n.codelist;
      const eff = this.values.clWerte(cl);
      const geladen = !(cl.werte && cl.werte.length) && !!eff;
      const allowed = new Set(p.werte ?? []);
      codelist = {
        nameLang: cl.nameLang,
        kennung: cl.kennung,
        geladen,
        version: this.values.clVersion(cl),
        eff: eff
          ? eff.map((w) => ({
              value: w.value,
              label: w.label,
              checked: !p.werte || allowed.has(w.value),
              search: (w.value + ' ' + w.label).toLowerCase(),
            }))
          : null,
        allowedCount: allowed.size,
        total: eff ? eff.length : 0,
        showFilter: !!eff && eff.length > 15,
        manualText: (p.werte ?? []).join('\n'),
      };
    }

    // Verweisziel.
    let ref: null | {
      label: string;
      options: { path: string; label: string; selected: boolean }[];
      cur: string;
      curLabel: string;
    } = null;
    const rk = refKindOf(n);
    if (rk) {
      const kand = this.state.refZielKandidaten(rk);
      const cur = p.refZiel || '';
      const options = [{ path: '', label: '— kein Ziel festgelegt —', selected: !cur }];
      let curFound = false;
      for (const k of kand) {
        if (k.path === cur) curFound = true;
        options.push({ path: k.path, label: k.label, selected: k.path === cur });
      }
      if (cur && !curFound)
        options.push({ path: cur, label: this.state.auspLabel(cur), selected: true });
      const curLabel = options.find((o) => o.selected)?.label ?? '— kein Ziel festgelegt —';
      ref = { label: REF_LABELS[rk] || rk, options, cur, curLabel };
    }

    return {
      isAusp,
      auspName: isAusp ? it.ausp.name : '',
      parentName: n.name,
      title: pretty(n.name),
      sub: n.name + (n.typeName ? ' : ' + n.typeName : '') + ' · Standard: ' + kardText(n.min, n.max),
      subKard: fmtKard(n.min, n.max),
      doc: !isAusp ? n.doc : '',
      statusButtons,
      kminPlaceholder: kmin,
      kmaxPlaceholder: kmax,
      minValue: p.min ?? '',
      maxValue: p.max ?? '',
      kardHint: isAusp ? 'genau 1' : 'Standard',
      showAusps,
      auspList,
      codelist,
      ref,
      anmerkung: p.anmerkung ?? '',
      beispiel: p.beispiel ?? '',
      curStatusName: st?.name ?? 'wie Standard',
    };
  });

  /** Codelisten-Zeilen nach dem lokalen Filter. */
  protected readonly filteredEff = computed(() => {
    const cl = this.vm()?.codelist;
    if (!cl?.eff) return [];
    const q = this.clFilter().toLowerCase();
    return q ? cl.eff.filter((w) => w.search.includes(q)) : cl.eff;
  });

  private path(): string {
    const it = this.state.selItem();
    return it ? itemPath(it) : '';
  }

  private parentPath(): string {
    const it = this.state.selItem();
    return it && it.kind === 'ausp' ? it.parentNode.path : '';
  }

  // ── Aktionen ────────────────────────────────────────────────────────

  protected setStatus(id: string): void {
    this.state.setElementProfile(this.path(), { status: id || undefined });
  }

  protected setField(key: 'min' | 'max' | 'anmerkung' | 'beispiel', e: Event): void {
    const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value.trim();
    this.state.setElementProfile(this.path(), { [key]: v || undefined });
  }

  protected onAuspNameSelf(e: Event): void {
    const it = this.state.selItem();
    if (!it || it.kind !== 'ausp') return;
    this.state.renameAusp(it.parentNode.path, it.ausp.id, (e.target as HTMLInputElement).value);
  }

  protected addAusp(): void {
    this.state.addAusp(this.path());
  }

  protected renameAuspRow(id: string, e: Event): void {
    this.state.renameAusp(this.path(), id, (e.target as HTMLInputElement).value);
  }

  protected delAuspRow(id: string): void {
    if (confirm('Ausprägung samt Unter-Profilierung löschen?'))
      this.state.removeAusp(this.path(), id);
  }

  protected toggleWert(value: string): void {
    const cl = this.vm()?.codelist;
    if (!cl?.eff) return;
    const all = cl.eff.map((w) => w.value);
    const p = this.state.elemente()[this.path()] ?? {};
    const cur = p.werte && p.werte.length ? new Set(p.werte) : new Set(all);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    const sel = all.filter((v) => cur.has(v));
    this.state.setElementProfile(this.path(), { werte: sel.length === all.length ? undefined : sel });
  }

  protected clAll(): void {
    this.state.setElementProfile(this.path(), { werte: undefined });
  }

  protected clNone(): void {
    this.state.setElementProfile(this.path(), { werte: [] });
  }

  protected onManualWerte(e: Event): void {
    const lines = (e.target as HTMLTextAreaElement).value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    this.state.setElementProfile(this.path(), { werte: lines.length ? lines : undefined });
  }

  protected onClFilter(e: Event): void {
    this.clFilter.set((e.target as HTMLInputElement).value);
  }

  protected setRefZiel(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.state.setElementProfile(this.path(), { refZiel: v || undefined });
  }

  protected refJump(): void {
    const cur = this.vm()?.ref?.cur;
    if (cur) this.nav.jumpTo(cur);
  }

  protected async fetchSingle(): Promise<void> {
    const kennung = this.vm()?.codelist?.kennung;
    if (!kennung) return;
    try {
      const cl = await this.codelistSvc.fetchSingleCodelist(kennung);
      this.toast.show(`Codeliste „${cl.name || cl.kennung}" geladen (V ${cl.version}, ${cl.werte.length} Werte).`);
    } catch (e) {
      this.toast.show(
        'Abruf fehlgeschlagen: ' +
          (e instanceof Error ? e.message : e) +
          ' — ggf. ZIP über „Codelisten: Datei…" laden.',
      );
    }
  }
}
