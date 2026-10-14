// Assemble les cartes de src/ en un seul module dist/material-home-cards.js (fichier chargé par HACS).
// Aucune dépendance : `node build.mjs`. Le serveur de dev (dev.mjs) réutilise bundle().
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const listJs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.js')).sort();

// En dev, chaque élément prend le suffixe -dev pour cohabiter avec la version installée par HACS.
const toDev = (code) => code
  .replace(/'(m3-(?:[a-z-]+?-card|badge)(?:-editor)?)'/g, "'$1-dev'")
  .replace(/name: '(M3 [^']+)'/g, "name: '$1 (dev)'");

export function bundle({ dev = false } = {}) {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const shared = listJs('src/shared');
  const cards = listJs('src');

  // Le code partagé (src/shared/) reste au niveau du module pour être visible de toutes les cartes.
  const sharedParts = shared.map((file) => `// ---- shared/${file} ----\n${readFileSync(`src/shared/${file}`, 'utf8').trimEnd()}`);
  // Chaque carte dans sa propre portée pour éviter les collisions de constantes (STYLE, SURFACE...).
  const cardParts = cards.map((file) => {
    const code = readFileSync(`src/${file}`, 'utf8').trimEnd();
    return `// ---- ${file} ----\n{\n${dev ? toDev(code) : code}\n}`;
  });

  const label = dev ? `${version}-dev` : version;
  const banner = `/*! Material Home Cards v${label} — https://github.com/laurentmichel/material-home-cards */`;
  const log = `console.info('%c MATERIAL-HOME-CARDS %c v${label} ', 'color:#fff;background:#6750a4;font-weight:700', 'color:#6750a4;background:#eaddff');`;

  return {
    code: `${banner}\n${log}\n\n${[...sharedParts, ...cardParts].join('\n\n')}\n`,
    cards,
    shared,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, cards, shared } = bundle();
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/material-home-cards.js', code);
  console.log(`dist/material-home-cards.js : ${cards.length} cartes (${cards.join(', ')}), partagé : ${shared.join(', ')}`);
}
