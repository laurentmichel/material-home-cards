// Assemble les cartes de src/ en un seul module dist/material-home-cards.js (fichier chargé par HACS).
// Aucune dépendance : `node build.mjs`.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const listJs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const shared = listJs('src/shared');
const cards = listJs('src');

// Le code partagé (src/shared/) reste au niveau du module pour être visible de toutes les cartes.
const sharedParts = shared.map((file) => `// ---- shared/${file} ----\n${readFileSync(`src/shared/${file}`, 'utf8').trimEnd()}`);
// Chaque carte dans sa propre portée pour éviter les collisions de constantes (STYLE, SURFACE...).
const cardParts = cards.map((file) => `// ---- ${file} ----\n{\n${readFileSync(`src/${file}`, 'utf8').trimEnd()}\n}`);

const banner = `/*! Material Home Cards v${version} — https://github.com/laurentmichel/material-home-cards */`;
const log = `console.info('%c MATERIAL-HOME-CARDS %c v${version} ', 'color:#fff;background:#6750a4;font-weight:700', 'color:#6750a4;background:#eaddff');`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/material-home-cards.js', `${banner}\n${log}\n\n${[...sharedParts, ...cardParts].join('\n\n')}\n`);
console.log(`dist/material-home-cards.js : ${cards.length} cartes (${cards.join(', ')}), partagé : ${shared.join(', ')}`);
