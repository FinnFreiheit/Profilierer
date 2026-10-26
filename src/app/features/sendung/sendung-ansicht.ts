import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  afterEveryRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { StateService } from '../../core/services/state.service';
import { SendungService, SendungsPlatz } from '../../core/services/sendung.service';
import {
  Behebung,
  SendungBearbeitungService,
} from '../../core/services/sendung-bearbeitung.service';
import { ToastService } from '../../core/services/toast.service';
import { AnlagenQuelle, Befund, Platz } from '../../../../server/sendung/pruefung.js';
import { QUELLE_TEXT, QUELLE_TITEL, bestandteilText } from './sendung-texte';
import { TestmessageStoreService } from '../../core/services/testmessage-store.service';
import { TestmessageEntry } from '../../models/testmessage.model';

/**
 * **Sendungs-Darstellung** (Testsendung, ADR 0024): die offene Testnachricht als
 * das, was beim Empfaenger ankommt — `xjustiz_nachricht.xml` und je Platz des
 * Schriftgutobjekts eine Datei. Dieselbe Karte wie die XML-Darstellung (Kopf,
 * Inhalt, Fuss), gegliedert nach Dokument. Hochladen, Ersetzen und Entfernen
 * nur im Bearbeiten-Modus; Herunterladen und Befunde immer.
 */
@Component({
  selector: 'app-sendung-ansicht',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sendung-ansicht.html',
})
export class SendungAnsicht {
  protected readonly sendung = inject(SendungService);
  private readonly state = inject(StateService);
  private readonly testdaten = inject(TestmessageStoreService);
  protected readonly bearb = inject(SendungBearbeitungService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Zuletzt angesprungener Fokus (sonst sprang jeder Render erneut). */
  private zuletzt = 0;

  constructor() {
    // Sprung aus Baum oder Detailbereich: Platz in den Blick holen, kurz aufleuchten.
    afterEveryRender(() => {
      const f = this.sendung.fokus();
      if (!f || f.n === this.zuletzt) return;
      const zeile = [
        ...this.host.nativeElement.querySelectorAll<HTMLElement>('.sendungPlatz[data-datei]'),
      ].find((z) => z.dataset['datei'] === f.dateiname);
      if (!zeile) return;
      this.zuletzt = f.n;
      zeile.scrollIntoView?.({ block: 'center' });
      zeile.classList.remove('aufleuchten');
      void zeile.offsetWidth;
      zeile.classList.add('aufleuchten');
      // Aus der Anlagen-Karte: die Auswahl fuer diesen Platz gleich oeffnen.
      const platz = f.auswahl
        ? this.sendung.plaetze().find((p) => p.dateiname === f.dateiname && !p.herkunft)
        : undefined;
      if (platz && this.sendung.aenderbar()) void this.waehleTestnachricht(platz);
    });
  }

  // ── XML aendern (S6) ──────────────────────────────────────────────

  private readonly neuInput = viewChild<ElementRef<HTMLInputElement>>('neuInput');

  /** Je Befund die Schnellbehebung (einmal je Aenderung, nicht je Zeile und Render). */
  protected readonly behebungen = computed(
    () => new Map(this.sendung.befunde().map((b) => [b, this.bearb.behebung(b)])),
  );

  /** Je Platz der Sperrgrund fuer „+ Signatur" (undefined = nicht angeboten). */
  protected readonly signaturLage = computed(() => {
    const m = new Map<string, string | null>();
    if (!this.sendung.aenderbar()) return m;
    for (const d of this.sendung.dokumente())
      for (const p of d.plaetze)
        if (this.bearb.signaturMoeglich(p)) m.set(p.platz.dateiname, this.bearb.signaturSperre(p));
    return m;
  });

  protected readonly dokumentSperre = computed(() => this.bearb.dokumentSperre());

  /** Freigabe-Stand der Sendung (S9) als eine Zeile — null ohne Freigabe. */
  protected readonly freigabe = computed(() => {
    const e = this.sendung.eintrag();
    if (!e?.abgenommen) return null;
    const am = e.abnahmeZeit
      ? new Date(e.abnahmeZeit).toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';
    return { am, geaendert: !!e.geaendertSeitAbnahme, paket: !!e.abnahmeSendung };
  });

  protected freigabePaket(): void {
    void this.sendung.freigabePaket(this.nachrichtName());
  }

  /** Nicht zuordenbare Datei der Mehrfach-Ablage als neues Dokument aufnehmen (S8 + S6). */
  protected async alsNeuesDokument(datei: File): Promise<void> {
    const name = await this.bearb.alsDokumentAblegen(datei);
    if (!name) return;
    this.sendung.ablageErgebnis.update((e) =>
      e
        ? {
            ...e,
            ohnePlatz: e.ohnePlatz.filter((d) => d !== datei),
            abgelegt: [...e.abgelegt, name],
          }
        : e,
    );
  }

  protected behebung(b: Befund): Behebung | null {
    return this.behebungen().get(b) ?? null;
  }

  protected beheben(b: Befund): void {
    void this.behebung(b)?.ausfuehren();
  }

  protected signaturHinzu(p: SendungsPlatz): void {
    this.bearb.signaturHinzufuegen(p);
  }

  protected neuesDokumentWaehlen(): void {
    const input = this.neuInput()?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  protected async neuesDokument(ev: Event): Promise<void> {
    const datei = (ev.target as HTMLInputElement).files?.[0];
    if (!datei) return;
    const name = await this.bearb.alsDokumentAblegen(datei);
    if (name)
      this.toast.show(
        `Neues Dokument mit „${name}" angelegt — Dokumentklasse und -typ im Baum ergänzen.`,
        5000,
      );
  }

  private readonly dateiInput = viewChild<ElementRef<HTMLInputElement>>('dateiInput');
  /** Platz, fuer den der Dateidialog gerade offen ist. */
  private ziel: string | null = null;

  // ── Einbinden (S5) ────────────────────────────────────────────────

  private readonly auswahlDlg = viewChild<ElementRef<HTMLDialogElement>>('auswahlDlg');
  /** Platz, fuer den die Auswahl offen ist. */
  protected readonly auswahlPlatz = signal<Platz | null>(null);
  protected readonly filter = signal('');
  protected readonly gesperrt = signal<ReadonlySet<string>>(new Set());
  /** Angebot, den Platz nach der Konvention umzubenennen (Haken, vorbelegt). */
  protected readonly umbenennen = signal(true);
  protected readonly vorschlag = computed(() => {
    const p = this.auswahlPlatz();
    return p ? this.sendung.namensVorschlag(p) : null;
  });

  /** Kandidaten: erst das eigene Projekt, dann die uebrigen; gefiltert. */
  protected readonly gruppen = computed(() => {
    const id = this.sendung.entryId();
    const projekt = this.testdaten.entries().find((e) => e.id === id)?.projektId;
    const f = this.filter().trim().toLowerCase();
    const passt = (e: TestmessageEntry): boolean =>
      !f || `${e.name} ${e.nachricht ?? ''}`.toLowerCase().includes(f);
    const alle = this.testdaten.entries().filter(passt);
    const eigen = projekt ? alle.filter((e) => e.projektId === projekt) : [];
    const rest = alle.filter((e) => !eigen.includes(e));
    return [
      { label: 'Im selben Projekt', items: eigen },
      { label: eigen.length ? 'Weitere Testnachrichten' : 'Testnachrichten', items: rest },
    ].filter((g) => g.items.length);
  });

  protected async waehleTestnachricht(p: Platz): Promise<void> {
    this.auswahlPlatz.set(p);
    this.filter.set('');
    this.umbenennen.set(true);
    this.gesperrt.set(new Set([this.sendung.entryId() ?? '']));
    this.auswahlDlg()?.nativeElement.showModal();
    this.gesperrt.set(await this.sendung.gesperrteZiele());
  }

  protected zielTitel(e: TestmessageEntry): string {
    if (e.id === this.sendung.entryId()) return 'Die Nachricht selbst';
    if (this.gesperrt().has(e.id))
      return 'Bindet diese Nachricht (mittelbar) ein — ergäbe einen Zyklus';
    return e.nachricht ?? '';
  }

  protected async einbinden(e: TestmessageEntry): Promise<void> {
    const p = this.auswahlPlatz();
    if (!p || this.gesperrt().has(e.id)) return;
    this.auswahlDlg()?.nativeElement.close();
    const neu = this.umbenennen() ? (this.vorschlag() ?? undefined) : undefined;
    await this.sendung.einbinden(p, e.id, neu);
  }

  protected neuAnlegen(): void {
    const p = this.auswahlPlatz();
    if (!p) return;
    this.auswahlDlg()?.nativeElement.close();
    void this.sendung.neuAnlegenFuer(p, this.nachrichtName());
  }

  protected loesen(dateiname: string): void {
    if (confirm(`Eingebundene Testnachricht von „${dateiname}" lösen?`))
      void this.sendung.loesen(dateiname);
  }

  protected istXml(p: Platz): boolean {
    return p.dateiname.toLowerCase().endsWith('.xml');
  }

  protected filterEingabe(ev: Event): void {
    this.filter.set((ev.target as HTMLInputElement).value);
  }

  private nachrichtName(): string {
    return (
      this.state.messageEdit()?.quellName ||
      this.state.messageCreate()?.name ||
      this.state.msgName() ||
      ''
    );
  }

  protected readonly bilanz = computed(() => {
    const plaetze = new Set(this.sendung.plaetze().map((p) => p.dateiname)).size;
    const dateien = this.sendung.dateien();
    const hoch = dateien.filter((d) => d.quelle === 'upload').length;
    return `${plaetze} Plätze · ${hoch} hochgeladen · ${dateien.length - hoch} erzeugt · ${plaetze - dateien.length} leer`;
  });

  protected bestandteil(code: string | undefined): string {
    return bestandteilText(code);
  }

  protected quelleText(p: SendungsPlatz): string {
    if (p.einbindung && !p.einbindung.vorhanden) return 'gelöscht';
    return p.datei ? QUELLE_TEXT[p.datei.quelle] : 'leer';
  }

  protected quelleTitel(p: SendungsPlatz): string {
    if (p.einbindung && !p.einbindung.vorhanden)
      return 'Die eingebundene Testnachricht wurde gelöscht';
    if (p.einbindung && p.datei?.quelle === 'testnachricht')
      return `Eingebunden: ${p.einbindung.zielName ?? ''} (${p.einbindung.zielNachricht ?? ''}) — lebender Verweis`;
    if (p.datei) return QUELLE_TITEL[p.datei.quelle];
    return p.platz.bestandteil === '003'
      ? 'Keine Testsignatur möglich: die Bezugsdatei fehlt in der Sendung'
      : 'Für diese Dateiart erzeugt der Export nichts — bitte eine Datei hochladen';
  }

  /** Erzeugbar und noch nicht festgehalten (Platzhalter bzw. Testsignatur). */
  protected erzeugbar(p: SendungsPlatz): boolean {
    return p.datei?.quelle === 'platzhalter' || p.datei?.quelle === 'signatur';
  }

  protected erzeugenTitel(p: SendungsPlatz): string {
    return p.datei?.quelle === 'signatur'
      ? 'Testsignatur jetzt erzeugen und festhalten — ist die Bezugsdatei nur ein Platzhalter, wird sie mit festgehalten'
      : 'Generisches PDF jetzt erzeugen und festhalten (Angaben aus der XML)';
  }

  protected quelleKlasse(p: SendungsPlatz): string {
    return 'quellePill q-' + (p.datei?.quelle ?? 'leer');
  }

  protected unterText(q: AnlagenQuelle | null): string {
    return q ? QUELLE_TEXT[q] : 'leer';
  }

  protected befundTitel(befunde: Befund[]): string {
    return befunde.map((b) => b.text).join('\n');
  }

  protected hatFehler(befunde: Befund[]): boolean {
    return befunde.some((b) => b.schwere === 'fehler');
  }

  protected beschaeftigt(dateiname: string): boolean {
    return this.sendung.beschaeftigt().has(dateiname);
  }

  protected waehleDatei(dateiname: string): void {
    const input = this.dateiInput()?.nativeElement;
    if (!input) return;
    this.ziel = dateiname;
    input.value = '';
    input.click();
  }

  protected async dateiGewaehlt(ev: Event): Promise<void> {
    const datei = (ev.target as HTMLInputElement).files?.[0];
    const ziel = this.ziel;
    this.ziel = null;
    if (datei && ziel) await this.sendung.ablegen(ziel, datei);
  }

  protected entfernen(dateiname: string): void {
    if (confirm(`Hochgeladene Datei „${dateiname}" entfernen?`))
      void this.sendung.entfernen(dateiname);
  }

  protected paket(): void {
    const { fehler } = this.sendung.zahlen();
    if (
      fehler &&
      !confirm(`Die Sendung hat ${fehler} Fehler (siehe Befunde). Trotzdem herunterladen?`)
    )
      return;
    void this.sendung.paketHerunterladen(this.nachrichtName());
  }
}
