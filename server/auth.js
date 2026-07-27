import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

/**
 * Zwei-Rollen-Konzept der Abnahme-Story: die AG-Rolle (BLK-AG IT-Standards)
 * weist sich ueber einen gemeinsamen Schluessel aus (Umgebungsvariable
 * XJP_AG_KEY), alle anderen sind "Extern". Ohne konfigurierten Schluessel
 * existiert die Rolle nicht — das Werkzeug verhaelt sich wie zuvor.
 *
 * `agAuth(agKey)` ist eine Fabrik (kein Singleton), damit Tests die App mit
 * und ohne Schluessel montieren koennen.
 */
export function agAuth(agKey) {
  const schluessel = typeof agKey === 'string' ? agKey.trim() : '';
  const konfiguriert = schluessel.length > 0;

  /** Konstantzeitiger Vergleich; Laengen-Leck ist hier unkritisch. */
  const pruefe = (kandidat) => {
    if (!konfiguriert || typeof kandidat !== 'string') return false;
    const a = Buffer.from(schluessel);
    const b = Buffer.from(kandidat);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  /** Traegt der Request den gueltigen AG-Schluessel (Header x-ag-key)? */
  const istAg = (req) => pruefe(req.get('x-ag-key') ?? '');

  return { konfiguriert, pruefe, istAg };
}
