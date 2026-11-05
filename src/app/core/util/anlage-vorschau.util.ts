/**
 * Vorschau einer Datei der Testsendung — was laesst sich im Browser zeigen?
 * Rein und ohne DOM, damit die Entscheidung testbar bleibt; das Laden und die
 * Anzeige liegen bei `AnlagenVorschauService` und dem Vorschau-Dialog.
 */

/**
 * - `pdf`: eingebettet (Objekt-URL im iframe)
 * - `bild`: als `<img>` (PNG/JPEG/GIF; TIFF kann der Browser nicht)
 * - `xml`: als Text mit Hervorhebung
 * - `text`: als schlichter Text
 * - `binaer`: nur Kenndaten (Signaturen, TIFF, Unbekanntes)
 */
export type VorschauArt = 'pdf' | 'bild' | 'xml' | 'text' | 'binaer';

const BILD = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);
const TEXT = new Set(['txt', 'csv', 'json']);

/** Endung (klein, ohne Punkt) oder ''. */
export function endung(dateiname: string): string {
  const i = dateiname.lastIndexOf('.');
  return i < 0 ? '' : dateiname.slice(i + 1).toLowerCase();
}

/**
 * Die Art der Vorschau. Die Endung des Platzes entscheidet vor dem MIME-Typ —
 * der Platzname ist verbindlich (ADR 0024), der MIME-Typ kommt vom Browser
 * des Hochladenden und ist oft nur `application/octet-stream`.
 */
export function vorschauArt(dateiname: string, mime?: string | null): VorschauArt {
  const e = endung(dateiname);
  if (e === 'pdf') return 'pdf';
  if (e === 'xml') return 'xml';
  if (BILD.has(e)) return 'bild';
  if (TEXT.has(e)) return 'text';
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.endsWith('/xml') || m.endsWith('+xml')) return 'xml';
  if (m.startsWith('image/') && m !== 'image/tiff') return 'bild';
  if (m.startsWith('text/')) return 'text';
  return 'binaer';
}

/**
 * Bytes als Text lesen — mit der Kodierung, die die XML-Deklaration nennt
 * (XJustiz-Nachrichten sind UTF-8, Altbestand gelegentlich ISO-8859-1).
 * Unbekannte Kodierungen fallen auf UTF-8 zurueck.
 */
export function alsText(bytes: Uint8Array): string {
  const kopf = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const kod = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(kopf)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(kod).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Byte-Groesse lesbar: 980 B, 12,3 KB, 1,2 MB. */
export function groesseText(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}
