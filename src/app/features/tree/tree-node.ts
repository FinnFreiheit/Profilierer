import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TreeItem, TreeNode as TNode, itemPath } from '../../models/node.model';
import { StateService } from '../../core/services/state.service';
import { TreeService } from '../../core/services/tree.service';
import { ErweiterungDialogService } from '../../core/services/erweiterung-dialog.service';
import { NavService } from '../../core/services/nav.service';
import { GuidedService } from '../../core/services/guided.service';
import { ValueService } from '../../core/services/value.service';
import { ToastService } from '../../core/services/toast.service';
import { BaumkastenAnsicht, Kennzeichen } from '../../core/ansicht/baumkasten-ansicht';
import { UeberlagerungService } from '../../core/services/ueberlagerung.service';
import { Wertbilanz, Wertblatt } from '../../models/ueberlagerung.model';
import { erwLoeschFrage } from '../../core/util/erweiterung.util';
import { KeinAutofillDirective } from '../../shared/kein-autofill.directive';
import { TreeContextMenu } from './tree-context-menu';

/**
 * Ein Kasten im Baum inkl. seiner offenen Kinder (rekursiv). Deklarative
 * Portierung von renderBox (Z.1207-1391) und buildSub (Z.1080-1117).
 *
 * Das Host-Element traegt die Klasse `ntree` und enthaelt direkt `.box` und
 * optional `.nkids` — genau die DOM-Struktur, die der TreeCanvas fuer die
 * SVG-Verbindungs- und Verweislinien per Geometrie vermisst.
 */
@Component({
  selector: 'app-tree-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ntree' },
  imports: [TreeNode, TreeContextMenu, KeinAutofillDirective],
  templateUrl: './tree-node.html',
})
export class TreeNode {
  readonly item = input.required<TreeItem>();

  /** Stabiler Key fuer @for. */
  protected keyOf(it: TreeItem): string {
    return itemPath(it);
  }

  protected onTag(t: Kennzeichen, e: Event): void {
    if (t.ref) this.onRefTag(e);
  }

  /** Die Anzeige-Ableitung; die Komponente rendert sie nur. */
  private readonly ansicht = inject(BaumkastenAnsicht);
  // Die uebrigen Abhaengigkeiten tragen ausschliesslich die Aktionen.
  private readonly state = inject(StateService);
  private readonly tree = inject(TreeService);
  private readonly erwDialog = inject(ErweiterungDialogService);
  private readonly nav = inject(NavService);
  private readonly guided = inject(GuidedService);
  private readonly values = inject(ValueService);
  private readonly toast = inject(ToastService);
  private readonly ueberlagerung = inject(UeberlagerungService);

  /** Der fuer Aktionen massgebliche Knoten (Element bzw. Traeger des Vorkommens). */
  private readonly node = computed<TNode>(() => {
    const it = this.item();
    return it.kind === 'el' ? it.node : it.parentNode;
  });

  protected readonly path = computed(() => itemPath(this.item()));

  protected readonly hasNext = computed(() => this.tree.itemHasKids(this.item()));
  protected readonly isOpen = computed(() => this.state.isOpen(this.path()));
  /** Nachrichten-Modus (Instanz statt Profil): steuert die Beschriftungen. */
  protected readonly msgMode = this.state.msgMode;

  // ── Anzeige: alles aus dem Ansichts-Modul ───────────────────────────
  // Je ein computed statt eines Sammelobjekts, damit ein Tastendruck im
  // Wertfeld nicht auch Kinderliste und Kennzeichen neu ableitet.

  /** Das komplette Anzeige-Modell des Kastens (renderBox). */
  protected readonly vm = computed(() => this.ansicht.kasten(this.item()));
  protected readonly children = computed(() => this.ansicht.kinder(this.item()));
  protected readonly attribute = computed(() => this.ansicht.attribute(this.item()));
  protected readonly phantoms = computed(() => this.ansicht.phantome(this.item()));
  protected readonly showAddAusp = computed(() => this.ansicht.zeigtVorkommenHinzu(this.item()));
  protected readonly addAuspSperre = computed(() => this.ansicht.vorkommenHinzuSperre(this.item()));
  protected readonly showAddErweiterung = computed(() =>
    this.ansicht.zeigtErweiterungHinzu(this.item()),
  );

  // ── Nachrichten-Ueberlagerung (#147) ────────────────────────────────

  /**
   * Die Wert-Kaesten der ueberlagerten Testnachrichten — je Nachricht einer,
   * unterhalb des Blattes. Leer, solange keine Ueberlagerung laeuft und an
   * jedem Blatt, an dem keine gewaehlte Nachricht etwas sagt.
   */
  protected readonly wertblaetter = computed<Wertblatt[]>(() =>
    this.vm().isValueBox ? this.ueberlagerung.blaetter(this.path(), this.node().codelist) : [],
  );

  /** Kurzfassung am Blatt selbst ("3 von 4 · 2 Werte"). */
  protected readonly bilanz = computed<Wertbilanz | null>(() =>
    this.wertblaetter().length ? this.ueberlagerung.bilanz(this.path()) : null,
  );

  /** Beschriftung der Kurzfassung. */
  protected bilanzText(b: Wertbilanz): string {
    const belegt = b.belegt === b.gesamt ? `${b.gesamt}×` : `${b.belegt} von ${b.gesamt}`;
    return b.verschieden > 1 ? `${belegt} · ${b.verschieden} Werte` : belegt;
  }

  protected bilanzTitel(b: Wertbilanz): string {
    const teile = [
      b.belegt === b.gesamt
        ? `Alle ${b.gesamt} Nachrichten haben hier eine Angabe`
        : `${b.belegt} von ${b.gesamt} Nachrichten haben hier eine Angabe`,
      b.verschieden > 1 ? `${b.verschieden} verschiedene Werte` : 'derselbe Wert',
    ];
    return teile.join(' · ');
  }

  /** Tooltip eines Wert-Kastens: Nachricht, Wert, Bedeutung. */
  protected wertTitel(w: Wertblatt): string {
    if (!w.wert) return `${w.name}: keine Angabe an dieser Stelle`;
    return [w.name, w.label ? `${w.wert} · ${w.label}` : w.wert].join(': ');
  }

  // ── Aktionen ────────────────────────────────────────────────────────

  protected onSelect(): void {
    const it = this.item();
    this.state.selItem.set(it);
    if (this.tree.itemHasKids(it)) this.state.setOpen(this.path(), true);
  }

  protected onToggle(e: Event): void {
    e.stopPropagation();
    this.state.toggleOpen(this.path());
  }

  protected onValue(e: Event): void {
    const input = e.target as HTMLInputElement;
    const v = input.value.trim();
    // Nachrichten-Modus: die Werte-Einschraenkung der Profilierung ist hart —
    // ein nicht freigegebener Wert wird nicht uebernommen (Spec "Codelisten
    // hart einschraenken"). Beim Profilieren bleibt der Beispielwert frei.
    const verstoss = this.state.msgMode() ? this.values.werteVerstoss(this.path(), v) : null;
    if (verstoss) {
      this.toast.show(verstoss + ' Zulässig sind nur die Werte aus der Liste.');
      input.value = this.state.elemente()[this.path()]?.beispiel ?? '';
      return;
    }
    this.state.setElementProfile(this.path(), { beispiel: v || undefined });
  }

  protected stop(e: Event): void {
    e.stopPropagation();
  }

  protected onValueKeydown(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  protected onHide(e: Event): void {
    e.stopPropagation();
    const ex = this.state.exclStatus();
    if (!ex) {
      this.toast.show('Kein Status mit Wirkung „ausgeschlossen" konfiguriert (siehe „Status…").');
      return;
    }
    const isExcl = this.vm().hideIsExcl;
    // Wie bei „+ Vorkommen": die Sperre haengt nicht allein an der Darstellung.
    if (!isExcl && this.meldeSperre(this.guided.kardSperreWeglassen(this.path()))) return;
    this.state.setElementProfile(this.path(), { status: isExcl ? undefined : ex.id });
  }

  protected onDup(e: Event): void {
    e.stopPropagation();
    if (this.meldeSperre(this.guided.kardSperreHinzu(this.node().path))) return;
    const it = this.item();
    if (it.kind === 'ausp') this.state.copyAusp(it.parentNode.path, it.ausp.id);
    else this.state.duplicateElement(this.path());
  }

  protected onDelAusp(e: Event): void {
    e.stopPropagation();
    const it = this.item();
    if (it.kind !== 'ausp') return;
    // Zwei Sperren, zwei Gruende: die Anzahl (Mindestanzahl der Profilierung)
    // und die Identitaet dieses Vorkommens (zwingend gesetzt, #28).
    if (
      this.meldeSperre(
        this.guided.auspSperreEntfernen(it.parentNode.path, it.ausp.id) ??
          this.guided.kardSperreEntfernen(it.parentNode.path),
      )
    )
      return;
    const frage = this.state.msgMode()
      ? 'Vorkommen „' + it.ausp.name + '" samt Werten löschen?'
      : 'Ausprägung „' + it.ausp.name + '" samt Unter-Profilierung löschen?';
    if (confirm(frage)) this.state.removeAusp(it.parentNode.path, it.ausp.id);
  }

  protected onAddAusp(): void {
    const it = this.item();
    if (it.kind !== 'el') return;
    if (this.meldeSperre(this.guided.kardSperreHinzu(it.node.path))) return;
    // Gebundener Durchlauf mit profilierten Auspraegungen: kein leeres Vorkommen,
    // sondern die Kopie einer profilierten Auspraegung (#28). Gibt es nur eine,
    // ist die Wahl eindeutig; sonst faellt sie im Detailbereich, wo jede Quelle
    // ihren Knopf hat.
    const kandidaten = this.guided.auspKopieKandidaten(it.node.path);
    if (kandidaten) {
      if (kandidaten.length === 1) {
        this.state.copyAusp(it.node.path, kandidaten[0]!.id);
        return;
      }
      this.state.selItem.set(it);
      this.toast.show('Bitte im Detailbereich wählen, welche Ausprägung kopiert wird.');
      return;
    }
    this.state.addAusp(it.node.path);
  }

  /**
   * Gesperrte Kardinalitaet begruenden statt sie stillschweigend zu ignorieren
   * (Issue #27). true = gesperrt, der Aufrufer bricht ab.
   */
  private meldeSperre(grund: string | null): boolean {
    if (!grund) return false;
    this.toast.show(grund);
    return true;
  }

  /** Oeffnet den Erweiterungs-Dialog fuer ein neues Element unter diesem Knoten. */
  protected onAddErweiterung(): void {
    const it = this.item();
    const parent = it.kind === 'el' ? it.node : this.tree.ctxNode(it.parentNode, it.ausp.id);
    const namen = this.tree
      .kinder(parent)
      .filter((c) => !c.synthetic)
      .map((c) => c.name);
    this.erwDialog.oeffneNeu(this.path(), namen);
  }

  /** Loescht eine Schema-Erweiterung samt Unter-Profilierung. */
  protected onDelErw(e: Event): void {
    e.stopPropagation();
    const n = this.node();
    if (!n.erweiterung) return;
    // Der **letzte** '/~': bei verschachtelten Erweiterungen liegt der
    // Elternpfad vor der innersten, nicht vor der aeussersten.
    const i = n.path.lastIndexOf('/~');
    if (i < 0) return;
    if (confirm(erwLoeschFrage(n.erweiterung.name, this.state.festlegungenUnter(n.path))))
      this.state.removeErweiterung(n.path.slice(0, i), n.erweiterung.id);
  }

  // ── Kontextmenue: Teilbaum aus-/einklappen (Rechtsklick) ────────────

  /** Offenes Kontextmenue dieses Kastens (Mausposition), sonst null. */
  protected readonly menu = signal<{ x: number; y: number } | null>(null);

  /**
   * Rechtsklick auf den Kasten: Menue nur an aufklappbaren Knoten — auf
   * Blaettern kein preventDefault, dort bleibt das native Browser-Menue.
   * Selektiert nicht (Auswahl und Detailpanel bleiben unveraendert).
   */
  protected onContextMenu(e: MouseEvent): void {
    if (!this.tree.itemHasKids(this.item())) return;
    e.preventDefault();
    this.menu.set({ x: e.clientX, y: e.clientY });
  }

  protected onMenuAusklappen(): void {
    this.menu.set(null);
    if (!this.nav.expandSubtree(this.item()))
      this.toast.show('Teilbaum zu groß — nur teilweise ausgeklappt');
  }

  protected onMenuEinklappen(): void {
    this.menu.set(null);
    this.state.closeSubtree(this.path());
  }

  /** Sprung zum festgelegten Verweisziel (wie refJump im Detailpanel). */
  protected onRefTag(e: Event): void {
    e.stopPropagation();
    const ziel = this.state.elemente()[this.path()]?.refZiel;
    if (ziel) this.nav.jumpTo(ziel);
    else this.toast.show('Kein Verweisziel festgelegt — Ziel im Detailbereich wählen.');
  }
}
