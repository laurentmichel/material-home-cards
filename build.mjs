// Assemble les cartes de src/ en un seul module dist/material-home-cards.js (fichier chargé par HACS).
// Aucune dépendance : `node build.mjs`.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const cards = readdirSync('src').filter((f) => f.endsWith('.js')).sort();

const parts = cards.map((file) => {
  const code = readFileSync(`src/${file}`, 'utf8').trimEnd();
  // Chaque carte dans sa propre portée pour éviter les collisions de constantes (STYLE, SURFACE...).
  return `// ---- ${file} ----\n{\n${code}\n}`;
});

const banner = `/*! Material Home Cards v${version} — https://github.com/laurentmichel/material-home-cards */`;
const log = `console.info('%c MATERIAL-HOME-CARDS %c v${version} ', 'color:#fff;background:#6750a4;font-weight:700', 'color:#6750a4;background:#eaddff');`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/material-home-cards.js', `${banner}\n${log}\n\n${parts.join('\n\n')}\n`);
console.log(`dist/material-home-cards.js : ${cards.length} cartes (${cards.join(', ')})`);
