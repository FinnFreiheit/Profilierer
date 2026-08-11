import { Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';

/** Query-Parameter des Teilen-Links (…/profilierer/?profil=<id>). */
export const TEILEN_PARAM = 'profil';
/** Query-Parameter des Teilen-Links auf eine Testnachricht (?testnachricht=<id>). */
export const TEILEN_PARAM_NACHRICHT = 'testnachricht';

/** Was geteilt wird: ein Bibliothekseintrag oder eine Testnachricht. */
export type TeilenArt = 'profil' | 'testnachricht';

/** Ziel eines geoeffneten Teilen-Links. */
export interface TeilenZiel {
  art: TeilenArt;
  id: string;
}

/** Query-Parameter je Art — der eine Ort, an dem die Zuordnung steht. */
const PARAM: Record<TeilenArt, string> = {
  profil: TEILEN_PARAM,
  testnachricht: TEILEN_PARAM_NACHRICHT,
};

/** Quittung nach dem Kopieren, je Art. */
const QUITTUNG: Record<TeilenArt, string> = {
  profil: 'Link zum Teilen kopiert — er öffnet diese Profilierung direkt.',
  testnachricht: 'Link zum Teilen kopiert — er öffnet diese Testnachricht direkt.',
};

/**
 * Teilen per Link — einer Profilierung (`?profil=<id>`) oder einer einzelnen
 * Testnachricht (`?testnachricht=<id>`). Der Link zeigt jeweils auf den
 * Eintrag derselben Instanz; geteilt wird also der **lebende Stand**, nicht
 * eine eingefrorene Fassung. Wer den Link oeffnet, landet dort, wo ihn auch
 * ein Klick auf die Kachel hinbraechte.
 *
 * Die App hat bewusst keinen Angular-Router (eine Shell, Ansicht per Signal,
 * siehe StateService.view). Der Deep-Link ist deshalb ein einzelner
 * Query-Parameter, den `startZiel()` beim Start einmal ausliest und
 * anschliessend aus der Adresszeile raeumt: ein spaeterer Reload soll den
 * inzwischen gewaehlten Stand zeigen und nicht wieder ins geteilte Objekt
 * springen.
 */
@Injectable({ providedIn: 'root' })
export class TeilenService {
  private readonly toast = inject(ToastService);
  private readonly log = inject(LoggerService);

  /**
   * Absoluter Link auf eine Profilierung. Basis ist `document.baseURI` (also
   * der `<base href>`) — damit stimmt der Link auch beim Unterpfad-Deployment
   * (xjw.freiheits.de/profilierer/), wo alle API-Pfade relativ sind.
   */
  linkFuerProfil(id: string): string {
    return this.link('profil', id);
  }

  /** Absoluter Link auf eine Testnachricht des Testdaten-Speichers. */
  linkFuerTestnachricht(id: string): string {
    return this.link('testnachricht', id);
  }

  private link(art: TeilenArt, id: string): string {
    return new URL(`?${PARAM[art]}=${encodeURIComponent(id)}`, document.baseURI).href;
  }

  /** Link auf eine Profilierung in die Zwischenablage legen. */
  async kopiereProfilLink(id: string): Promise<void> {
    await this.kopiereLink('profil', id);
  }

  /** Link auf eine Testnachricht in die Zwischenablage legen. */
  async kopiereTestnachrichtLink(id: string): Promise<void> {
    await this.kopiereLink('testnachricht', id);
  }

  /**
   * Link in die Zwischenablage legen und den Erfolg quittieren. `navigator.clipboard`
   * gibt es nur im Secure Context (HTTPS/localhost); auf einer per http
   * erreichten Instanz greift der execCommand-Weg, und wenn auch der scheitert,
   * zeigt ein Prompt den Link zum Kopieren von Hand.
   */
  private async kopiereLink(art: TeilenArt, id: string): Promise<void> {
    const link = this.link(art, id);
    if (await this.kopiere(link)) {
      this.toast.show(QUITTUNG[art]);
      return;
    }
    this.log.warn('Teilen', 'Zwischenablage nicht verfügbar — Link wird zum Kopieren angezeigt');
    window.prompt('Link zum Teilen (kopieren mit Strg/Cmd + C):', link);
  }

  /** Beide Kopierwege; false = keiner hat funktioniert. */
  private async kopiere(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      this.log.warn('Teilen', 'navigator.clipboard fehlgeschlagen', e);
    }
    return this.kopiereMitExecCommand(text);
  }

  /** Aelterer Weg ueber ein unsichtbares Textfeld (kein Secure Context noetig). */
  private kopiereMitExecCommand(text: string): boolean {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    try {
      ta.select();
      return document.execCommand('copy');
    } catch (e) {
      this.log.warn('Teilen', 'execCommand("copy") fehlgeschlagen', e);
      return false;
    } finally {
      ta.remove();
    }
  }

  /**
   * Ziel eines geteilten Links (einmalig beim Start). Die Parameter werden
   * dabei aus der Adresszeile entfernt (`history.replaceState`, kein
   * Neuladen), damit die Sitzung danach eine normale URL fuehrt — beide, auch
   * wenn jemand sie von Hand kombiniert hat; geoeffnet wird dann das Profil.
   */
  startZiel(): TeilenZiel | null {
    const url = new URL(window.location.href);
    let ziel: TeilenZiel | null = null;
    for (const art of ['profil', 'testnachricht'] as const) {
      const id = url.searchParams.get(PARAM[art]);
      if (!id) continue;
      url.searchParams.delete(PARAM[art]);
      ziel ??= { art, id };
    }
    if (!ziel) return null;
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    return ziel;
  }
}
