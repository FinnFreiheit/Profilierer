import { Injectable, effect, inject } from '@angular/core';
import { ProfileDoc } from '../../models/profile.model';
import { MessageCreateSession, MessageEditSession } from '../../models/testmessage.model';
import { StateService } from './state.service';
import { TestmessagePatch, TestmessageStoreService } from './testmessage-store.service';
import { InstanceExportService } from './instance-export.service';
import { ExportService } from './export.service';
import { GuidedService } from './guided.service';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';
import { bezeichnungenAus } from '../util/ausp-bezeichnung.util';
import { parseTestmessage, testmessageInput } from '../util/testmessage.util';

/**
 * localStorage-Prefix der Notfallkopien (Backend beim Autosave nicht
 * erreichbar). Bewusst **nicht** unterhalb von `xjp.notfall.`: der
 * PersistenceService scannt diesen Prefix und liest jeden Treffer als
 * Profil-Dokument — Nachrichtenkopien lägen dort in seinem Suchraum.
 */
const NOTFALL_PREFIX = 'xjp.notfall-nachricht.';
/**
 * Entprellung. Deutlich laenger als die 800 ms des Profil-Autosave: dort wird
 * ein fertiger Signal-Wert hochgeladen, hier wird die ganze Instanz erzeugt
 * (Baum-Walk plus Serialisierung).
 */
const ENTPRELLUNG_MS = 2000;
/** Wiederholung nach einem Fehlschlag (Backend-Ausfall). */
const WIEDERHOLUNG_MS = 5000;

/** Eine faellige Schreiboperation: `id === null` heisst "Eintrag fehlt noch". */
interface Auftrag {
  id: string | null;
  patch: TestmessagePatch;
}

/** Nutzlast einer Notfallkopie im localStorage. */
interface Notfallkopie {
  id: string;
  patch: TestmessagePatch;
  ts: number;
}

/** Zeitangabe der Fusszeile ("automatisch gesichert 14:32"). */
function uhrzeit(): string {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Autosave des Nachrichten-Modus — das Gegenstueck zum Profil-Autosave im
 * PersistenceService, bewusst als eigene Naht (#105).
 *
 * Der Profil-Autosave greift hier nicht und darf es nicht: beide Einstiege in
 * eine Testnachricht setzen `activeProfileId` auf null, damit die Bearbeitung
 * einer Nachricht nicht in ein womoeglich offenes Profil geschrieben wird — und
 * genau diese id ist seine Bedingung. Nutzlast, Ziel-Ablage und Sperre sind
 * ausserdem andere; geteilt wird nur das Muster.
 *
 * **Still und urteilsfrei.** Gesichert wird der Zwischenstand, mehr nicht: keine
 * XSD-Pruefung, kein Konformitaets-Abgleich, kein `confirm`, kein Bericht. Das
 * Entwurfs-Kennzeichen wird beim Aktualisieren **nicht** mitgesendet (das
 * Backend laesst weggelassene Felder unberuehrt) — es bleibt das Ergebnis einer
 * bewussten Bewertung im expliziten Speichern.
 *
 * **Der Eintrag entsteht von selbst.** Im gefuehrten Durchlauf gab es bis zum
 * ersten bewussten Speichern gar kein Ziel — ausgerechnet die laengste
 * ungeschuetzte Phase. Der Autosave legt den Eintrag daher selbst an (Entwurf,
 * generischer Name); den Namen fragt der erste Klick auf "Speichern" nach
 * (`TestmessageCreateService.speichern`, erkennbar an `session.name === null`).
 */
@Injectable({ providedIn: 'root' })
export class TestmessageAutosaveService {
  private readonly state = inject(StateService);
  private readonly store = inject(TestmessageStoreService);
  private readonly instanceExport = inject(InstanceExportService);
  private readonly exporter = inject(ExportService);
  private readonly guided = inject(GuidedService);
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerService);

  /**
   * Der Modellstand, der als gesichert gilt — Referenzvergleich auf das
   * `profileDoc`-Computed. Er ist der Dirty-Flag dieses Dienstes: ohne ihn
   * loeste schon das Oeffnen einer Nachricht einen Speichervorgang aus und
   * schoebe den Eintrag samt "zuletzt geaendert" nach oben, ohne dass jemand
   * etwas geaendert haette.
   */
  private gesichert: ProfileDoc | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Verhindert parallele Schreibvorgaenge (Reihenfolge/Lost-Update-Schutz). */
  private inFlight = false;
  /** Waehrend eines laufenden Schreibvorgangs eingegangene Aenderung. */
  private nachzieher = false;
  /** Fehler-Toast nur einmal pro Ausfall zeigen. */
  private fehlerGemeldet = false;
  /** Letzter Versuch fehlgeschlagen (Backend-Ausfall laeuft). */
  private fehlgeschlagen = false;
  /** Laufender Schreibvorgang als Promise — `flush` wartet auch darauf. */
  private laufend: Promise<void> | null = null;

  constructor() {
    effect(() => {
      // Erst alle Abhaengigkeiten lesen, dann entscheiden: ein frueher Ausstieg
      // liesse den Effekt auf die ungelesenen Signale nicht mehr reagieren.
      const doc = this.state.profileDoc();
      const create = this.state.messageCreate();
      const edit = this.state.messageEdit();
      const hatBaum = this.state.hasRoot();
      const schutz = this.state.abnahmeSchreibschutz();
      if (schutz || !hatBaum || doc === this.gesichert) return;
      // Ohne Testspeicher-Eintrag gibt es beim Bearbeiten kein Ziel (Datei-Upload,
      // Drag&Drop). Im Durchlauf legt der Autosave den Eintrag selbst an.
      if (!create && !edit?.entryId) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.sichereJetzt();
      }, ENTPRELLUNG_MS);
    });
    // Notfallkopien frueherer Sitzungen ans Backend nachtragen (best effort).
    void this.flushNotfallkopien();
    // Eigener Listener statt eines gemeinsamen Dirty-Flags mit dem
    // PersistenceService: jede Naht warnt fuer ihren eigenen Stand.
    window.addEventListener('beforeunload', (e) => {
      if (this.ungesichert()) e.preventDefault();
    });
  }

  // ── Naht nach aussen ────────────────────────────────────────────────

  /** Stehen Aenderungen aus, die das Backend noch nicht hat? */
  ungesichert(): boolean {
    return this.timer !== null || this.inFlight || this.nachzieher || this.fehlgeschlagen;
  }

  /**
   * Haengenden Autosave sofort ausfuehren und laufende Schreibvorgaenge
   * abwarten. Noetig vor jedem Wechsel der Sitzung: wird `messageEdit`/
   * `messageCreate` ersetzt, waehrend die Entprellung laeuft, ginge die letzte
   * Aenderung in den *vorigen* Eintrag verloren.
   */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Nicht am Timer festmachen, sondern am Stand: eine Aenderung unmittelbar
    // vor dem Wechsel kann den Effekt noch gar nicht durchlaufen haben, und
    // dann gaebe es nichts zu entprellen — wohl aber etwas zu sichern.
    if (this.state.profileDoc() !== this.gesichert) await this.sichereJetzt();
    while (this.laufend) await this.laufend;
  }

  /**
   * Eine Sitzung beginnt: der geladene Stand gilt als gesichert (er kommt ja
   * gerade aus dem Speicher) und die Fusszeile verliert die Meldung des zuvor
   * offenen Profils.
   */
  sitzungBeginnt(): void {
    this.gesichert = this.state.profileDoc();
    this.state.autosaveInfo.set('');
  }

  /** Nach einem bewussten Speichern: kein Autosave mehr faellig. */
  explizitGespeichert(): void {
    this.gesichert = this.state.profileDoc();
    this.state.autosaveInfo.set('gespeichert ' + uhrzeit());
  }

  // ── Schreiben ───────────────────────────────────────────────────────

  private sichereJetzt(): Promise<void> {
    // Laeuft noch ein Schreibvorgang, den naechsten danach nachziehen.
    if (this.inFlight) {
      this.nachzieher = true;
      return this.laufend ?? Promise.resolve();
    }
    const p = this.lauf().finally(() => {
      if (this.laufend === p) this.laufend = null;
    });
    this.laufend = p;
    return p;
  }

  private async lauf(): Promise<void> {
    const doc = this.state.profileDoc();
    const create = this.state.messageCreate();
    const edit = this.state.messageEdit();
    // Die Lage kann sich seit dem Planen des Timers geaendert haben (Sitzung
    // gewechselt, Stand inzwischen bewusst gespeichert, Schutz gesetzt).
    if (doc === this.gesichert || this.state.abnahmeSchreibschutz() || !this.state.hasRoot())
      return;
    if (!create && !edit?.entryId) return;

    this.inFlight = true;
    /** Bleibt undefiniert, wenn schon das Erzeugen der Nutzlast scheitert. */
    let auftrag: Auftrag | undefined;
    try {
      auftrag = create ? this.durchlaufAuftrag(create) : this.bearbeitungsAuftrag(edit!);
      let neueId: string | null = null;
      if (auftrag.id) await this.store.updateMeta(auftrag.id, auftrag.patch);
      else neueId = await this.legeAn(create!, auftrag.patch);
      // Vor dem Fortschreiben der Sitzung: sonst plante der Effekt auf die
      // gesetzte entryId hin sofort den naechsten (identischen) Lauf.
      this.nachErfolg(doc, auftrag.id ?? neueId);
      if (neueId) this.state.messageCreate.update((s) => (s ? { ...s, entryId: neueId } : s));
    } catch (e) {
      this.nachFehler(e, auftrag);
    } finally {
      this.inFlight = false;
      if (this.nachzieher) {
        this.nachzieher = false;
        void this.sichereJetzt();
      }
    }
  }

  /**
   * Gefuehrter Durchlauf: neben dem XML gehen Fortschritt und
   * Entscheidungsstand mit — ohne sie faende "Entwurf fortsetzen" nach einem
   * Absturz einen veralteten Punkt vor. `entwurf` bleibt bewusst aussen vor.
   */
  private durchlaufAuftrag(session: MessageCreateSession): Auftrag {
    const res = this.exporter.buildBeispielXmlMitPfaden({ instanz: true });
    if (!res) throw new Error('Zwischenstand konnte nicht erzeugt werden.');
    const { x, y } = this.guided.fortschritt();
    return {
      id: session.entryId,
      patch: {
        xml: res.xml,
        fortschritt: { x, y },
        entscheidungen: {
          msgName: session.msgName,
          xjustizVersion: session.xjustizVersion,
          profil: this.state.profileDoc(),
        },
        bezeichnungen: bezeichnungenAus(this.state.alleAuspListen()),
      },
    };
  }

  /**
   * Bearbeitung einer gespeicherten Nachricht: getreuer Re-Export aus dem
   * Quell-DOM, Kopfdaten unangetastet — es ist dieselbe Nachricht.
   */
  private bearbeitungsAuftrag(session: MessageEditSession): Auftrag {
    return {
      id: session.entryId,
      patch: {
        xml: this.instanceExport.buildInstanceXml(session, false),
        bezeichnungen: bezeichnungenAus(this.state.alleAuspListen()),
      },
    };
  }

  /**
   * Den Eintrag des Durchlaufs still anlegen. Die Profil-Bindung muss hier
   * mitgehen: Herkunft und eingefrorene Fassung sind nur beim Anlegen setzbar,
   * ein spaeteres Nachreichen gibt es nicht.
   */
  private async legeAn(session: MessageCreateSession, patch: TestmessagePatch): Promise<string> {
    const xml = patch.xml!;
    const meta = parseTestmessage(xml);
    if (!meta) throw new Error('Zwischenstand ist keine lesbare XJustiz-Nachricht.');
    return this.store.create({
      ...testmessageInput(`${session.msgName} — Testnachricht.xml`, xml, meta),
      // Session-Version gewinnt (wie beim bewussten Speichern): sie traegt die
      // tatsaechlich gewaehlte Schemaversion.
      xjustizVersion: session.xjustizVersion,
      // Ein ungefragt angelegter Eintrag ist per Definition unfertig.
      entwurf: true,
      fortschritt: patch.fortschritt,
      entscheidungen: patch.entscheidungen,
      bezeichnungen: patch.bezeichnungen,
      profilId: session.profilId,
      profilName: session.profilName,
      fassung: session.fassung,
      vorgabe: this.state.vorgabe() ?? undefined,
    });
  }

  private nachErfolg(doc: ProfileDoc, id: string | null): void {
    this.gesichert = doc;
    this.fehlerGemeldet = false;
    // Die eigene Kopie zuerst wegraeumen: sie ist von dem gerade geschriebenen
    // Stand ueberholt. Erst danach nachtragen — sonst schickte der Nachtrag den
    // alten Stand hinterher und ueberschriebe den neuen.
    if (id) this.loescheNotfallkopie(id);
    if (this.fehlgeschlagen) {
      this.fehlgeschlagen = false;
      this.toast.show('Backend wieder erreichbar — Zwischenstand gesichert.');
      void this.flushNotfallkopien().catch((e) =>
        this.log.warn('Testdaten-Autosave', 'Nachtrag der Notfallkopien fehlgeschlagen', e),
      );
    }
    this.state.autosaveInfo.set('automatisch gesichert ' + uhrzeit());
  }

  private nachFehler(e: unknown, auftrag: Auftrag | undefined): void {
    this.log.error('Testdaten-Autosave', 'Zwischenstand nicht gesichert', e);
    this.fehlgeschlagen = true;
    // Ohne Eintrag gibt es kein Ziel fuer eine Notfallkopie: sie legte beim
    // naechsten Start eine Nachricht aus dem Nichts an, im Zweifel doppelt.
    // Dieser Fall trifft nur einen Durchlauf, dessen allererstes Anlegen schon
    // scheitert — danach steht die id und die Kopie greift.
    if (auftrag?.id) this.schreibeNotfallkopie(auftrag.id, auftrag.patch);
    this.state.autosaveInfo.set(
      auftrag?.id
        ? `⚠ NICHT im Backend gesichert — Notfallkopie lokal ${uhrzeit()}`
        : `⚠ NICHT im Backend gesichert — Wiederholung läuft (${uhrzeit()})`,
    );
    if (!this.fehlerGemeldet) {
      this.fehlerGemeldet = true;
      this.toast.show(
        auftrag?.id
          ? 'Backend nicht erreichbar — die Testnachricht wird lokal zwischengespeichert und automatisch nachgetragen.'
          : 'Backend nicht erreichbar — der Zwischenstand konnte noch nicht abgelegt werden. Bitte das Fenster offen lassen.',
      );
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.sichereJetzt();
      }, WIEDERHOLUNG_MS);
    }
  }

  // ── Notfallkopien (Backend-Ausfall) ─────────────────────────────────

  /** Notfallkopie schreiben; localStorage-Fehler (Quota o. ae.) bewusst schlucken. */
  private schreibeNotfallkopie(id: string, patch: TestmessagePatch): void {
    try {
      const kopie: Notfallkopie = { id, patch, ts: Date.now() };
      localStorage.setItem(NOTFALL_PREFIX + id, JSON.stringify(kopie));
    } catch {
      /* volle/gesperrte Storage: die 5-s-Wiederholung bleibt die Sicherung */
    }
  }

  private loescheNotfallkopie(id: string): void {
    try {
      localStorage.removeItem(NOTFALL_PREFIX + id);
    } catch {
      /* ignorieren */
    }
  }

  /**
   * Alle vorhandenen Notfallkopien ans Backend nachtragen (App-Start bzw.
   * sobald das Backend wieder erreichbar ist). Bei Erfolg werden die lokalen
   * Kopien entfernt; bleibt das Backend weg, bleiben sie liegen.
   */
  async flushNotfallkopien(): Promise<void> {
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NOTFALL_PREFIX)) keys.push(k);
      }
    } catch {
      return;
    }
    if (!keys.length) return;
    let ok = 0;
    for (const k of keys) {
      try {
        const { id, patch } = JSON.parse(localStorage.getItem(k) ?? '') as Notfallkopie;
        await this.store.updateMeta(id, patch);
        localStorage.removeItem(k);
        ok++;
      } catch (e) {
        // Backend weiterhin weg oder Eintrag defekt → Kopie behalten.
        this.log.warn('Testdaten-Autosave', `Notfallkopie ${k} nicht nachtragbar`, e);
      }
    }
    if (ok)
      this.toast.show(
        ok === 1
          ? 'Eine lokal zwischengespeicherte Testnachricht wurde ans Backend nachgetragen.'
          : `${ok} lokal zwischengespeicherte Testnachrichten wurden ans Backend nachgetragen.`,
      );
  }
}
