// Extrait de @mdi/js les icônes utilisées par les pages de démo vers icons.js (évite une dépendance).
// Usage : npm i --no-save @mdi/js && node docs/demo/icons.mjs
import { writeFileSync } from 'node:fs';
import * as mdi from '@mdi/js';

const ICONS = [
  'arrow-up', 'stop', 'arrow-down', 'battery', 'battery-20', 'battery-80', 'battery-90', 'battery-10',
  'weather-sunny', 'weather-night', 'cctv', 'brightness-5', 'sofa-outline', 'movie-open-outline',
  'party-popper', 'circle-outline',
];

const camel = (name) => `mdi${name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('')}`;
const out = Object.fromEntries(ICONS.map((name) => {
  const path = mdi[camel(name)];
  if (!path) throw new Error(`Unknown icon: ${name}`);
  return [`mdi:${name}`, path];
}));
writeFileSync(new URL('./icons.js', import.meta.url), `// Généré par icons.mjs — Material Design Icons (Pictogrammers, Apache 2.0).\nwindow.MDI = ${JSON.stringify(out, null, 1)};\n`);
console.log(`icons.js : ${ICONS.length} icônes`);
