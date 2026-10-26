import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnlageEntry, EinbindungEntry } from '../../models/testmessage.model';
import {
  AnlagenQuelle,
  Befund,
  GeplanteDatei,
  Platz,
  SendungsDatei,
  dateienPlanen,
  plaetzeLesen,
  pruefen,
  zaehle,
} from '../../../../server/sendung/pruefung.js';
import { StateService } from './state.service';
import { ExportService } from './export.service';
import { AnlagenStoreService } from './anlagen-store.service';
import { BackendClient } from './backend-client.service';
import { TestmessageAutosaveService } from './testmessage-autosave.service';
import { DownloadService } from './download.service';
import { ToastService } from './toast.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { TestmessageEditService } from './testmessage-edit.service';
import { blattName } from '../util/pfad.util';

/** Ein Dokument des SGO mit seinen Plaetzen (Gliederung der Ansicht). */
export interface SendungsDokument {
  schluessel: string;
  titel: string;
  plaetze: SendungsPlatz[];
}

/** Ein Platz, wie die Ansicht ihn zeigt: was die XML sagt, was darauf liegt. */
export interface SendungsPlatz {
  platz: Platz;
  /** Geplante Datei (Quelle) oder null = leer. */
  datei: GeplanteDatei | null;
  /** Hochgeladene Anlage unter diesem Namen (auch, wenn sie nicht gewinnt). */
  anlage: AnlageEntry | null;
  /** Eingebundene Testnachricht auf diesem Platz (auch, wenn sie geloescht ist). */
  einbindung: EinbindungEntry | null;
  befunde: Befund[];
  /** Plaetze der eingebundenen Nachricht (nur lesend, rekursiv vom Server). */
  unter: { platz: Platz; quelle: AnlagenQuelle | null; befunde: Befund[] }[];
}

/** Plan einer eingebundenen Nachricht, wie ihn `/sendung/pruefung` liefert. */
interface UnterPlan {
  plaetze: Platz[];
  dateien: { dateiname: string; quelle: AnlagenQuelle }[];
  befunde: Befund[];
}

/** Rueckweg nach "Neue Testnachricht anlegen" aus der Sendung heraus. */
export interface Ruecksprung {
  quelleId: string;
  quelleName: string;
  dateiname: string;
}

/** Ergebnis einer Mehrfach-Ablage (S8): was lag, was keinen Platz fand. */
export interface AblageErgebnis {
  abgelegt: string[];
  /** Ohne passenden Platz — als Datei behalten, damit die Ansicht sie anbieten kann. */
  ohnePlatz: File[];
  /** Nicht ersetzt, weil die Rueckfrage verneint wurde. */
  uebersprungen: string[];
}

/** Namenskonvention eingebundener XJustiz-Nachrichten (Doku zu `dateiname`). */
const EINGEBUNDEN = /^xjustiz_nachricht_[0-9A-Za-z_-]+\.xml$/;
/** Platzhalter statt echter UUID (`xjustiz_nachricht_UUID.xml`). */
const UUID_WOERTLICH = /(^|[_.-])UUID([_.-]|$)/;

/**
 * Die **Testsendung** der offenen Testnachricht (ADR 0024) — Zustand und
 * Aktionen der Ansicht „Sendung". Die Plaetze kommen live aus der angezeigten
 * XML (dieselbe Quelle wie die XML-Ansicht), Anlagen und Einbindungen vom
 * Server; Plan und Befunde rechnet dasselbe Modul wie der Export
 * (`server/sendung/pruefung.js`). Eingebundene Nachrichten steuern ihren Plan
 * vom Server bei (rekursiv, flach). Den ZIP baut der Server — vorher wird der
 * Autosave geleert, damit er dieselbe XML hat, die die Ansicht zeigt.
 */
@Injectable({ providedIn: 'root' })
export class SendungService {
  private readonly state = inject(StateService);
  private readonly exporter = inject(ExportService);
  private readonly store = inject(AnlagenStoreService);
  private readonly http = inject(BackendClient).fuer('Sendung-Backend');
  private readonly dl = inject(DownloadService);
  private readonly toast = inject(ToastService);
  /**
   * Lazy geholt: Testdaten-Index, Autosave und Edit-Service laden bzw. sichern
   * beim Erzeugen selbst — der Detailbereich (Anlagen-Karte) soll sie nicht
   * schon dadurch anstossen, dass er die Sendung kennt.
   */
  private readonly injector = inject(Injector);
  private get testdaten(): TestmessageStoreService {
    return this.injector.get(TestmessageStoreService);
  }
  private get autosave(): TestmessageAutosaveService {
    return this.injector.get(TestmessageAutosaveService);
  }

  /** Testspeicher-Eintrag der offenen Nachricht (null = keine gespeicherte). */
  readonly entryId = computed(
    () => this.state.messageEdit()?.entryId ?? this.state.messageCreate()?.entryId ?? null,
  );

  /** Gibt es eine Sendung zu zeigen? (gespeicherte Testnachricht, kein Typ) */
  readonly moeglich = computed(() => !!this.entryId() && !this.state.istTypAnsicht());

  /** Index-Zeile der offenen Nachricht (Freigabe-Stand, S9). */
  readonly eintrag = computed(() => {
    const id = this.entryId();
    return id ? (this.testdaten.entries().find((e) => e.id === id) ?? null) : null;
  });

  /** Anlagen duerfen nur im Bearbeiten-Modus geaendert werden. */
  readonly aenderbar = computed(() => !this.state.readOnly());

  readonly anlagen = signal<AnlageEntry[]>([]);
  readonly einbindungen = signal<EinbindungEntry[]>([]);
  /** Plaene der eingebundenen Nachrichten je Dateiname des Platzes. */
  private readonly unterPlaene = signal<ReadonlyMap<string, UnterPlan>>(new Map());
  /** Laufende Upload-/Loesch-Aktion je Dateiname (Knopf gesperrt). */
  readonly beschaeftigt = signal<ReadonlySet<string>>(new Set());
  /** Angefordertes "Neue Testnachricht anlegen" — die Testdaten-Seite oeffnet den Dialog. */
  readonly anlegenAngefordert = signal(false);
  /** Laufender Rueckweg nach dem Anlegen (null = keiner). */
  readonly ruecksprung = signal<Ruecksprung | null>(null);

  /** Die live angezeigte XML samt Zeile→Pfad (null = keine Sendung). */
  readonly xml = computed(() =>
    this.moeglich() ? this.exporter.buildBeispielXmlMitPfaden({ instanz: true }) : null,
  );

  /** Plaetze aus der live angezeigten XML. */
  readonly plaetze = computed<Platz[]>(() => {
    const xml = this.xml()?.xml;
    if (!xml) return [];
    return plaetzeLesen(new DOMParser().parseFromString(xml, 'application/xml'));
  });

  private readonly lebendeEinbindungen = computed(
    () =>
      new Set(
        this.einbindungen()
          .filter((e) => e.vorhanden)
          .map((e) => e.dateiname),
      ),
  );

  readonly dateien = computed(() =>
    dateienPlanen(
      this.plaetze(),
      new Set(this.anlagen().map((a) => a.dateiname)),
      this.lebendeEinbindungen(),
    ),
  );

  /** Anlagen und Einbindungen, deren Namen die XML nicht (mehr) nennt. */
  readonly ohnePlatz = computed(() => {
    const namen = new Set(this.plaetze().map((p) => p.dateiname));
    return {
      anlagen: this.anlagen().filter((a) => !namen.has(a.dateiname)),
      einbindungen: this.einbindungen().filter((e) => !namen.has(e.dateiname)),
    };
  });

  /** Plaetze und Dateien der eingebundenen Nachrichten, die gerade gelten. */
  private readonly unten = computed(() => {
    const belegt = new Set(
      this.dateien()
        .filter((d) => d.quelle === 'testnachricht')
        .map((d) => d.dateiname),
    );
    const plaetze: Platz[] = [];
    const dateien: SendungsDatei[] = [];
    for (const [name, plan] of this.unterPlaene()) {
      if (!belegt.has(name)) continue;
      plaetze.push(...plan.plaetze);
      dateien.push(...plan.dateien.map((d) => ({ dateiname: d.dateiname, quelle: d.quelle })));
    }
    return { plaetze, dateien };
  });

  readonly befunde = computed<Befund[]>(() => {
    const ohne = this.ohnePlatz();
    const dateien: SendungsDatei[] = [
      ...this.dateien(),
      ...this.unten().dateien,
      ...ohne.anlagen.map((a) => ({ dateiname: a.dateiname, quelle: 'upload' as const })),
      ...ohne.einbindungen
        .filter((e) => e.vorhanden)
        .map((e) => ({ dateiname: e.dateiname, quelle: 'testnachricht' as const })),
    ];
    const geloescht: Befund[] = this.einbindungen()
      .filter((e) => !e.vorhanden)
      .map((e) => ({
        regel: 'einbindung-fehlt',
        schwere: 'fehler',
        dateiname: e.dateiname,
        text: 'Die eingebundene Testnachricht gibt es nicht mehr.',
      }));
    return [
      ...geloescht,
      ...pruefen({ plaetze: [...this.plaetze(), ...this.unten().plaetze], dateien }),
    ];
  });

  readonly zahlen = computed(() => zaehle(this.befunde()));

  /** Gliederung nach Dokument in Reihenfolge der XML. */
  readonly dokumente = computed<SendungsDokument[]>(() => {
    const dateien = new Map(this.dateien().map((d) => [d.dateiname, d]));
    const anlagen = new Map(this.anlagen().map((a) => [a.dateiname, a]));
    const einb = new Map(this.einbindungen().map((e) => [e.dateiname, e]));
    const befunde = this.befunde();
    const unterPlaene = this.unterPlaene();
    const out: SendungsDokument[] = [];
    const nachSchluessel = new Map<string, SendungsDokument>();
    this.plaetze().forEach((p, i) => {
      const d = p.dokument;
      const schluessel = d ? (d.id ?? `nr:${d.nummer ?? i}`) : '';
      let dok = nachSchluessel.get(schluessel);
      if (!dok) {
        dok = { schluessel, titel: dokumentTitel(p), plaetze: [] };
        nachSchluessel.set(schluessel, dok);
        out.push(dok);
      }
      const datei = dateien.get(p.dateiname) ?? null;
      const plan = datei?.quelle === 'testnachricht' ? unterPlaene.get(p.dateiname) : undefined;
      dok.plaetze.push({
        platz: p,
        datei,
        anlage: anlagen.get(p.dateiname) ?? null,
        einbindung: einb.get(p.dateiname) ?? null,
        befunde: befunde.filter((b) => b.dateiname === p.dateiname),
        unter: plan
          ? plan.plaetze.map((u) => ({
              platz: u,
              quelle: plan.dateien.find((x) => x.dateiname === u.dateiname)?.quelle ?? null,
              befunde: befunde.filter((b) => b.dateiname === u.dateiname),
            }))
          : [],
      });
    });
    return out;
  });

  /**
   * Pfad des `datei`-Elements im Modell → sein Platz (S7: Detailbereich und
   * Kennzeichen im Baum). Zugeordnet ueber den eingetragenen `dateiname`.
   */
  readonly lageNachPfad = computed(() => {
    const m = new Map<string, SendungsPlatz>();
    if (!this.moeglich()) return m;
    const nachName = new Map<string, SendungsPlatz>();
    for (const d of this.dokumente())
      for (const p of d.plaetze)
        if (!nachName.has(p.platz.dateiname)) nachName.set(p.platz.dateiname, p);
    for (const [k, v] of Object.entries(this.state.elemente())) {
      if (!k.endsWith('/dateiname')) continue;
      const datei = k.slice(0, -'/dateiname'.length);
      const sp = blattName(datei) === 'datei' ? nachName.get(v.beispiel?.trim() ?? '') : undefined;
      if (sp) m.set(datei, sp);
    }
    return m;
  });

  /** Platz zu einem gewaehlten Pfad: das `datei`-Element selbst oder eines seiner Blaetter. */
  platzAnPfad(pfad: string | null): SendungsPlatz | null {
    if (!pfad) return null;
    const m = this.lageNachPfad();
    return m.get(pfad) ?? m.get(pfad.slice(0, pfad.lastIndexOf('/'))) ?? null;
  }

  /**
   * Angeforderter Sprung in der Sendungs-Ansicht (Zaehler macht Wiederholungen
   * sichtbar). `auswahl`: dort gleich die Auswahl einer Testnachricht oeffnen.
   */
  readonly fokus = signal<{ dateiname: string; n: number; auswahl?: boolean } | null>(null);

  /** In die Sendungs-Ansicht wechseln und den Platz hervorheben. */
  zeige(dateiname: string, opts: { auswahl?: boolean } = {}): void {
    this.state.darstellung.set('sendung');
    this.fokus.set({ dateiname, n: (this.fokus()?.n ?? 0) + 1, auswahl: opts.auswahl });
  }

  constructor() {
    // Anlagen nachladen, sobald eine andere Nachricht offen ist.
    effect(() => {
      const id = this.entryId();
      untracked(() => {
        this.anlagen.set([]);
        this.einbindungen.set([]);
        this.unterPlaene.set(new Map());
        if (id) void this.neuLaden(id);
      });
    });

    // Rueckweg: die in der Sendung angeforderte neue Nachricht wird nach ihrem
    // ersten Speichern eingebunden. Bricht das Anlegen ab (Sitzung endet ohne
    // Eintrag), verfaellt der Rueckweg.
    let sitzungGesehen = false;
    effect(() => {
      const r = this.ruecksprung();
      const sitzung = this.state.messageCreate();
      if (!r) {
        sitzungGesehen = false;
        return;
      }
      if (sitzung) sitzungGesehen = true;
      else if (sitzungGesehen) {
        untracked(() => this.ruecksprung.set(null));
        return;
      }
      const neu = sitzung?.entryId;
      if (neu && neu !== r.quelleId) untracked(() => void this.einbindenNachAnlage(r, neu));
    });
  }

  private async neuLaden(id: string): Promise<void> {
    try {
      const [anlagen, einbindungen] = await Promise.all([
        this.store.liste(id),
        this.store.einbindungen(id),
      ]);
      if (this.entryId() !== id) return;
      this.anlagen.set(anlagen);
      this.einbindungen.set(einbindungen);
      // Zaehler der Kachel nachziehen — der Index wird sonst nur beim Start geladen.
      const n = anlagen.length + einbindungen.length;
      this.testdaten.entries.update((es) =>
        es.map((e) => (e.id === id ? { ...e, anlagen: n || undefined } : e)),
      );
      // "Geaendert seit Freigabe" rechnet der Server fachlich (S9) — nach einer
      // Aenderung an Anlagen den Index nachziehen, sonst laege der Hinweis falsch.
      if (this.eintrag()?.abgenommen) void this.testdaten.refresh().catch(() => undefined);
      await this.unterPlaeneLaden(id, einbindungen);
    } catch (e) {
      this.toast.showError(e, 'Anlagen nicht ladbar — Backend nicht erreichbar.');
    }
  }

  private async unterPlaeneLaden(id: string, einbindungen: EinbindungEntry[]): Promise<void> {
    const plaene = new Map<string, UnterPlan>();
    await Promise.all(
      einbindungen
        .filter((e) => e.vorhanden)
        .map(async (e) => {
          const plan = await this.http.jsonOderNull<UnterPlan>(
            `/testmessages/${encodeURIComponent(e.zielId)}/sendung/pruefung`,
          );
          if (plan) plaene.set(e.dateiname, plan);
        }),
    );
    if (this.entryId() === id) this.unterPlaene.set(plaene);
  }

  private async mitSperre(dateiname: string, aktion: () => Promise<void>): Promise<void> {
    this.beschaeftigt.update((s) => new Set(s).add(dateiname));
    try {
      await aktion();
    } finally {
      this.beschaeftigt.update((s) => {
        const n = new Set(s);
        n.delete(dateiname);
        return n;
      });
    }
  }

  /** Datei auf einen Platz legen (ersetzt einen vorhandenen Upload). */
  async ablegen(dateiname: string, datei: Blob): Promise<void> {
    const id = this.entryId();
    if (!id || !this.aenderbar()) return;
    await this.mitSperre(dateiname, async () => {
      try {
        await this.store.ablegen(id, dateiname, datei);
        await this.neuLaden(id);
      } catch (e) {
        this.toast.show(uploadFehler(e));
      }
    });
  }

  /**
   * Platzhalter-PDF bzw. Testsignatur festhalten: einmal erzeugen und wie
   * einen Upload ablegen. Vorher den Autosave leeren — gebaut wird aus der
   * gespeicherten XML.
   */
  async erzeugen(dateiname: string): Promise<void> {
    const id = this.entryId();
    if (!id || !this.aenderbar()) return;
    await this.mitSperre(dateiname, async () => {
      try {
        await this.autosave.flush();
        const erzeugt = await this.store.erzeugen(id, dateiname);
        await this.neuLaden(id);
        this.toast.show(
          erzeugt.length > 1
            ? `Erzeugt und festgehalten: ${erzeugt.join(', ')}`
            : `Erzeugt und festgehalten: ${erzeugt[0] ?? dateiname}`,
        );
      } catch (e) {
        this.toast.show(
          (e as { status?: number })?.status === 409
            ? 'Auf diesem Platz ist nichts zu erzeugen.'
            : uploadFehler(e),
        );
      }
    });
  }

  async entfernen(dateiname: string): Promise<void> {
    const id = this.entryId();
    if (!id || !this.aenderbar()) return;
    await this.mitSperre(dateiname, async () => {
      try {
        await this.store.entfernen(id, dateiname);
        await this.neuLaden(id);
      } catch (e) {
        this.toast.showError(e, 'Entfernen fehlgeschlagen.');
      }
    });
  }

  /** Letzte Mehrfach-Ablage (Hinweis in der Ansicht; null = keiner). */
  readonly ablageErgebnis = signal<AblageErgebnis | null>(null);

  /**
   * Mehrere Dateien auf einmal ablegen (S8): jede auf den Platz mit exakt
   * ihrem Namen. Liegt dort schon ein Upload oder eine eingebundene Nachricht,
   * wird vorher einmal fuer alle nachgefragt. Was keinen Platz findet, wird
   * nicht verworfen, sondern im Ergebnis gelistet.
   */
  async mehrereAblegen(dateien: File[]): Promise<void> {
    const id = this.entryId();
    if (!id) return;
    if (!this.aenderbar()) {
      this.toast.show('Zum Ablegen in den Bearbeiten-Modus wechseln.');
      return;
    }
    const plaetze = new Set(this.plaetze().map((p) => p.dateiname));
    const belegt = new Set([
      ...this.anlagen().map((a) => a.dateiname),
      ...this.einbindungen().map((e) => e.dateiname),
    ]);
    const passend = dateien.filter((d) => plaetze.has(d.name));
    const ohnePlatz = dateien.filter((d) => !plaetze.has(d.name));
    const ersetzt = passend.filter((d) => belegt.has(d.name));
    let ziel = passend;
    let uebersprungen: string[] = [];
    if (
      ersetzt.length &&
      !confirm(
        `${ersetzt.length} ${ersetzt.length === 1 ? 'Datei ersetzt' : 'Dateien ersetzen'} einen vorhandenen Upload bzw. eine eingebundene Nachricht:\n` +
          ersetzt.map((d) => '• ' + d.name).join('\n') +
          '\n\nErsetzen? (Abbrechen legt nur die übrigen ab.)',
      )
    ) {
      uebersprungen = ersetzt.map((d) => d.name);
      ziel = passend.filter((d) => !belegt.has(d.name));
    }
    const abgelegt: string[] = [];
    this.beschaeftigt.update((s) => new Set([...s, ...ziel.map((d) => d.name)]));
    try {
      for (const d of ziel) {
        try {
          await this.store.ablegen(id, d.name, d);
          abgelegt.push(d.name);
        } catch (e) {
          this.toast.show(`${d.name}: ${uploadFehler(e)}`);
        }
      }
      await this.neuLaden(id);
    } finally {
      this.beschaeftigt.update((s) => {
        const n = new Set(s);
        for (const d of ziel) n.delete(d.name);
        return n;
      });
    }
    this.ablageErgebnis.set({ abgelegt, ohnePlatz, uebersprungen });
  }

  /** Ids, die als Ziel einen Zyklus schloessen (Auswahl graut sie aus). */
  async gesperrteZiele(): Promise<Set<string>> {
    const id = this.entryId();
    if (!id) return new Set();
    try {
      return new Set(await this.store.vorfahren(id));
    } catch {
      return new Set([id]);
    }
  }

  /**
   * Vorschlag nach der Namenskonvention `xjustiz_nachricht_<UUID>.xml` (UUID =
   * Dokument-id, wie im DABAG-Antrag) — oder null, wenn der Name schon passt
   * bzw. das Dokument keine id traegt.
   */
  namensVorschlag(platz: Platz): string | null {
    const n = platz.dateiname;
    if (EINGEBUNDEN.test(n) && !UUID_WOERTLICH.test(n)) return null;
    const id = platz.dokument?.id;
    return id ? `xjustiz_nachricht_${id}.xml` : null;
  }

  /**
   * Testnachricht `zielId` auf einen Platz legen. Mit `neuerName` wird der
   * Platz vorher in der XML umbenannt (Dateiname, die Signaturdatei dazu und
   * ihre Bezugsdatei) — die Einbindung landet dann gleich unter dem neuen Namen.
   */
  async einbinden(platz: Platz, zielId: string, neuerName?: string): Promise<void> {
    const id = this.entryId();
    if (!id || !this.aenderbar()) return;
    const name =
      neuerName && this.umbenennen(platz.dateiname, neuerName) ? neuerName : platz.dateiname;
    await this.mitSperre(platz.dateiname, async () => {
      try {
        await this.store.einbinden(id, name, zielId);
        await this.neuLaden(id);
      } catch (e) {
        this.toast.show(
          (e as { status?: number })?.status === 409
            ? 'Zyklus — die gewählte Nachricht bindet diese (mittelbar) ein.'
            : 'Einbinden fehlgeschlagen — Backend nicht erreichbar.',
        );
      }
    });
  }

  async loesen(dateiname: string): Promise<void> {
    const id = this.entryId();
    if (!id || !this.aenderbar()) return;
    await this.mitSperre(dateiname, async () => {
      try {
        await this.store.loesen(id, dateiname);
        await this.neuLaden(id);
      } catch (e) {
        this.toast.showError(e, 'Lösen fehlgeschlagen.');
      }
    });
  }

  /**
   * Benennt einen Platz in der XML um: jedes `dateiname`- und
   * `dateiname.bezugsdatei`-Blatt mit dem alten Namen oder einem davon
   * abgeleiteten Signaturnamen (`alt.pkcs7`). Gesetzt wird der Blattwert im
   * Modell (wie die Eingabe im Baum); der Autosave traegt ihn nach.
   */
  umbenennen(alt: string, neu: string): boolean {
    const res = this.exporter.buildBeispielXmlMitPfaden({ instanz: true });
    if (!res) return false;
    const muster = /<(?:[\w.-]+:)?(dateiname(?:\.bezugsdatei)?)>([^<]*)<\//;
    let n = 0;
    res.xml.split('\n').forEach((zeile, i) => {
      const m = muster.exec(zeile);
      const pfad = res.zeilenPfade.get(i + 1);
      if (!m || !pfad) return;
      const wert = m[2]!.trim();
      if (wert !== alt && !wert.startsWith(alt + '.')) return;
      this.state.setElementProfile(pfad, { beispiel: neu + wert.slice(alt.length) });
      n++;
    });
    return n > 0;
  }

  /**
   * Platz umbenennen (Schnellbehebung, S6): die XML wie `umbenennen`, dazu
   * ziehen Uploads und Einbindungen unter dem alten Namen (und davon
   * abgeleitete Signaturnamen) auf den neuen um — sonst laege die Datei danach
   * ohne Platz da.
   */
  async platzUmbenennen(alt: string, neu: string): Promise<void> {
    const id = this.entryId();
    if (!id || !this.aenderbar() || !this.umbenennen(alt, neu)) return;
    const betroffen = (n: string): boolean => n === alt || n.startsWith(alt + '.');
    const ziel = (n: string): string => neu + n.slice(alt.length);
    await this.mitSperre(alt, async () => {
      try {
        for (const a of this.anlagen().filter((x) => betroffen(x.dateiname))) {
          const blob = await this.store.laden(id, a.dateiname);
          if (!blob) continue;
          await this.store.ablegen(id, ziel(a.dateiname), blob);
          await this.store.entfernen(id, a.dateiname);
        }
        for (const e of this.einbindungen().filter((x) => betroffen(x.dateiname))) {
          await this.store.einbinden(id, ziel(e.dateiname), e.zielId);
          await this.store.loesen(id, e.dateiname);
        }
        await this.neuLaden(id);
      } catch (e) {
        this.toast.showError(e, 'Umbenennen der Anlagen fehlgeschlagen.');
      }
    });
  }

  /** "Neue Testnachricht anlegen" fuer einen Platz: zur Testdaten-Seite, Dialog auf. */
  async neuAnlegenFuer(platz: Platz, quelleName: string): Promise<void> {
    const id = this.entryId();
    if (!id) return;
    await this.autosave.flush();
    this.ruecksprung.set({ quelleId: id, quelleName, dateiname: platz.dateiname });
    this.state.view.set('testdaten');
    this.anlegenAngefordert.set(true);
  }

  private async einbindenNachAnlage(r: Ruecksprung, neuId: string): Promise<void> {
    this.ruecksprung.set(null);
    try {
      await this.store.einbinden(r.quelleId, r.dateiname, neuId);
    } catch {
      this.toast.show(`Einbinden in „${r.quelleName}" fehlgeschlagen.`);
      return;
    }
    if (
      !confirm(`Als „${r.dateiname}" in „${r.quelleName}" eingebunden. Zurück zu dessen Sendung?`)
    )
      return;
    const eintrag = this.testdaten.entries().find((e) => e.id === r.quelleId);
    if (!eintrag) return;
    await this.autosave.flush();
    await this.injector.get(TestmessageEditService).oeffneEintrag(eintrag, 'bearbeiten');
    this.state.darstellung.set('sendung');
  }

  /** Eine hochgeladene Anlage herunterladen. */
  async anlageHerunterladen(dateiname: string): Promise<void> {
    const id = this.entryId();
    if (!id) return;
    try {
      const blob = await this.store.laden(id, dateiname);
      if (blob) this.dl.download(dateiname, blob, blob.type);
    } catch (e) {
      this.toast.showError(e, 'Download fehlgeschlagen.');
    }
  }

  /**
   * Das Paket (ZIP). Bei Fehlern fragt der Aufrufer vorher nach — Befunde
   * sperren nicht (Negativtests).
   */
  async paketHerunterladen(name: string): Promise<void> {
    const id = this.entryId();
    if (!id) return;
    try {
      await this.autosave.flush();
      await this.ladeZip(id, name);
    } catch (e) {
      this.toast.showError(e, 'Paket nicht erzeugbar — Backend nicht erreichbar.');
    }
  }

  /**
   * Paket einer Testnachricht aus der Ablage (Kachelmenue): ohne offene
   * Nachricht gibt es keine Live-Befunde — die Pruefung kommt vom Server, bei
   * Fehlern wird nachgefragt.
   */
  async paketAusAblage(id: string, name: string): Promise<void> {
    try {
      const plan = await this.http.jsonOderNull<{ befunde: Befund[] }>(
        `/testmessages/${encodeURIComponent(id)}/sendung/pruefung`,
      );
      if (!plan) return;
      const { fehler } = zaehle(plan.befunde);
      if (
        fehler &&
        !confirm(
          `Die Sendung hat ${fehler} Fehler — Details in der Ansicht „Sendung". Trotzdem herunterladen?`,
        )
      )
        return;
      await this.ladeZip(id, name);
    } catch (e) {
      this.toast.showError(e, 'Paket nicht erzeugbar — Backend nicht erreichbar.');
    }
  }

  /** Das bei der Freigabe eingefrorene Paket (S9). */
  async freigabePaket(name: string): Promise<void> {
    const id = this.entryId();
    if (!id) return;
    try {
      const zip = await this.http.blobOderNull(
        `/testmessages/${encodeURIComponent(id)}/abnahme/sendung`,
      );
      if (zip)
        this.dl.download(
          paketName(name).replace(/\.zip$/, '.freigegeben.zip'),
          zip,
          'application/zip',
        );
      else this.toast.show('Kein freigegebenes Paket vorhanden.');
    } catch (e) {
      this.toast.showError(e, 'Download fehlgeschlagen — Backend nicht erreichbar.');
    }
  }

  private async ladeZip(id: string, name: string): Promise<void> {
    const zip = await this.http.blobOderNull(`/testmessages/${encodeURIComponent(id)}/sendung`);
    if (zip) this.dl.download(paketName(name), zip, 'application/zip');
  }
}

/** Dateiname des ZIP aus dem Anzeigenamen der Nachricht. */
export function paketName(name: string): string {
  const basis = (name || 'testnachricht').replace(/\.xml$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  return `${basis}_sendung.zip`;
}

function dokumentTitel(p: Platz): string {
  const d = p.dokument;
  if (!d) return 'Außerhalb eines Dokuments';
  const nr = d.nummer ? `Dokument ${d.nummer}` : 'Dokument';
  return d.anzeigename ? `${nr} · ${d.anzeigename}` : nr;
}

function uploadFehler(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 413) return 'Zu groß — höchstens 20 MB je Datei, 100 MB je Sendung.';
  if (status === 403) return 'Von der BLK-AG freigegeben — Ändern nur mit AG-Schlüssel.';
  return 'Hochladen fehlgeschlagen — Backend nicht erreichbar.';
}
