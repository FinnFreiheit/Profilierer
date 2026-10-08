// Erzeugt das Design-System-Bundle (design-system/) aus dem Styleguide der App:
// jede <section data-ds-card> der Ansicht `?ansicht=styleguide` wird als eigene
// Karte abgelegt — HTML mit `@dsCard`-Marker in der ersten Zeile — dazu das
// kompilierte Stylesheet unter _shared/ und die Kartenliste _karten.json.
// Das Bundle wird per DesignSync nach Claude Design gespiegelt (ADR 0022).
// Die Dateien unter design-system/ nicht von Hand pflegen: Aenderungen gehoeren
// nach src/styles.scss bzw. in den Styleguide, dann dieses Skript erneut laufen lassen.
//
// Aufruf:  npm run build && npm run design:bundle
//          npm run design:bundle -- --url http://localhost:4200   (laufender Dev-Server)
//          npm run design:bundle -- --inline                      (CSS je Karte einbetten)
/* global document */
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ziel = join(root, 'design-system');
const args = process.argv.slice(2);
const inline = args.includes('--inline');
const urlIdx = args.indexOf('--url');
const urlArg = urlIdx >= 0 ? args[urlIdx + 1] : null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xsd': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Build-Ausgabe finden (Angular 20: dist/<projekt>/browser). */
function distOrdner() {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) return null;
  for (const p of readdirSync(dist)) {
    const browser = join(dist, p, 'browser');
    if (existsSync(join(browser, 'index.html'))) return browser;
  }
  return null;
}

/** Statischer Mini-Server mit SPA-Fallback — nur fuer den Export, kein /api. */
function serviere(ordner) {
  const server = createServer((req, res) => {
    const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let datei = join(ordner, pfad);
    if (!datei.startsWith(ordner) || !existsSync(datei) || statSync(datei).isDirectory()) {
      datei = join(ordner, 'index.html');
    }
    res.writeHead(200, { 'content-type': MIME[extname(datei)] ?? 'application/octet-stream' });
    res.end(readFileSync(datei));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

/** Angular-Laufzeitspuren aus dem Markup entfernen; das Ergebnis ist reines HTML. */
function bereinige(html) {
  return html
    .replace(/\s_ng(?:content|host)-[\w-]+=""/g, '')
    .replace(/\sng-reflect-[\w-]+="[^"]*"/g, '')
    .replace(/\sng-version="[^"]*"/g, '')
    .replace(/\sclass=""/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*\n/g, '\n');
}

function karteHtml(k, css) {
  const kopf = inline
    ? `<style>\n${css}\n</style>`
    : '<link rel="stylesheet" href="../_shared/styles.css">';
  return [
    `<!-- @dsCard group="${k.group}" name="${k.name}" -->`,
    '<!doctype html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${k.name}</title>`,
    kopf,
    '</head>',
    '<body class="dsVorschau">',
    bereinige(k.html),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
} catch {
  console.error(
    'puppeteer/Chrome nicht gefunden. Erst "npx puppeteer browsers install chrome" ausfuehren.',
  );
  process.exit(1);
}

let server = null;
let basis = urlArg;
if (!basis) {
  const ordner = distOrdner();
  if (!ordner) {
    console.error(
      'Keine Build-Ausgabe unter dist/ — erst "npm run build" (oder --url <Dev-Server>).',
    );
    process.exit(1);
  }
  server = await serviere(ordner);
  basis = `http://127.0.0.1:${server.address().port}`;
}

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${basis}/?ansicht=styleguide`, { waitUntil: 'load' });
  await page.waitForSelector('[data-ds-card]', { timeout: 30_000 });

  const karten = await page.$$eval('[data-ds-card]', (els) =>
    els.map((el) => ({
      id: el.getAttribute('data-ds-card'),
      group: el.getAttribute('data-ds-group'),
      name: el.getAttribute('data-ds-name'),
      width: Number(el.getAttribute('data-ds-width') || 720),
      html: el.outerHTML,
    })),
  );
  // Das wirksame Stylesheet aus der Seite selbst — gilt fuer Build wie Dev-Server.
  const css = await page.evaluate(async () => {
    const teile = [];
    for (const l of document.querySelectorAll('link[rel="stylesheet"]')) {
      teile.push(await (await fetch(l.href)).text());
    }
    for (const s of document.querySelectorAll('style')) teile.push(s.textContent ?? '');
    return teile.join('\n');
  });
  if (!css.trim()) throw new Error('Kein Stylesheet in der Seite gefunden.');

  // Verwaiste Karten wegraeumen: alles ausser README und _shared neu aufbauen.
  if (existsSync(ziel)) {
    for (const p of readdirSync(ziel)) {
      if (p === 'README.md') continue;
      rmSync(join(ziel, p), { recursive: true, force: true });
    }
  }
  mkdirSync(join(ziel, '_shared'), { recursive: true });
  writeFileSync(join(ziel, '_shared', 'styles.css'), css);

  const liste = [];
  for (const k of karten) {
    const pfad = `${k.id}.html`;
    const datei = join(ziel, pfad);
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, karteHtml(k, css));
    liste.push({ name: k.name, path: pfad, group: k.group, viewport: { width: k.width } });
    console.log(`  ${pfad}`);
  }
  writeFileSync(join(ziel, '_karten.json'), JSON.stringify(liste, null, 2) + '\n');
  console.log(
    `${karten.length} Karten nach design-system/ geschrieben (${inline ? 'CSS eingebettet' : '_shared/styles.css'}).`,
  );
} finally {
  await browser.close();
  server?.close();
}
