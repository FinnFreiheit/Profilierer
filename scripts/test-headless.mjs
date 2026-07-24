// Fuehrt die Unit-Tests headless aus. Nutzt das per puppeteer installierte
// "Chrome for Testing" als CHROME_BIN, damit keine System-Chrome-Installation
// noetig ist. Aufruf:  npm run test:ci
import { spawnSync } from 'node:child_process';

let chromeBin = process.env.CHROME_BIN;
if (!chromeBin) {
  try {
    const puppeteer = (await import('puppeteer')).default;
    chromeBin = await puppeteer.executablePath();
  } catch {
    console.error(
      'puppeteer/Chrome nicht gefunden. Erst "npx puppeteer browsers install chrome" ausfuehren.',
    );
    process.exit(1);
  }
}

const res = spawnSync('npx', ['ng', 'test', '--watch=false', '--browsers=ChromeHeadless'], {
  stdio: 'inherit',
  env: { ...process.env, CHROME_BIN: chromeBin },
});
process.exit(res.status ?? 1);
