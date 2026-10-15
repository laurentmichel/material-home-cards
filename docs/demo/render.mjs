// Génère les captures du README (docs/images/<page>.png) à partir des pages de démo, avec des données fictives :
// sombre à gauche, clair à droite, en 2x. Nécessite Brave ou Chromium (variable SCREENSHOT_BROWSER pour un autre chemin).
// Usage : npm run build && node docs/demo/render.mjs [scene cover camera…]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const demoDir = fileURLToPath(new URL('.', import.meta.url));
const imagesDir = fileURLToPath(new URL('../images/', import.meta.url));
const WIDTH = 900;

const browser = process.env.SCREENSHOT_BROWSER
  ?? ['/usr/bin/brave', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((path) => existsSync(path));
if (!browser) throw new Error('Brave or Chromium not found: set SCREENSHOT_BROWSER=/path/to/browser');

const run = (args) => execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--virtual-time-budget=3000', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const pages = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(demoDir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

for (const page of pages) {
  const url = `file://${demoDir}${page}.html`;
  // Hauteur du contenu (mesurée par common.js), pour une capture sans marge vide.
  const height = Number(run([`--window-size=${WIDTH},2000`, '--dump-dom', url]).match(/data-h="(\d+)"/)?.[1]);
  if (!height) throw new Error(`${page}: content height not found`);
  run([`--window-size=${WIDTH},${height}`, '--force-device-scale-factor=2', `--screenshot=${imagesDir}${page}.png`, url]);
  console.log(`docs/images/${page}.png (${WIDTH * 2}×${height * 2})`);
}
