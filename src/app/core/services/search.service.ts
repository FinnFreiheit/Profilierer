import { Injectable, computed, inject } from '@angular/core';
import { TreeItem, itemPath } from '../../models/node.model';
import { MessageRef } from '../../models/xsd-index.model';
import { pretty } from '../util/pretty.util';
import { DatentypEintrag, suchTypen } from '../util/datentyp.util';
import { TreeService } from './tree.service';
import { StateService } from './state.service';

export interface SearchEntry {
  path: string;
  label: string;
  tech: string;
  doc: string;
  /** Belegter Testwert (importierter Inhalt), damit die Suche auch nach Inhalten trifft. */
  value: string;
  crumb: string;
}

/** Das Ergebnis der zentralen Suche, nach Treffer-Art getrennt. */
export interface ZentralTreffer {
  baum: SearchEntry[];
  nachrichten: MessageRef[];
  typen: DatentypEintrag[];
}

/** Trefferzahl je Katalog-Sektion — der Baum behaelt seine 40 aus dem Bestand. */
const KATALOG_LIMIT = 10;

/**
 * Suche im Baum (Profilierer.html Z.694-742). Der Index traversiert den Baum
 * und erfasst zusaetzlich die belegten Werte (Inhaltssuche). runSearch rankt
 * Praefix-Treffer vor Teilstring-Treffern.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly tree = inject(TreeService);
  private readonly state = inject(StateService);

  /**
   * buildSearchIndex (Z.695-711), memoisiert: re-evaluiert nur, wenn sich Baum
   * (`root`), Ausprägungen oder Element-Profile (Werte) aendern — nicht pro
   * Tastendruck.
   */
  readonly index = computed<SearchEntry[]>(() => {
    const elemente = this.state.elemente();
    const out: SearchEntry[] = [];
    const rec = (it: TreeItem, depth: number, crumb: string): void => {
      if (depth > 20 || out.length > 8000) return;
      for (const c of this.tree.childItems(it)) {
        const path = itemPath(c);
        const label = c.kind === 'ausp' ? c.ausp.name : pretty(c.node.name);
        out.push({
          path,
          label,
          tech: c.kind === 'el' ? c.node.name : '',
          doc: c.kind === 'el' ? (c.node.doc || '').split('\n')[0]! : '',
          value: elemente[path]?.beispiel ?? '',
          crumb,
        });
        if (c.kind === 'el' && c.node.recursive) continue;
        rec(c, depth + 1, crumb ? crumb + ' › ' + label : label);
      }
    };
    // auspraegungen() lesen, damit der computed auf Ausprägungs-Änderungen reagiert
    // (ctxNode-Kinder haengen davon ab).
    this.state.auspraegungen();
    const root = this.tree.rootItem();
    if (root) rec(root, 0, '');
    return out;
  });

  /** buildSearchIndex (Z.695-711) — direkter Aufbau ohne Memo (Tests/Sonderfaelle). */
  buildIndex(): SearchEntry[] {
    return this.index();
  }

  /** runSearch (Z.712-724): rankt und begrenzt auf 40 Treffer, inkl. Inhaltssuche. */
  run(query: string): SearchEntry[] {
    const q = query.trim().toLowerCase();
    if (!q || !this.state.root()) return [];
    const idx = this.index();
    const starts: SearchEntry[] = [];
    const contains: SearchEntry[] = [];
    for (const e of idx) {
      const hay = (e.label + ' ' + e.tech).toLowerCase();
      if (hay.split(/[\s:›]+/).some((w) => w.startsWith(q))) starts.push(e);
      else if (
        hay.includes(q) ||
        e.doc.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q)
      )
        contains.push(e);
      if (starts.length > 40) break;
    }
    return [...starts, ...contains].slice(0, 40);
  }

  /**
   * Der Datentyp-Katalog des geladenen Schemas, memoisiert — er haengt allein
   * am Index und darf nicht pro Tastendruck neu aus ~1000 Typen entstehen.
   */
  private readonly typKatalog = computed<DatentypEintrag[]>(() => suchTypen(this.state.idx()));

  /**
   * **Zentrale Suche**: derselbe Begriff gegen den geladenen Baum, die
   * waehlbaren Nachrichten und den Datentyp-Katalog. Anders als `run` braucht
   * sie keinen Baum — gesucht wird, sobald ein Schema geladen ist.
   */
  runZentral(query: string): ZentralTreffer {
    const q = query.trim().toLowerCase();
    if (!q) return { baum: [], nachrichten: [], typen: [] };
    return {
      baum: this.run(query),
      nachrichten: this.sucheNachrichten(q),
      typen: this.sucheTypen(q),
    };
  }

  /** Nachrichten ueber Name und Beschreibung; Praefix-Treffer zuerst. */
  private sucheNachrichten(q: string): MessageRef[] {
    const idx = this.state.idx();
    if (!idx) return [];
    const starts: MessageRef[] = [];
    const contains: MessageRef[] = [];
    for (const m of idx.messages) {
      const name = m.name.toLowerCase();
      if (name.split('.').some((w) => w.startsWith(q))) starts.push(m);
      else if (name.includes(q) || m.doc.toLowerCase().includes(q)) contains.push(m);
      if (starts.length >= KATALOG_LIMIT) break;
    }
    return [...starts, ...contains].slice(0, KATALOG_LIMIT);
  }

  /** Datentypen ueber Typname und Klartext; Segment-Praefixe zuerst. */
  private sucheTypen(q: string): DatentypEintrag[] {
    const starts: DatentypEintrag[] = [];
    const contains: DatentypEintrag[] = [];
    for (const e of this.typKatalog()) {
      const label = e.label.toLowerCase();
      if (label.split('.').some((w) => w.startsWith(q))) starts.push(e);
      else if (label.includes(q) || e.info.toLowerCase().includes(q)) contains.push(e);
      if (starts.length >= KATALOG_LIMIT) break;
    }
    return [...starts, ...contains].slice(0, KATALOG_LIMIT);
  }
}
