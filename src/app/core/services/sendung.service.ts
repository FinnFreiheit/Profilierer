import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnlageEntry } from '../../models/testmessage.model';
import {
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
  befunde: Befund[];
}

/**
 * Die **Testsendung** der offenen Testnachricht (ADR 0024) — Zustand und
 * Aktionen der Ansicht „Sendung". Die Plaetze kommen live aus der angezeigten
 * XML (dieselbe Quelle wie die XML-Ansicht), die Anlagen vom Server; Plan und
 * Befunde rechnet dasselbe Modul wie der Export (`server/sendung/pruefung.js`).
 * Der ZIP baut der Server — vorher wird der Autosave geleert, damit er dieselbe
 * XML hat, die die Ansicht zeigt.
 */
@Injectable({ providedIn: 'root' })
export class SendungService {
  private readonly state = inject(StateService);
  private readonly exporter = inject(ExportService);
  private readonly store = inject(AnlagenStoreService);
  private readonly http = inject(BackendClient).fuer('Sendung-Backend');
  private readonly autosave = inject(TestmessageAutosaveService);
  private readonly dl = inject(DownloadService);
  private readonly toast = inject(ToastService);
  private readonly testdaten = inject(TestmessageStoreService);

  /** Testspeicher-Eintrag der offenen Nachricht (null = keine gespeicherte). */
  readonly entryId = computed(
    () => this.state.messageEdit()?.entryId ?? this.state.messageCreate()?.entryId ?? null,
  );

  /** Gibt es eine Sendung zu zeigen? (gespeicherte Testnachricht, kein Typ) */
  readonly moeglich = computed(() => !!this.entryId() && !this.state.istTypAnsicht());

  /** Anlagen duerfen nur im Bearbeiten-Modus geaendert werden. */
  readonly aenderbar = computed(() => !this.state.readOnly());

  readonly anlagen = signal<AnlageEntry[]>([]);
  /** Laufende Upload-/Loesch-Aktion je Dateiname (Knopf gesperrt). */
  readonly beschaeftigt = signal<ReadonlySet<string>>(new Set());

  /** Plaetze aus der live angezeigten XML. */
  readonly plaetze = computed<Platz[]>(() => {
    if (!this.moeglich()) return [];
    const xml = this.exporter.buildBeispielXmlMitPfaden({ instanz: true })?.xml;
    if (!xml) return [];
    return plaetzeLesen(new DOMParser().parseFromString(xml, 'application/xml'));
  });

  readonly dateien = computed(() =>
    dateienPlanen(this.plaetze(), new Set(this.anlagen().map((a) => a.dateiname))),
  );

  /** Hochgeladene Anlagen, deren Namen die XML nicht (mehr) nennt. */
  readonly ohnePlatz = computed(() => {
    const namen = new Set(this.plaetze().map((p) => p.dateiname));
    return this.anlagen().filter((a) => !namen.has(a.dateiname));
  });

  readonly befunde = computed<Befund[]>(() => {
    const dateien: SendungsDatei[] = [
      ...this.dateien(),
      ...this.ohnePlatz().map((a) => ({ dateiname: a.dateiname, quelle: 'upload' as const })),
    ];
    return pruefen({ plaetze: this.plaetze(), dateien });
  });

  readonly zahlen = computed(() => zaehle(this.befunde()));

  /** Gliederung nach Dokument in Reihenfolge der XML. */
  readonly dokumente = computed<SendungsDokument[]>(() => {
    const dateien = new Map(this.dateien().map((d) => [d.dateiname, d]));
    const anlagen = new Map(this.anlagen().map((a) => [a.dateiname, a]));
    const befunde = this.befunde();
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
      dok.plaetze.push({
        platz: p,
        datei: dateien.get(p.dateiname) ?? null,
        anlage: anlagen.get(p.dateiname) ?? null,
        befunde: befunde.filter((b) => b.dateiname === p.dateiname),
      });
    });
    return out;
  });

  constructor() {
    // Anlagen nachladen, sobald eine andere Nachricht offen ist.
    effect(() => {
      const id = this.entryId();
      untracked(() => {
        this.anlagen.set([]);
        if (id) void this.neuLaden(id);
      });
    });
  }

  private async neuLaden(id: string): Promise<void> {
    try {
      const liste = await this.store.liste(id);
      if (this.entryId() === id) this.anlagen.set(liste);
      // Zaehler der Kachel nachziehen — der Index wird sonst nur beim Start geladen.
      this.testdaten.entries.update((es) =>
        es.map((e) => (e.id === id ? { ...e, anlagen: liste.length || undefined } : e)),
      );
    } catch (e) {
      this.toast.showError(e, 'Anlagen nicht ladbar — Backend nicht erreichbar.');
    }
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
