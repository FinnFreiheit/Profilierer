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

  profilFilename(ext: string): string {
    const n = (this.state.meta().name || 'Profil').replace(/[^\wäöüÄÖÜß-]+/g, '_');
    const msg = (this.state.msgName() || '').split('.').slice(1, -1).join('.') || 'xjustiz';
    return `${n}_${msg}.${ext}`;
  }
}
