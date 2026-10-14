// Serveur de dev : sert la version -dev des cartes et recharge Home Assistant à chaque sauvegarde dans src/.
// `npm run dev`, puis ajouter http://<ip-du-pc>:5000/material-home-cards-dev.js comme ressource Lovelace (module).
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT ?? 5000);
const clients = new Set();

// Ajouté à la fin du bundle de dev : la page HA se recharge quand le serveur signale une modification.
const LIVE_RELOAD = `
{
  const origin = new URL(import.meta.url).origin;
  const events = new EventSource(origin + '/events');
  events.addEventListener('reload', () => location.reload());
}`;

let current;
let buildError;
let cards = [];
// build.mjs est réimporté à chaque fois : une modification du script de build est prise en compte sans redémarrer.
const rebuild = async () => {
  try {
    const { bundle } = await import(`./build.mjs?t=${Date.now()}`);
    const result = bundle({ dev: true });
    current = result.code + LIVE_RELOAD;
    cards = result.cards;
    buildError = null;
    return true;
  } catch (err) {
    buildError = err;
    console.error(`✗ build : ${err.message}`);
    return false;
  }
};
await rebuild();

const server = createServer((req, res) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (req.url.startsWith('/material-home-cards-dev.js')) {
    if (buildError) {
      res.writeHead(500, headers).end(`console.error(${JSON.stringify(`material-home-cards (dev) : ${buildError.message}`)});`);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' }).end(current);
  } else if (req.url === '/events') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
    res.write(': connecté\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else {
    res.writeHead(404, headers).end();
  }
});

// Plusieurs événements arrivent pour une même sauvegarde : on regroupe sur 150 ms.
let timer;
const onChange = (file) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!(await rebuild())) return;
    console.log(`↻ ${file} — ${clients.size} page(s) rechargée(s)`);
    for (const client of clients) client.write('event: reload\ndata: \n\n');
  }, 150);
};
watch('src', { recursive: true }, (_event, file) => onChange(file));
watch('build.mjs', () => onChange('build.mjs'));

server.listen(PORT, () => {
  // Les interfaces Docker / bridges virtuels ne sont pas joignables depuis le réseau local.
  const ips = Object.entries(networkInterfaces())
    .filter(([name]) => !/^(docker|br-|veth|virbr)/.test(name))
    .flatMap(([, addrs]) => addrs)
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log('Material Home Cards — serveur de dev');
  for (const ip of ips) console.log(`  Ressource Lovelace (module) : http://${ip}:${PORT}/material-home-cards-dev.js`);
  const types = cards.map((f) => `custom:${f.replace(/\.js$/, '')}-dev`);
  console.log(`  Types de cartes : ${types.join(', ')}`);
  console.log('  En attente de modifications dans src/ et build.mjs …');
});
