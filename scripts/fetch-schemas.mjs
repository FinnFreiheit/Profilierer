// Aktualisiert die im Projekt hinterlegten XJustiz-Schemata (public/schemas/)
// aus den auf xjustiz.de veroeffentlichten ZIP-Paketen. xjustiz.de fuehrt immer
// den aktuellen Stand — auch Nachlieferungen, die eine bestehende Version
// (z. B. 3.6.2) nachtraeglich aendern.
//
// Aufruf:  npm run schemas:fetch            (alle dort veroeffentlichten Versionen)
//          npm run schemas:fetch -- 3.6.2   (nur bestimmte Versionen)
//          npm run schemas:fetch -- --dry   (nur berichten, nichts schreiben)
//
// Ablauf: Versionsseite lesen → XSD-ZIP je Version laden → nach
// public/schemas/<version>/ entpacken (nur *.xsd, flach) → Manifest neu bauen
// (scripts/gen-schema-manifest.mjs). Geaendert/neu/entfernt wird berichtet.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const XJUSTIZ = 'https://xjustiz.justiz.de';
const VERSIONSSEITE = '/XJustiz-Versionen/index.php';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'public', 'schemas');

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const nurVersionen = argv.filter((a) => !a.startsWith('--'));

/** Schema-ZIP-Links der Versionsseite (gleiche Logik wie im RemoteSchemaService). */
function parseVersionsseite(html) {
  const gefunden = new Map();
  for (const m of html.matchAll(/href="([^"]+\.zip)"/gi)) {
    const href = m[1];
    const datei = href.split(/[/\\]/).pop() || '';
    if (!/xsd|schemata/i.test(datei)) continue;
    if (/schematron|[._-]sch[._-]/i.test(datei)) continue;
    const v = datei.match(/(\d+)[._-](\d+)(?:[._-](\d+))?/);
    if (!v) continue;
    const version = [v[1], v[2], v[3] ?? '0'].join('.');
    if (gefunden.has(version)) continue;
    gefunden.set(version, {
      version,
      url: new URL(href, XJUSTIZ + VERSIONSSEITE).href,
      datei,
    });
  }
  return [...gefunden.values()].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  );
}

async function hole(url, alsText = false) {
  const r = await fetch(url, { headers: { 'User-Agent': 'XJustiz-Profilierer (schemas:fetch)' } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return alsText ? r.text() : Buffer.from(await r.arrayBuffer());
}

/** XSDs eines ZIP-Pakets, flach (Ordner im Archiv wird abgeschnitten). */
async function xsdsAusZip(buf) {
  const zip = await JSZip.loadAsync(buf);
  const out = new Map();
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || !name.toLowerCase().endsWith('.xsd')) continue;
    out.set(name.split(/[/\\]/).pop(), await entry.async('nodebuffer'));
  }
  return out;
}

const seite = await hole(XJUSTIZ + VERSIONSSEITE, true);
let versionen = parseVersionsseite(seite);
if (!versionen.length) {
  console.error('Auf der Versionsseite von xjustiz.de wurden keine Schema-ZIPs gefunden.');
  process.exit(1);
}
if (nurVersionen.length) {
  const gewuenscht = new Set(nurVersionen);
  const fehlend = nurVersionen.filter((v) => !versionen.some((x) => x.version === v));
  if (fehlend.length) {
    console.error(
      `Nicht auf xjustiz.de veroeffentlicht: ${fehlend.join(', ')} — verfuegbar: ` +
        versionen.map((v) => v.version).join(', '),
    );
    process.exit(1);
  }
  versionen = versionen.filter((v) => gewuenscht.has(v.version));
}

console.log(`xjustiz.de: ${versionen.map((v) => v.version).join(', ')}`);
let geaendertGesamt = 0;

for (const v of versionen) {
  const ziel = join(base, v.version);
  const dateien = await xsdsAusZip(await hole(v.url));
  const vorhanden = existsSync(ziel)
    ? readdirSync(ziel).filter((f) => f.toLowerCase().endsWith('.xsd'))
    : [];

  const neu = [];
  const geaendert = [];
  for (const [name, inhalt] of dateien) {
    const pfad = join(ziel, name);
    if (!existsSync(pfad)) neu.push(name);
    else if (!readFileSync(pfad).equals(inhalt)) geaendert.push(name);
  }
  const entfernt = vorhanden.filter((f) => !dateien.has(f));

  console.log(
    `\n${v.version} (${v.datei}): ${dateien.size} Schemata — ` +
      `${neu.length} neu, ${geaendert.length} geaendert, ${entfernt.length} entfallen`,
  );
  for (const n of neu) console.log(`  + ${n}`);
  for (const n of geaendert) console.log(`  ~ ${n}`);
  for (const n of entfernt) console.log(`  - ${n}`);
  geaendertGesamt += neu.length + geaendert.length + entfernt.length;

  if (dry) continue;
  mkdirSync(ziel, { recursive: true });
  for (const n of entfernt) rmSync(join(ziel, n));
  for (const [name, inhalt] of dateien) {
    const pfad = join(ziel, name);
    if (!existsSync(pfad) || !readFileSync(pfad).equals(inhalt)) writeFileSync(pfad, inhalt);
  }
}

if (dry) {
  console.log('\n--dry: nichts geschrieben.');
  process.exit(0);
}

// Manifest neu aufbauen (uebernimmt label/default/Reihenfolge aus der alten index.json).
execFileSync(process.execPath, [join(root, 'scripts', 'gen-schema-manifest.mjs')], {
  stdio: 'inherit',
});
console.log(
  geaendertGesamt
    ? `\nFertig — ${geaendertGesamt} Dateiaenderungen uebernommen.`
    : '\nFertig — die hinterlegten Schemata waren bereits aktuell.',
);
