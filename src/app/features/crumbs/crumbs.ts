import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { NavService } from '../../core/services/nav.service';
import { TreeItem, itemPath } from '../../models/node.model';
import { pretty } from '../../core/util/pretty.util';

/**
 * Pfadleiste (renderCrumbs, Profilierer.html Z.243, 777-792): klickbare Kette
 * Wurzel → ausgewaehltes Element.
 */
@Component({
  selector: 'app-crumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crumbs.html',
})
export class Crumbs {
  private readonly state = inject(StateService);
  private readonly nav = inject(NavService);

  protected readonly chain = computed<TreeItem[]>(() => {
    const sel = this.state.selItem();
    if (!this.state.root() || !sel) return [];
    return this.nav.findChainByPath(itemPath(sel));
  });

  protected keyOf(it: TreeItem): string {
    return itemPath(it);
  }

  protected label(it: TreeItem): string {
    return it.kind === 'ausp' ? it.ausp.name : pretty(it.node.name);
  }

  protected titleOf(it: TreeItem): string {
    return it.kind === 'el' ? it.node.name : 'Ausprägung';
  }

  protected pick(it: TreeItem): void {
    this.nav.selectItem(it);
  }
}
