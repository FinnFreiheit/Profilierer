import { Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';

/** Query-Parameter des Teilen-Links (…/profilierer/?profil=<id>). */
export const TEILEN_PARAM = 'profil';

/**
 * Teilen einer Profilierung per Link. Der Link zeigt auf den Bibliothekseintrag
 * derselben Instanz (`?profil=<id>`) — geteilt wird also der **lebende Stand**,
 * nicht eine eingefrorene Fassung; wer den Link oeffnet, arbeitet danach wie
 * nach einem Klick auf die Kachel im Dashboard (Autosave inklusive).
 *
 * Die App hat bewusst keinen Angular-Router (eine Shell, Ansicht per Signal,
 * siehe StateService.view). Der Deep-Link ist deshalb ein einzelner
 * Query-Parameter, den `startProfilId()` beim Start einmal ausliest und
 * anschliessend aus der Adresszeile raeumt: ein spaeterer Reload soll den
 * inzwischen gewaehlten Stand zeigen und nicht wieder ins geteilte Profil
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
    return new URL(`?${TEILEN_PARAM}=${encodeURIComponent(id)}`, document.baseURI).href;
  }

  /**
   * Link in die Zwischenablage legen und den Erfolg quittieren. `navigator.clipboard`
   * gibt es nur im Secure Context (HTTPS/localhost); auf einer per http
   * erreichten Instanz greift der execCommand-Weg, und wenn auch der scheitert,
   * zeigt ein Prompt den Link zum Kopieren von Hand.
   */
  async kopiereProfilLink(id: string): Promise<void> {
    const link = this.linkFuerProfil(id);
    if (await this.kopiere(link)) {
      this.toast.show('Link zum Teilen kopiert — er öffnet diese Profilierung direkt.');
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
   * id aus einem geteilten Link (einmalig beim Start). Der Parameter wird dabei
   * aus der Adresszeile entfernt (`history.replaceState`, kein Neuladen), damit
   * die Sitzung danach eine normale URL fuehrt.
   */
  startProfilId(): string | null {
    const url = new URL(window.location.href);
    const id = url.searchParams.get(TEILEN_PARAM);
    if (!id) return null;
    url.searchParams.delete(TEILEN_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    return id;
  }
}
