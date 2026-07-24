// Erzeugt das Manifest der im Projekt hinterlegten XJustiz-Schemata
// (public/schemas/index.json). Jeder Unterordner unter public/schemas/ ist eine
// Version; die *.xsd-Dateien werden je Ordner aufgelistet. Der BundledSchemaService
// liest dieses Manifest und lädt die Dateien per fetch (kein XSD-Ordner-Upload).
//
// Aufruf:  npm run schemas:manifest   (nach dem Hinzufügen/Austauschen von XSDs)
//
// Bestehende Metadaten (label, default, Reihenfolge) aus einer vorhandenen
// index.json bleiben erhalten; nur die Dateilisten werden neu aufgebaut. Neue
// Ordner werden mit label = Ordnername ergänzt.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'public', 'schemas');
const manifestPath = join(base, 'index.json');

if (!existsSync(base)) {
  mkdirSync(base, { recursive: true });
  console.error(`Kein Schema-Verzeichnis gefunden — angelegt: ${base}`);
  console.error(
    'Versionsordner (z. B. public/schemas/3.6.2/) mit XSDs anlegen und erneut ausführen.',
  );
  process.exit(1);
}

// Vorhandene Metadaten übernehmen (Reihenfolge, label, default).
let prev = [];
if (existsSync(manifestPath)) {
  try {
    prev = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    console.warn('Vorhandene index.json nicht lesbar — wird neu erzeugt.');
  }
}
const prevByDir = new Map(prev.map((v) => [v.dir, v]));

const dirs = readdirSync(base)
  .filter((name) => statSync(join(base, name)).isDirectory())
  .sort();

if (!dirs.length) {
  console.error(`Keine Versionsordner unter ${base} gefunden.`);
  process.exit(1);
}

// Reihenfolge: erst die aus der alten index.json bekannten (in alter Reihenfolge),
// dann neue Ordner alphabetisch.
const ordered = [
  ...prev.map((v) => v.dir).filter((d) => dirs.includes(d)),
  ...dirs.filter((d) => !prevByDir.has(d)),
];

const manifest = ordered.map((dir) => {
  const meta = prevByDir.get(dir) || {};
  const files = readdirSync(join(base, dir))
    .filter((f) => f.toLowerCase().endsWith('.xsd'))
    .sort();
  return {
    id: meta.id || dir,
    label: meta.label || dir,
    dir,
    ...(meta.default ? { default: true } : {}),
    files,
  };
});

// Sicherstellen, dass genau eine Standardversion existiert.
if (!manifest.some((v) => v.default) && manifest[0]) manifest[0].default = true;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest geschrieben: ${manifestPath}`);
for (const v of manifest) {
  console.log(`  ${v.id}${v.default ? ' (Standard)' : ''}: ${v.files.length} Schemata`);
}
