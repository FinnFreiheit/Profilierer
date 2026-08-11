import { Injectable, inject } from '@angular/core';
import { StateService } from './state.service';

/** Download-Helfer und Profil-Dateinamen (Profilierer.html Z.1772-1781). */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly state = inject(StateService);

  download(name: string, content: BlobPart, mime = 'application/octet-stream'): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /**
   * Dateiname einer heruntergeladenen Testnachricht. Namen im Testspeicher sind
   * frei vergeben („Quelle (bearbeitet 26.08.06)") und tragen die Endung nicht
   * zwingend — heruntergeladen wird aber immer eine `.xml`. Ein `zusatz` (z. B.
   * `.abgenommen`) haengt vor der Endung, nicht dahinter.
   */
  xmlFilename(name: string, zusatz = ''): string {
    const basis =
      (name ?? '')
        .trim()
        .replace(/\.xml$/i, '')
        .trim() || 'testnachricht';
    return `${basis}${zusatz}.xml`;
  }

  profilFilename(ext: string): string {
    const n = (this.state.meta().name || 'Profil').replace(/[^\wäöüÄÖÜß-]+/g, '_');
    const msg = (this.state.msgName() || '').split('.').slice(1, -1).join('.') || 'xjustiz';
    return `${n}_${msg}.${ext}`;
  }
}
