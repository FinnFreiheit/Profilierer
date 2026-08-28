import { clearInterval, setInterval } from 'node:timers';
import { lokalerTag, stundenBeginn, tagPlus } from './zeit.js';

/**
 * Anonyme Nutzungszaehlung (#kennzahlen). Gezaehlt werden ausschliesslich
 * API-Zugriffe: Zeitpunkt, normalisierte Route, Status, Dauer und eine im
 * Browser erzeugte Zufallskennung (Header x-klient). Keine IP-Adressen, keine
 * Namen, keine Inhalte.
 *
 * Geschrieben wird gebuendelt: die Middleware bucht nur in zwei Maps, der
 * Puffer schreibt alle paar Sekunden in einer Transaktion. better-sqlite3
 * arbeitet synchron -- eine Zeile je Request wuerde den Event-Loop bei jedem
 * Zugriff blockieren, und die SPA feuert beim Seitenaufbau schon mehrere.
 * Preis: ein harter Abbruch (SIGKILL) verliert das laufende Intervall.
 */

/** Ressourcen und Unterpfade der API — alles andere faellt auf /api/sonstige. */
const BEKANNT = new Set([
  'profiles',
  'testmessages',
  'projekte',
  'schemas',
  'kennzahlen',
  'login',
  'import',
  'hinweise',
  'versions',
  'restore',
  'duplicate',
  'abnahme',
  'ablage',
  'xml',
  'entscheidungen',
  'bezeichnungen',
  'vorgabe',
  'profil',
  'files',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^\d+(\.\d+)+$/;

/** Form der Klient-Kennung (UUID); alles andere gilt als "ohne Kennung". */
const KLIENT_FORM = /^[0-9a-fA-F-]{16,64}$/;

/** Sammelschluessel fuer Zugriffe ohne Klient-Kennung (curl, Monitoring). */
export const OHNE_KENNUNG = '-';

/**
 * Request-Pfad auf eine zaehlbare Route abbilden, oder `null` wenn er nicht
 * zaehlt (alles ausserhalb /api, OPTIONS, der Kennzahlen-Abruf selbst — der
 * wuerde sonst die eigene Auswertung in die Spitzenreiter schieben).
 *
 * Kennungen werden zu :id, Versionsnummern zu :version. Unbekannte Segmente
 * enden gesammelt auf /api/sonstige: ohne diesen Deckel blaeht ein Scanner die
 * Tabelle mit Muellrouten auf.
 */
export function normalisiereRoute(method, pfad) {
  const m = String(method || '').toUpperCase();
  if (m === 'OPTIONS') return null;
  if (pfad !== '/api' && !pfad.startsWith('/api/')) return null;

  const segmente = pfad.split('/').filter(Boolean).slice(1);
  if (!segmente.length) return null;
  if (m === 'GET' && segmente[0] === 'kennzahlen') return null;
  // Tiefste echte Route: profiles/:id/versions/:vid/restore.
  if (segmente.length > 5) return `${m} /api/sonstige`;

  const teile = [];
  for (const s of segmente) {
    if (UUID.test(s)) teile.push(':id');
    else if (VERSION.test(s)) teile.push(':version');
    else if (BEKANNT.has(s)) teile.push(s);
    else return `${m} /api/sonstige`;
  }
  return `${m} /api/${teile.join('/')}`;
}

/** Kennung aus dem Header lesen; fehlt oder passt sie nicht, zaehlt sie als OHNE_KENNUNG. */
export function klientKennung(wert) {
  return typeof wert === 'string' && KLIENT_FORM.test(wert) ? wert : OHNE_KENNUNG;
}

/**
 * Zaehler samt Puffer. `flush()` ist exportiert, damit Tests deterministisch
 * bleiben (kein Warten auf den Timer) und der Server beim Herunterfahren die
 * letzten Zugriffe noch wegschreiben kann.
 */
export function nutzungZaehler(db, { intervallMs = 5000, aufbewahrung = 30 } = {}) {
  const stunden = new Map(); // `${stunde}|${route}`
  const klienten = new Map(); // `${tag}|${klient}`
  let letzteVerdichtung = null;

  const buche = (route, klient, status, dauerUs, jetzt) => {
    const tag = lokalerTag(jetzt);
    const stunde = stundenBeginn(jetzt);
    const sk = `${stunde}|${route}`;
    const s = stunden.get(sk) ?? {
      tag,
      stunde,
      route,
      zugriffe: 0,
      fehler: 0,
      dauerSumme: 0,
      dauerMax: 0,
    };
    s.zugriffe++;
    if (status >= 400) s.fehler++;
    s.dauerSumme += dauerUs;
    s.dauerMax = Math.max(s.dauerMax, dauerUs);
    stunden.set(sk, s);

    const kk = `${tag}|${klient}`;
    const k = klienten.get(kk) ?? { tag, klient, zugriffe: 0, zuletzt: jetzt };
    k.zugriffe++;
    k.zuletzt = jetzt;
    klienten.set(kk, k);
  };

  const flush = () => {
    if (!stunden.size && !klienten.size) return;
    const s = [...stunden.values()];
    const k = [...klienten.values()];
    stunden.clear();
    klienten.clear();
    try {
      db.nutzungSchreiben(s, k);
    } catch (e) {
      // Nutzungszahlen sind Beiwerk: ein Schreibfehler darf den Betrieb nicht
      // stoeren. Die gepufferten Zugriffe sind dann verloren.
      console.warn('[xjp] Nutzungszaehlung: Schreiben fehlgeschlagen:', e.message);
    }
  };

  /** Rohdaten aelter als die Aufbewahrung zu Tageszeilen verdichten (einmal je Kalendertag). */
  const verdichteBeiTageswechsel = () => {
    const heute = lokalerTag();
    if (heute === letzteVerdichtung) return;
    letzteVerdichtung = heute;
    try {
      db.nutzungVerdichten(tagPlus(heute, -aufbewahrung));
    } catch (e) {
      console.warn('[xjp] Nutzungszaehlung: Verdichtung fehlgeschlagen:', e.message);
    }
  };

  const middleware = (req, res, next) => {
    const route = normalisiereRoute(req.method, req.path);
    if (!route) return next();
    const klient = klientKennung(req.get('x-klient'));
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      // Mikrosekunden: lokale Antworten liegen unter einer Millisekunde und
      // wuerden sonst als 0 gezaehlt — das Mittel waere immer "keine Zeit".
      const dauerUs = Number((process.hrtime.bigint() - start) / 1000n);
      buche(route, klient, res.statusCode, dauerUs, Date.now());
    });
    next();
  };

  const timer = setInterval(() => {
    flush();
    verdichteBeiTageswechsel();
  }, intervallMs);
  // Ohne unref haelt der Timer `node --test` und jedes Skript am Leben.
  timer.unref?.();

  return { middleware, flush, verdichteBeiTageswechsel, stop: () => clearInterval(timer) };
}
