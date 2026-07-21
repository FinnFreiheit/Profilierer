import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { ValueService } from '../../core/services/value.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
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
  private readonly guided = inject(GuidedService);
  private readonly codelistSvc = inject(CodelistService);
  private readonly toast = inject(ToastService);

  protected readonly clFilter = signal('');

  /** Betrachtungsmodus: Editier-Controls werden im Template ausgeblendet. */
  protected readonly ro = this.state.readOnly;

  /** Nachrichten-Modus: eine Instanz wird erstellt oder bearbeitet (Werte statt Profil). */
  protected readonly msgMode = this.state.msgMode;

  /** Gefuehrte Testnachricht-Erstellung (US "Testnachricht gefuehrt erstellen"). */
  protected readonly isCreate = this.state.isMessageCreate;

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

    // Blatt-Eigenschaft des ausgewaehlten Items (Ausprägung: ihr Kontext-Knoten).
    const leaf = isAusp
      ? this.tree.isLeaf(this.tree.ctxNode(it.parentNode, it.ausp.id))
      : this.tree.isLeaf(n);

    // Codeliste.
    let codelist: null | {
      nameLang: string;
      kennung: string;
      geladen: boolean;
      version: string | null;
      eff: { value: string; label: string; checked: boolean; belegt: boolean; search: string }[] | null;
      restricted: boolean;
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
      const belegterCode = p.beispiel ?? '';
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
              belegt: !!belegterCode && w.value === belegterCode,
              search: (w.value + ' ' + w.label).toLowerCase(),
            }))
          : null,
        restricted: !!p.werte,
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
      leaf,
      codelist,
      ref,
      anmerkung: p.anmerkung ?? '',
      beispiel: p.beispiel ?? '',
      // Klartext hinter dem belegten Code (Story 4) — null, wenn kein Code-Feld
      // oder Liste (noch) nicht geladen.
      beispielLabel: n.codelist ? this.values.labelFor(n.codelist, p.beispiel) : null,
      // Typwidrige Beispielwerte sichtbar machen (Pattern-/Builtin-/Codelisten-Pruefung).
      beispielProblem: p.beispiel
        ? this.values.wertProblem(
            { name: n.name, path, typeName: n.typeName, codelist: n.codelist },
            p.beispiel,
          )
        : null,
      curStatusName: st?.name ?? 'wie Standard',
    };
  });

  /**
   * Gefuehrte Entscheidung (US "Profilierung gefuehrt erstellen"): Dispositions-
   * Buttons an der Wirkung, Auswahl-Schritt fuer choice-Gruppen, wiederverwendbare
   * Freitexte und Spur-Navigation. Nur im gefuehrten Modus (nicht read-only).
   */
  protected readonly gv = computed(() => {
    if (!this.state.guided() || this.state.readOnly()) return null;
    if (this.guided.instanzModus()) return null; // Instanz-Fuehrung uebernimmt giv()
    const it = this.state.selItem();
    if (!it) return null;
    const path = itemPath(it);
    const cur = this.state.elemente()[path]?.status ?? null;

    // Drei feste Dispositionen, an die Wirkung gebunden (Fallback: disabled,
    // wenn die Profilierung keine Stufe mit passender Wirkung konfiguriert hat).
    const dispo = [
      { st: this.state.pflichtStatus(), fallback: 'zwingend' },
      { st: this.state.optionalStatus(), fallback: 'anzugeben, wenn vorhanden' },
      { st: this.state.exclStatus(), fallback: 'nicht verwendet' },
    ].map((d) => ({
      id: d.st?.id ?? '',
      label: d.st?.name ?? d.fallback,
      farbe: d.st?.farbe ?? 'var(--muted)',
      active: !!d.st && cur === d.st.id,
      disabled: !d.st,
    }));

    // Auswahl-Schritt: zulaessige Alternativen einschraenken — sowohl fuer
    // synthetische choice-Gruppen als auch fuer den XJustiz-Normalfall
    // benannter auswahl_*-Elemente (Element mit choice-Inhalt; model steht
    // erst nach expandNode fest).
    let isChoice = false;
    let synthChoice = false;
    let zweige: { path: string; label: string; zulaessig: boolean }[] | null = null;
    let minChoice = '1';
    if (it.kind === 'el' && !it.node.recursive && !this.tree.isLeaf(it.node)) {
      this.tree.expandNode(it.node);
      isChoice = it.node.model === 'choice';
      synthChoice = isChoice && it.node.synthetic;
      if (isChoice) {
        minChoice = it.node.min;
        zweige = (it.node.children ?? []).map((c) => ({
          path: c.path,
          label: c.synthetic ? c.name : pretty(c.name),
          zulaessig: this.state.wirkungOf(c.path) !== 'ausgeschlossen',
        }));
      }
    }

    const offene = this.guided.offeneSet();
    const anm = this.state.elemente()[path]?.anmerkung?.trim() ?? '';
    return {
      path,
      offen: offene.has(path),
      nOffen: offene.size,
      dispo,
      isChoice,
      synthChoice,
      minChoice,
      zweige,
      bestaetigt: isChoice ? this.guided.istEntschieden(path) : false,
      // Eigenen aktuellen Text nicht als Vorschlag anbieten.
      vorschlaege: this.guided.anmerkungVorschlaege().filter((t) => t !== anm),
    };
  });

  /**
   * Gefuehrte Instanz-Entscheidung (US "Testnachricht gefuehrt erstellen"):
   * aufnehmen/weglassen fuer Optionales, genau EIN Zweig je Auswahl,
   * Pflichtwert-Hinweis fuer Blaetter und die Spur-Navigation.
   */
  protected readonly giv = computed(() => {
    if (!this.state.guided() || this.state.readOnly()) return null;
    if (!this.state.messageCreate()) return null;
    const it = this.state.selItem();
    if (!it) return null;
    const path = itemPath(it);
    const punkt = this.guided.punktAt(path);
    const offene = this.guided.offeneSet();
    const w = this.state.wirkungOf(path);

    // Zweige des Auswahl-Schritts (Entweder-oder).
    let zweige: { path: string; label: string; gewaehlt: boolean }[] | null = null;
    if (punkt?.art === 'auswahl') {
      const node = it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
      this.tree.expandNode(node);
      zweige = (node.children ?? []).map((c) => ({
        path: c.path,
        label: c.synthetic ? c.name : pretty(c.name),
        gewaehlt: this.state.wirkungOf(c.path) === 'pflicht',
      }));
    }

    const wertOffen =
      (punkt?.art === 'wert' ||
        ((punkt?.art === 'element' || punkt?.art === 'auspraegung') && punkt.leaf && w === 'pflicht')) &&
      !this.guided.wertOk(path);

    return {
      art: punkt?.art ?? null,
      istPunkt: !!punkt,
      offen: offene.has(path),
      nOffen: offene.size,
      aufgenommen: w === 'pflicht',
      weggelassen: w === 'ausgeschlossen',
      entfaellt: !w && this.state.inheritedExcluded(path),
      zweige,
      wertOffen,
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
    // Kein `werte`-Feld = keine Einschraenkung = alle zugelassen; ein leeres
    // Array (nach „keine") ist dagegen der Startpunkt fuer Einzel-Zulassungen.
    const cur = p.werte ? new Set(p.werte) : new Set(all);
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

  // ── Gefuehrte Entscheidung ──────────────────────────────────────────

  protected onZweig(childPath: string, e: Event): void {
    this.guided.setzeZweig(this.path(), childPath, (e.target as HTMLInputElement).checked);
  }

  // ── Gefuehrte Instanz-Entscheidung (Testnachricht erstellen) ────────

  /** aufnehmen (true) / weglassen (false); erneuter Klick nimmt die Entscheidung zurueck. */
  protected aufnahme(auf: boolean): void {
    const w = this.state.wirkungOf(this.path());
    const aktiv = auf ? w === 'pflicht' : w === 'ausgeschlossen';
    this.guided.setzeAufnahme(this.path(), aktiv ? null : auf);
  }

  /** Instanz-Auswahl: genau einen Zweig waehlen. */
  protected waehleZweig(zweigPath: string): void {
    this.guided.waehleZweig(this.path(), zweigPath);
  }

  /** Wuerfel-Button: typkonformen Dummy-Wert in das aktuelle Blatt setzen. */
  protected wuerfeln(): void {
    const it = this.state.selItem();
    if (!it) return;
    const n = it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
    const path = this.path();
    this.state.setElementProfile(path, {
      beispiel: this.values.dummyFor({ name: n.name, path, typeName: n.typeName, codelist: n.codelist }),
    });
  }

  /** Nachrichten-Modus: Codelisten-Wert per Klick als Blattwert uebernehmen. */
  protected setWertAusListe(value: string): void {
    this.state.setElementProfile(this.path(), { beispiel: value });
  }

  /**
   * Weiteres Vorkommen eines wiederholbaren Elements (Nachrichten-Modus):
   * erster Klick fuehrt den generischen Unterbaum als "Fall 1" weiter und legt
   * ein leeres zweites Vorkommen an (duplicateElement); danach je Klick eines.
   */
  protected addVorkommen(): void {
    const list = this.state.auspsOf(this.path());
    if (!list?.length) this.state.duplicateElement(this.path());
    else this.state.addAusp(this.path(), 'Vorkommen ' + (list.length + 1));
  }

  /** Vorkommen samt erfasster Werte kopieren (Kopie danach anpassen). */
  protected copyVorkommen(id: string): void {
    this.state.copyAusp(this.path(), id);
  }

  protected bestaetigeAuswahl(): void {
    this.guided.bestaetigeAuswahl(this.path());
  }

  /** Wiederverwendbaren Freitext in die Anmerkung des aktuellen Elements uebernehmen. */
  protected uebernehmeAnmerkung(text: string): void {
    this.state.setElementProfile(this.path(), { anmerkung: text });
  }

  protected guidedPrev(): void {
    this.guided.gotoPrev();
  }

  protected guidedNext(): void {
    this.guided.gotoNext();
  }

  protected guidedNextOpen(): void {
    this.guided.gotoNextOpen();
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
