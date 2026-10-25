import { Injectable, computed, inject } from '@angular/core';
import { Befund, Platz } from '../../../../server/sendung/pruefung.js';
import { StateService } from './state.service';
import { GuidedService } from './guided.service';
import { SendungService, SendungsPlatz } from './sendung.service';
import { auspTeile, ohneVorkommen, unterPfad } from '../util/pfad.util';
import { neueUuid } from '../util/uuid.util';

/** Wo ein Platz im Modell steht. */
interface PlatzPfade {
  /** Blatt `…/datei[@id]/dateiname`. */
  blatt: string;
  /** Das `datei`-Element (mit Vorkommens-id, falls es eins ist). */
  datei: string;
  /** Liste der `datei`-Vorkommen (ohne id). */
  dateiListe: string;
  /** Das umschliessende `dokument` (mit id) — null ausserhalb eines Dokuments. */
  dokument: string | null;
}

/** Eine Schnellbehebung an einem Befund. */
export interface Behebung {
  label: string;
  titel: string;
  ausfuehren: () => Promise<void>;
}

const SIGNATUR_ENDUNG = 'pkcs7';
const ZEILE = /<(?:[\w.-]+:)?(dateiname(?:\.bezugsdatei)?)>([^<]*)<\//;
const UUID_WOERTLICH = /(^|[_.-])UUID([_.-]|$)/;

/**
 * Aktionen der Sendungs-Ansicht, die die **XML** aendern (Testsendung S6): die
 * XML fuehrt (ADR 0024), also legen „Signatur hinzufuegen" und „Datei als neues
 * Dokument" Elemente im Modell an — wie der Baum es taete, mit denselben
 * Sperren (Ausschluss durch die gebundene Profilierung, Hoechstanzahl). Die
 * Schnellbehebungen setzen Blattwerte; der Autosave traegt alles nach.
 */
@Injectable({ providedIn: 'root' })
export class SendungBearbeitungService {
  private readonly state = inject(StateService);
  private readonly guided = inject(GuidedService);
  private readonly sendung = inject(SendungService);

  // ── Modellpfade ────────────────────────────────────────────────────

  /** Dateiname → Pfade (erstes Vorkommen gewinnt), aus der angezeigten XML. */
  private readonly pfadMap = computed(() => {
    const res = this.sendung.xml();
    const out = new Map<string, PlatzPfade>();
    if (!res) return out;
    res.xml.split('\n').forEach((zeile, i) => {
      const m = ZEILE.exec(zeile);
      const blatt = res.zeilenPfade.get(i + 1);
      if (!m || m[1] !== 'dateiname' || !blatt || out.has(m[2]!.trim())) return;
      const datei = blatt.slice(0, blatt.lastIndexOf('/'));
      const segs = blatt.split('/');
      const dokIdx = segs.findIndex((s) => s.split('@')[0] === 'dokument');
      out.set(m[2]!.trim(), {
        blatt,
        datei,
        dateiListe: auspTeile(datei)?.listPfad ?? datei,
        dokument: dokIdx >= 0 ? segs.slice(0, dokIdx + 1).join('/') : null,
      });
    });
    return out;
  });

  private pfade(): Map<string, PlatzPfade> {
    return this.pfadMap();
  }

  /** Pfad des Blatts `tag` mit dem Wert `wert` im Element `unter` (oder null). */
  private blattMitWert(unter: string, tag: string, wert: string): string | null {
    const res = this.sendung.xml();
    if (!res) return null;
    const zeilen = res.xml.split('\n');
    for (let i = 0; i < zeilen.length; i++) {
      const m = ZEILE.exec(zeilen[i]!);
      const pfad = res.zeilenPfade.get(i + 1);
      if (m && m[1] === tag && m[2]!.trim() === wert && pfad && unterPfad(pfad, unter)) return pfad;
    }
    return null;
  }

  /**
   * Stellt sicher, dass `liste` benannte Vorkommen fuehrt. Ein generischer
   * Unterbaum (ein einzelnes Element ohne Vorkommensliste) wird dabei zum
   * ersten Vorkommen — sonst verdraengte das neue ihn (benannte Vorkommen
   * ersetzen die generischen Kinder) und seine Werte fielen aus der Nachricht.
   */
  private alsVorkommen(liste: string): void {
    if (this.state.auspsOf(liste)?.length) return;
    const id = this.state.addAusp(liste, 'Vorkommen 1');
    const neu = `${liste}@${id}`;
    const umhaengen = <T>(m: Record<string, T>): Record<string, T> => {
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(m))
        out[k.startsWith(liste + '/') ? neu + k.slice(liste.length) : k] = v;
      return out;
    };
    this.state.elemente.update(umhaengen);
    this.state.auspraegungen.update(umhaengen);
  }

  private neuesVorkommen(liste: string): string {
    this.alsVorkommen(liste);
    const n = this.state.auspsOf(liste)?.length ?? 0;
    return `${liste}@${this.state.addAusp(liste, `Vorkommen ${n + 1}`)}`;
  }

  private setze(pfad: string, wert: string): void {
    this.state.setElementProfile(pfad, { beispiel: wert });
  }

  /** Grund, warum die gebundene Profilierung einen dieser Pfade sperrt. */
  private profilSperre(pfade: string[]): string | null {
    const gesperrt = pfade.find((p) => this.state.vorgabeGesperrt(p));
    return gesperrt
      ? `Die gebundene Profilierung schließt ${ohneVorkommen(gesperrt).split('/').slice(-1)[0]} aus.`
      : null;
  }

  // ── Signatur hinzufuegen ───────────────────────────────────────────

  /** Hat der Platz schon eine Signaturdatei (oder ist selbst eine)? */
  signaturMoeglich(p: SendungsPlatz): boolean {
    if (p.platz.bestandteil === '003') return false;
    return !this.sendung
      .plaetze()
      .some((q) => q.bestandteil === '003' && q.bezugsdateien.includes(p.platz.dateiname));
  }

  /** Grund, warum „Signatur hinzufuegen" gesperrt ist — null = erlaubt. */
  signaturSperre(p: SendungsPlatz): string | null {
    if (!this.sendung.aenderbar()) return 'Nur im Bearbeiten-Modus.';
    const pf = this.pfade().get(p.platz.dateiname);
    if (!pf) return 'Der Platz ist im Modell nicht auffindbar.';
    return (
      this.profilSperre([
        pf.dateiListe,
        `${pf.dateiListe}/bestandteil`,
        `${pf.dateiListe}/dateiname.bezugsdatei`,
      ]) ?? this.guided.kardSperreHinzu(pf.dateiListe)
    );
  }

  /**
   * Legt das zweite `datei`-Element an: `<name>.pkcs7`, Bestandteil 003,
   * `dateiname.bezugsdatei` = der Platz. Die Testsignatur erzeugt der Export.
   */
  signaturHinzufuegen(p: SendungsPlatz): void {
    if (this.signaturSperre(p)) return;
    const pf = this.pfade().get(p.platz.dateiname)!;
    const neu = this.neuesVorkommen(pf.dateiListe);
    this.setze(`${neu}/dateiname`, `${p.platz.dateiname}.${SIGNATUR_ENDUNG}`);
    this.setze(`${neu}/bestandteil`, '003');
    this.setze(`${neu}/dateiname.bezugsdatei`, p.platz.dateiname);
  }

  // ── Datei als neues Dokument ───────────────────────────────────────

  /** Vorlage fuer ein neues Dokument: ein vorhandenes Dokument mit Datei. */
  private vorlage(): PlatzPfade | null {
    for (const pf of this.pfade().values()) if (pf.dokument) return pf;
    return null;
  }

  dokumentSperre(): string | null {
    if (!this.sendung.aenderbar()) return 'Nur im Bearbeiten-Modus.';
    const v = this.vorlage();
    if (!v?.dokument)
      return 'Die Nachricht enthält noch kein Dokument mit Datei — das erste im Baum anlegen.';
    const liste = auspTeile(v.dokument)?.listPfad ?? v.dokument;
    return this.profilSperre([liste]) ?? this.guided.kardSperreHinzu(liste);
  }

  /**
   * Neues `dokument` mit einer `datei` (Bestandteil Original) nach der
   * Namenssyntax `Dokumentname_UUID.Endung` und legt die Datei darauf ab. Die
   * Struktur unter dem Dokument folgt einem vorhandenen; Pflichtangaben wie
   * Dokumentklasse oder -typ ergaenzt der Anwender im Baum (sie erscheinen als
   * offen).
   */
  async alsDokumentAblegen(datei: File): Promise<string | null> {
    if (this.dokumentSperre()) return null;
    const v = this.vorlage()!;
    const dokListe = auspTeile(v.dokument!)?.listPfad ?? v.dokument!;
    const anzahl = Math.max(this.state.auspsOf(dokListe)?.length ?? 1, 1);
    const dok = this.neuesVorkommen(dokListe);
    // Relativer Weg vom Dokument zur Datei, ohne Vorkommens-ids der Vorlage.
    const zurDatei = ohneVorkommen(v.datei.slice(v.dokument!.length));
    const fach = zurDatei.slice(0, zurDatei.lastIndexOf('/'));
    const id = neueUuid();
    const name = dateinameNachSyntax(datei.name, id);
    this.setze(`${dok}/identifikation/id`, id);
    this.setze(`${dok}/identifikation/nummerImUebergeordnetenContainer`, String(anzahl + 1));
    this.setze(`${dok}${fach}/anzeigename`, anzeigename(datei.name));
    this.setze(`${dok}${zurDatei}/dateiname`, name);
    this.setze(`${dok}${zurDatei}/bestandteil`, '001');
    await this.sendung.ablegen(name, datei);
    return name;
  }

  // ── Schnellbehebungen ──────────────────────────────────────────────

  /** Behebung eines Befunds — null, wenn es keine eindeutige gibt. */
  behebung(b: Befund): Behebung | null {
    if (!this.sendung.aenderbar()) return null;
    const platz = this.sendung.plaetze().find((p) => p.dateiname === b.dateiname && !p.herkunft);
    if (!platz) return null;
    const namen = new Set(this.sendung.plaetze().map((p) => p.dateiname));
    // Eine Signatur, die nach ihrer Bezugsdatei heisst, zieht beim Umbenennen
    // der Bezugsdatei mit — eigens umbenannt liefen die Namen auseinander.
    const abgeleitet =
      platz.bestandteil === '003' &&
      platz.bezugsdateien.some((z) => namen.has(z) && b.dateiname.startsWith(z + '.'));
    switch (b.regel) {
      case 'name-uuid': {
        if (abgeleitet) return null;
        const neu = b.dateiname.replace(
          UUID_WOERTLICH,
          (_m, vor: string, nach: string) => `${vor}${platz.dokument?.id ?? neueUuid()}${nach}`,
        );
        return this.umbenennenBehebung(b.dateiname, neu, 'UUID einsetzen');
      }
      case 'name-eingebunden': {
        const neu = this.sendung.namensVorschlag(platz);
        return neu ? this.umbenennenBehebung(b.dateiname, neu, 'Umbenennen') : null;
      }
      case 'signatur-name': {
        const bezug = platz.bezugsdateien[0];
        return bezug && namen.has(bezug)
          ? this.umbenennenBehebung(b.dateiname, `${bezug}.${SIGNATUR_ENDUNG}`, 'Umbenennen')
          : null;
      }
      case 'bezug-fehlt':
        return this.bezugBehebung(platz);
      default:
        return null;
    }
  }

  private umbenennenBehebung(alt: string, neu: string, label: string): Behebung | null {
    if (alt === neu || this.sendung.plaetze().some((p) => p.dateiname === neu)) return null;
    return {
      label,
      titel: `„${alt}" in „${neu}" umbenennen — Signatur, Bezugsdatei und Anlagen ziehen mit`,
      ausfuehren: () => this.sendung.platzUmbenennen(alt, neu),
    };
  }

  /**
   * Bezugsdatei einer Signatur, die ins Leere zeigt: der eigene Name ohne die
   * Signaturendung, sonst das einzige Original desselben Dokuments.
   */
  private bezugBehebung(sig: Platz): Behebung | null {
    const namen = new Set(this.sendung.plaetze().map((p) => p.dateiname));
    const falsch = sig.bezugsdateien.find((b) => !namen.has(b));
    if (falsch === undefined) return null;
    const ohneEndung = sig.dateiname.slice(0, sig.dateiname.lastIndexOf('.'));
    const originale = this.sendung
      .plaetze()
      .filter(
        (p) =>
          p.bestandteil !== '003' &&
          p.dokument?.id !== undefined &&
          p.dokument.id === sig.dokument?.id,
      );
    const ziel = namen.has(ohneEndung)
      ? ohneEndung
      : originale.length === 1
        ? originale[0]!.dateiname
        : null;
    const pf = this.pfade().get(sig.dateiname);
    if (!ziel || !pf) return null;
    const blatt = this.blattMitWert(pf.datei, 'dateiname.bezugsdatei', falsch);
    if (!blatt) return null;
    return {
      label: 'Bezug setzen',
      titel: `Bezugsdatei auf „${ziel}" setzen`,
      ausfuehren: async () => this.setze(blatt, ziel),
    };
  }
}

/** `Dokumentname_UUID.endung` — erlaubte Zeichen, hoechstens 90 Zeichen. */
export function dateinameNachSyntax(original: string, uuid: string): string {
  const punkt = original.lastIndexOf('.');
  const endung = punkt > 0 ? original.slice(punkt + 1).toLowerCase() : 'pdf';
  const basis = (punkt > 0 ? original.slice(0, punkt) : original)
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-zÄÖÜäöüß0-9_-]/g, '')
    .slice(0, 90 - uuid.length - endung.length - 2);
  return `${basis || 'Dokument'}_${uuid}.${endung}`;
}

function anzeigename(original: string): string {
  const punkt = original.lastIndexOf('.');
  return (punkt > 0 ? original.slice(0, punkt) : original).replace(/[_-]+/g, ' ').trim();
}
