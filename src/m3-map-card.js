// m3-map-card — carte d'un robot (tondeuse Dreame...) redessinée en Material 3.
// Deux sources possibles :
//  - une entité lawn_mower de l'intégration dreame_mower (v2+) : la géométrie arrive en vecteurs par la
//    commande websocket « dreame_mower/map/subscribe », dessinée ici entièrement avec les jetons du thème ;
//  - une caméra « carte » (dreame_mower v1, autres robots) : son SVG est nettoyé, recoloré et recadré.
const STYLE = `
:host { display: block; }
ha-card {
  position: relative; overflow: hidden; box-sizing: border-box; padding: 16px;
  border-radius: 28px; border: none; box-shadow: none; cursor: pointer;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  --m3-lawn: var(--m3-map-lawn, #6abf69);
  --m3-path: var(--m3-map-path, #a5d6a7);
  --m3-obstacle: var(--md-sys-color-on-surface, var(--primary-text-color));
  --m3-mower: var(--md-sys-color-primary, var(--primary-color));
  --m3-error: var(--md-sys-color-error, var(--error-color, #b3261e));
}
.map { display: flex; align-items: center; justify-content: center; min-height: 120px; }
.map svg { width: 100%; height: auto; max-height: var(--m3-map-height, 360px); display: block; overflow: visible; }
.map img { width: 100%; max-height: var(--m3-map-height, 360px); object-fit: contain; border-radius: 16px; }
.boundary { fill: color-mix(in srgb, var(--m3-lawn) 22%, transparent); stroke: var(--m3-lawn); stroke-width: 3; stroke-linejoin: round; }
.mowed { stroke: var(--m3-path); stroke-opacity: 0.55; fill: none; }
.obstacle { fill: color-mix(in srgb, var(--m3-obstacle) 18%, transparent); stroke: color-mix(in srgb, var(--m3-obstacle) 45%, transparent); stroke-width: 1.5; }
.mower { fill: var(--m3-mower); stroke: var(--md-sys-color-on-primary, #fff); stroke-width: 3; }
.mower-halo { fill: var(--m3-mower); opacity: 0.25; }
/* Rendu vectoriel (dreame_mower v2) : traits en pixels écran, quelle que soit la taille du terrain. */
.v * { vector-effect: non-scaling-stroke; }
.v .lawn { fill: color-mix(in srgb, var(--m3-lawn) 30%, transparent); stroke: var(--m3-lawn); stroke-width: 2.5; stroke-linejoin: round; }
.v .link { fill: none; stroke: color-mix(in srgb, var(--m3-lawn) 35%, transparent); stroke-linecap: round; stroke-linejoin: round; }
.v .working { fill: none; stroke: var(--m3-mower); stroke-width: 2.5; stroke-dasharray: 8 5; }
.v .trail { fill: none; stroke: var(--m3-path); stroke-opacity: 0.7; stroke-linecap: round; stroke-linejoin: round; }
.v .trail, .v .link { vector-effect: none; }
.v .nogo { fill: color-mix(in srgb, var(--m3-error) 16%, transparent); stroke: var(--m3-error); stroke-width: 1.5; stroke-dasharray: 5 4; }
.v .nogo-line { fill: none; stroke: var(--m3-error); stroke-width: 3; stroke-linecap: round; }
.v .ignore { fill: color-mix(in srgb, var(--md-sys-color-tertiary, #7d5260) 14%, transparent); stroke: var(--md-sys-color-tertiary, #7d5260); stroke-width: 1.5; stroke-dasharray: 2 3; }
.v .obstacle { fill: color-mix(in srgb, var(--m3-obstacle) 55%, transparent); stroke: var(--md-sys-color-surface-container-high, #fff); stroke-width: 1.5; }
.v .dock { fill: var(--md-sys-color-secondary-container, #e8def8); stroke: var(--md-sys-color-on-secondary-container, #1d192b); stroke-width: 1.5; }
.v .dock-icon { fill: var(--md-sys-color-on-secondary-container, #1d192b); }
.v .mower { fill: var(--m3-mower); stroke: var(--md-sys-color-on-primary, #fff); stroke-width: 2.5; }
.v .mower-halo { fill: var(--m3-mower); opacity: 0.22; stroke: none; }
.v .heading { fill: var(--md-sys-color-on-primary, #fff); stroke: none; }
.v .label { fill: var(--md-sys-color-on-surface, var(--primary-text-color)); opacity: 0.75; font-weight: 500; }
.chip {
  position: absolute; top: 14px; left: 14px; display: flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px;
  border-radius: 16px; font-size: 13px; font-weight: 500; --mdc-icon-size: 18px;
  background: color-mix(in srgb, var(--md-sys-color-surface-container-highest, #444) 85%, transparent);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.chip:empty, :host(:not([has-chip])) .chip { display: none; }
.empty { ${STATE_FONT} padding: 40px 0; }
`;

// Couleurs du rendu SVG de la caméra Dreame Mower v1 → rôle de chaque élément.
const ROLES = [
  { role: 'boundary', match: (el) => el.getAttribute('stroke') === '#006400' },
  { role: 'mowed', match: (el) => el.getAttribute('stroke') === '#ffa500' },
  { role: 'obstacle', match: (el) => el.getAttribute('stroke') === '#ff4d00' },
  { role: 'mower', match: (el) => el.tagName === 'circle' && el.getAttribute('fill') === '#ff0000' },
];
const MIN_RELOAD_MS = 10 * 1000;

// Flux vectoriel dreame_mower : unités en millimètres, y vers le haut sur la carte.
const DREAME_SUBSCRIBE = 'dreame_mower/map/subscribe';
const RETRY_MS = [2000, 5000, 10000, 30000];
const MAP_MARGIN = 0.04; // marge autour du terrain, en part de sa plus grande dimension
const LINK_WIDTH = 550; // largeur des chemins entre zones (mm)
const TRAIL_WIDTH = 400; // largeur de coupe (mm)
const HOME_ICON = 'M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z'; // mdi:home, 24×24

const pairsOf = (flat = []) => {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};
const fmt = (n) => (Math.round(n * 10) / 10).toString();
const escapeXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Passage des coordonnées de la tondeuse (mm, y vers le haut) à l'écran (y vers le bas), avec rotation par quarts de tour.
function mapTransform([x1, y1, x2, y2], rotation) {
  const W = Math.max(x2 - x1, 1);
  const H = Math.max(y2 - y1, 1);
  const rot = (((Math.round((rotation || 0) / 90) * 90) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  return {
    rot,
    width: swap ? H : W,
    height: swap ? W : H,
    at(x, y) {
      const X = x - x1;
      const Y = y2 - y;
      if (rot === 90) return [H - Y, X];
      if (rot === 180) return [W - X, H - Y];
      if (rot === 270) return [Y, W - X];
      return [X, Y];
    },
  };
}

function centroid(points) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const f = xj * yi - xi * yj;
    a += f; cx += (xj + xi) * f; cy += (yj + yi) * f;
  }
  if (!a) return points[0];
  return [cx / (3 * a), cy / (3 * a)];
}

class M3MapCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { domain: ['lawn_mower', 'camera'] } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'mower', selector: { entity: { domain: ['lawn_mower', 'vacuum'] } } },
        { name: 'battery', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
        { name: 'lawn_color', selector: { text: {} } },
        { name: 'height', selector: { number: { min: 150, max: 800, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
      ],
    },
    { name: 'show_trail', selector: { boolean: {} } },
  ];

  static labels = {
    entity: 'Map source', mower: 'Robot', battery: 'Battery', lawn_color: 'Lawn color', height: 'Max height',
    show_trail: 'Show the mowed lanes',
  };

  static helpers = {
    entity: 'Dreame mower (live vector map) or a map camera',
    mower: 'Optional: its state is shown in a chip on the map',
    lawn_color: 'CSS color, empty: green',
  };
}

class M3MapCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-map-card-editor');
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass.states);
    return {
      entity: ids.find((e) => e.startsWith('lawn_mower.'))
        ?? ids.find((e) => e.startsWith('camera.') && /map|carte/.test(e)) ?? 'lawn_mower.example',
    };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-map-card: "entity" (lawn_mower or camera) is required');
    const previous = this._config?.entity;
    this._config = config;
    this._vector = config.entity.startsWith('lawn_mower.');
    if (!this.shadowRoot) this._build();
    const st = this._card.style;
    st.setProperty('--m3-map-height', `${Number(config.height) || 360}px`);
    if (config.lawn_color) st.setProperty('--m3-map-lawn', config.lawn_color);
    else st.removeProperty('--m3-map-lawn');
    this.toggleAttribute('has-chip', !!(this._mowerId() || config.battery));
    this._url = null;
    this._chipKey = null;
    if (previous !== config.entity) {
      this._unsubscribe();
      this._geometry = null;
      this._status = null;
      this._trail = [];
      this._map.innerHTML = `<div class="empty">${t(this._hass, 'Loading the map…')}</div>`;
    }
    this._drawKey = null;
    if (this._hass) this._update();
  }

  getCardSize() { return 6; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  connectedCallback() {
    if (this._hass && this._config) this._update();
  }

  disconnectedCallback() {
    this._unsubscribe();
    clearTimeout(this._retryTimer);
    clearTimeout(this._reloadTimer);
  }

  _mowerId() {
    return this._config.mower ?? (this._vector ? this._config.entity : undefined);
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card><div class="map"><div class="empty">${t(this._hass, 'Loading the map…')}</div></div><div class="chip"></div></ha-card>`;
    this._card = root.querySelector('ha-card');
    this._map = root.querySelector('.map');
    this._chip = root.querySelector('.chip');
    this._trail = [];
    this._card.addEventListener('click', () => {
      this._fire('hass-more-info', { entityId: this._mowerId() ?? this._config.entity });
    });
  }

  _update() {
    if (!this._card || !this._hass) return;
    this._renderChip();
    if (this._vector) this._updateVector();
    else this._updateCamera();
  }

  // ---- Source vectorielle : dreame_mower v2 ----

  _updateVector() {
    if (this._sub || this._retryTimer || !this.isConnected) return;
    const st = this._hass.states[this._config.entity];
    if (!st || st.state === 'unavailable') {
      this._map.innerHTML = `<div class="empty">${t(this._hass, 'Map unavailable')}</div>`;
      return;
    }
    this._subscribe();
  }

  _subscribe() {
    const sub = { unsub: null };
    this._sub = sub;
    const entity = this._config.entity;
    this._hass.connection.subscribeMessage(
      (event) => { if (this._sub === sub) this._onEvent(event); },
      { type: DREAME_SUBSCRIBE, entity_id: entity },
      { resubscribe: false },
    ).then((unsub) => {
      if (this._sub !== sub) { this._safeUnsub(unsub); return; }
      sub.unsub = unsub;
      this._retries = 0;
    }).catch((err) => {
      if (this._sub !== sub) return;
      console.warn('m3-map-card : abonnement à la carte impossible', err);
      this._sub = null;
      if (!this._geometry) this._map.innerHTML = `<div class="empty">${t(this._hass, 'Map unavailable')}</div>`;
      this._retryLater();
    });
  }

  _retryLater() {
    clearTimeout(this._retryTimer);
    const delay = RETRY_MS[Math.min(this._retries ?? 0, RETRY_MS.length - 1)];
    this._retries = (this._retries ?? 0) + 1;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (this._hass && this._config && this.isConnected) this._updateVector();
    }, delay);
  }

  _safeUnsub(unsub) {
    try {
      const done = unsub();
      if (done && typeof done.catch === 'function') done.catch(() => {});
    } catch {
      // Connexion déjà fermée : rien à faire.
    }
  }

  _unsubscribe() {
    const sub = this._sub;
    this._sub = null;
    if (sub?.unsub) this._safeUnsub(sub.unsub);
  }

  _onEvent(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'geometry') this._geometry = event;
    else if (event.type === 'status') this._status = event;
    else if (event.type === 'path') this._trail = this._trail.slice(0, event.keep || 0).concat(event.points || []);
    else if (event.type === 'closed') {
      // L'intégration a été rechargée : on se réabonne quand la tondeuse revient.
      this._unsubscribe();
      this._retryLater();
      return;
    } else return;
    this._scheduleDraw();
  }

  _scheduleDraw() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._drawVector();
    });
  }

  _drawVector() {
    const g = this._geometry;
    if (!g || g.map_id === null || g.map_id === undefined) {
      if (g) this._map.innerHTML = `<div class="empty">${t(this._hass, 'Map unavailable')}</div>`;
      return;
    }
    const s = this._status ?? {};
    const working = Boolean(s.state?.session_active);
    const zones = (g.zones ?? []).map((z) => ({ id: z.id, name: z.name, points: pairsOf(z.polygon) }))
      .filter((z) => z.points.length >= 3);

    // Cadre : le terrain et la station, avec une petite marge.
    const pts = [];
    if (g.bounds) pts.push([g.bounds[0], g.bounds[1]], [g.bounds[2], g.bounds[3]]);
    for (const z of zones) pts.push(...z.points);
    if (s.dock) pts.push([s.dock.x, s.dock.y]);
    if (!pts.length) return;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    let box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const pad = Math.max(box[2] - box[0], box[3] - box[1], 2000) * MAP_MARGIN + LINK_WIDTH;
    box = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
    const tf = mapTransform(box, s.rotation);
    const size = Math.max(tf.width, tf.height);
    const marker = Math.max(size * 0.024, 320); // rayon de la tondeuse et de la station (mm)

    const poly = (points, cls, extra = '') =>
      `<polygon class="${cls}" ${extra} points="${points.map(([x, y]) => tf.at(x, y).map(fmt).join(',')).join(' ')}"/>`;
    const line = (points, cls, extra = '') =>
      `<polyline class="${cls}" ${extra} points="${points.map(([x, y]) => tf.at(x, y).map(fmt).join(',')).join(' ')}"/>`;

    const parts = [];
    const defs = [];
    for (const p of g.paths ?? []) {
      const points = pairsOf(p.points);
      if (points.length >= 2) parts.push(line(points, 'link', `stroke-width="${LINK_WIDTH}"`));
    }
    for (const z of zones) parts.push(poly(z.points, 'lawn'));
    for (const a of g.ignore_obstacles ?? []) {
      const points = pairsOf(a.polygon);
      if (points.length >= 3) parts.push(poly(points, 'ignore'));
    }
    for (const a of g.no_go ?? []) {
      const points = pairsOf(a.polygon);
      if (a.shape === 'line' && a.line) parts.push(line([a.line.slice(0, 2), a.line.slice(2)], 'nogo-line'));
      else if (points.length >= 3) parts.push(poly(points, 'nogo'));
    }

    // Pendant une tonte : la zone en cours en pointillés, les bandes tondues découpées sur la pelouse.
    if (working) {
      const current = zones.find((z) => z.id === s.current_zone);
      if (current) parts.push(poly(current.points, 'working'));
      if (this._config.show_trail !== false && this._trail.length) {
        let d = '';
        let pen = false;
        for (const p of this._trail) {
          if (!p) { pen = false; continue; }
          const [X, Y] = tf.at(p[0], p[1]);
          d += `${pen ? 'L' : 'M'}${fmt(X)} ${fmt(Y)}`;
          pen = true;
        }
        if (d) {
          const clip = `m3-lawn-${this._uid ??= Math.random().toString(36).slice(2, 8)}`;
          defs.push(`<clipPath id="${clip}">${zones.map((z) => poly(z.points, '')).join('')}</clipPath>`);
          parts.push(`<path class="trail" d="${d}" stroke-width="${TRAIL_WIDTH}" clip-path="url(#${clip})"/>`);
        }
      }
    }

    // Noms des zones, seulement s'il y en a plusieurs.
    if (zones.length > 1) {
      const font = size * 0.035;
      for (const z of zones) {
        if (!z.name) continue;
        const [X, Y] = tf.at(...centroid(z.points));
        parts.push(`<text class="label" x="${fmt(X)}" y="${fmt(Y)}" font-size="${fmt(font)}" text-anchor="middle" dominant-baseline="central">${escapeXml(z.name)}</text>`);
      }
    }

    for (const o of s.obstacles ?? []) {
      if (o.kind === 'obstacle' && o.type !== 0) continue;
      const [X, Y] = tf.at(o.x, o.y);
      parts.push(`<circle class="obstacle" cx="${fmt(X)}" cy="${fmt(Y)}" r="${fmt(marker * 0.35)}"/>`);
    }

    // Station (pastille secondaire + maison) puis tondeuse (pastille primaire + cap).
    const docked = this._hass.states[this._config.entity]?.state === 'docked' || Boolean(s.state?.docked);
    if (s.dock) {
      const [X, Y] = tf.at(s.dock.x, s.dock.y);
      const r = marker * 1.05;
      const k = (r * 1.2) / 24;
      parts.push(`<circle class="dock" cx="${fmt(X)}" cy="${fmt(Y)}" r="${fmt(r)}"/>`);
      if (!docked) {
        parts.push(`<path class="dock-icon" d="${HOME_ICON}" transform="translate(${fmt(X - 12 * k)} ${fmt(Y - 12 * k)}) scale(${k.toFixed(5)})"/>`);
      }
    }
    const pos = docked && s.dock ? { x: s.dock.x, y: s.dock.y, heading: null } : s.mower;
    if (pos && pos.x !== undefined && pos.x !== null) {
      const [X, Y] = tf.at(pos.x, pos.y);
      if (working) parts.push(`<circle class="mower-halo" cx="${fmt(X)}" cy="${fmt(Y)}" r="${fmt(marker * 2.2)}"/>`);
      parts.push(`<circle class="mower" cx="${fmt(X)}" cy="${fmt(Y)}" r="${fmt(marker * (docked ? 0.7 : 1))}"/>`);
      if (!docked && pos.heading !== null && pos.heading !== undefined) {
        // Cap : angle de la tondeuse (degrés, sens trigonométrique) ramené à l'écran.
        const a = ((-(pos.heading) + tf.rot) * Math.PI) / 180;
        const tip = (d, da) => [X + Math.cos(a + da) * d, Y + Math.sin(a + da) * d];
        const tri = [tip(marker * 0.62, 0), tip(marker * 0.45, 2.4), tip(marker * 0.45, -2.4)];
        parts.push(`<polygon class="heading" points="${tri.map((p) => p.map(fmt).join(',')).join(' ')}"/>`);
      }
    }

    const html = `<svg class="v" viewBox="0 0 ${fmt(tf.width)} ${fmt(tf.height)}" preserveAspectRatio="xMidYMid meet">`
      + `<defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
    if (html === this._drawKey) return;
    this._drawKey = html;
    this._map.innerHTML = html;
  }

  // ---- Source caméra : dreame_mower v1 et autres robots ----

  _updateCamera() {
    const cam = this._hass.states[this._config.entity];
    const picture = cam?.attributes.entity_picture;
    if (!picture) {
      this._map.innerHTML = `<div class="empty">${t(this._hass, 'Map unavailable')}</div>`;
      this._url = null;
      return;
    }
    // L'URL change à chaque nouveau jeton de la caméra : on recharge, au plus toutes les 10 s.
    const url = this._hass.hassUrl?.(picture) ?? picture;
    if (url === this._url) return;
    clearTimeout(this._reloadTimer);
    const wait = (this._loadedAt ?? 0) + MIN_RELOAD_MS - Date.now();
    if (this._url && wait > 0) {
      this._reloadTimer = setTimeout(() => this._update(), wait);
      return;
    }
    this._url = url;
    this._load(url);
  }

  async _load(url) {
    this._loadedAt = Date.now();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (url !== this._url) return;
      if (type.includes('svg')) {
        this._showSvg(await res.text());
      } else {
        // Image classique (PNG, JPEG) : affichée telle quelle, coins arrondis.
        const img = document.createElement('img');
        img.alt = '';
        img.src = url;
        this._map.replaceChildren(img);
      }
    } catch (err) {
      console.warn('m3-map-card : carte indisponible', err);
      this._map.innerHTML = `<div class="empty">${t(this._hass, 'Map unavailable')}</div>`;
    }
  }

  _showSvg(text) {
    // Analyse par le parseur HTML (SVG en ligne) : plus tolérant que le parseur XML.
    const tpl = document.createElement('template');
    tpl.innerHTML = text.replace(/<\?xml[^>]*\?>/, '');
    const svg = tpl.content.querySelector('svg');
    if (!svg) throw new Error('SVG invalide');
    const [, , width] = (svg.getAttribute('viewBox') ?? `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`)
      .split(/[\s,]+/).map(Number);

    // Fond, titre, légende et horodatage : tout ce qui n'est pas le terrain disparaît.
    for (const el of [...svg.querySelectorAll('rect, text, g')]) {
      const full = el.tagName === 'rect' && (el.getAttribute('width') === '100%' || Number(el.getAttribute('width')) >= width);
      if (el.tagName === 'text' || full || (el.tagName === 'rect' && el.getAttribute('stroke'))) el.remove();
      else if (el.tagName === 'g' && el.querySelector('text') && !el.querySelector('path, polygon, circle')) el.remove();
    }
    for (const el of svg.querySelectorAll('rect')) {
      // Petits carrés de couleur de la légende.
      if (Number(el.getAttribute('width')) < 40 && Number(el.getAttribute('height')) < 40) el.remove();
    }

    // Recoloration par rôle : les attributs d'origine cèdent la place aux classes du thème.
    for (const el of svg.querySelectorAll('path, polygon, polyline, circle')) {
      const found = ROLES.find((r) => r.match(el));
      if (!found) continue;
      el.removeAttribute('fill');
      el.removeAttribute('stroke');
      el.setAttribute('class', found.role);
      if (found.role === 'mower') {
        const halo = el.cloneNode();
        halo.setAttribute('class', 'mower-halo');
        halo.setAttribute('r', String(Number(el.getAttribute('r') || 6) * 2.6));
        el.before(halo);
        el.setAttribute('r', String(Math.max(Number(el.getAttribute('r') || 6), 9)));
      }
    }

    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const node = svg;
    this._map.replaceChildren(node);

    // Recadrage sur le terrain (limite + tracé), avec une petite marge.
    try {
      const targets = [...node.querySelectorAll('.boundary, .mowed, .obstacle, .mower')];
      const rects = targets.map((el) => el.getBBox()).filter((b) => b.width || b.height);
      if (rects.length) {
        const x1 = Math.min(...rects.map((b) => b.x)), y1 = Math.min(...rects.map((b) => b.y));
        const x2 = Math.max(...rects.map((b) => b.x + b.width)), y2 = Math.max(...rects.map((b) => b.y + b.height));
        const pad = Math.max(x2 - x1, y2 - y1) * 0.03;
        node.setAttribute('viewBox', `${x1 - pad} ${y1 - pad} ${x2 - x1 + pad * 2} ${y2 - y1 + pad * 2}`);
      }
    } catch {
      // getBBox indisponible (carte masquée) : on garde le cadrage d'origine.
    }
  }

  _renderChip() {
    const c = this._config;
    const mowerId = this._mowerId();
    if (!mowerId && !c.battery) return;
    const mower = mowerId && this._hass.states[mowerId];
    const battery = c.battery && this._hass.states[c.battery];
    const parts = [];
    if (mower) parts.push(this._hass.formatEntityState?.(mower) ?? mower.state);
    if (battery && !isNaN(parseFloat(battery.state))) parts.push(`${Math.round(parseFloat(battery.state))} %`);
    const key = parts.join(' • ');
    if (key === this._chipKey) return;
    this._chipKey = key;
    this._chip.innerHTML = '';
    if (!parts.length) return;
    const icon = document.createElement('ha-state-icon');
    Object.assign(icon, { hass: this._hass, stateObj: mower ?? battery });
    const text = document.createElement('span');
    text.textContent = key;
    this._chip.append(icon, text);
    // Le statut de la tondeuse change aussi l'affichage de la station.
    if (this._vector && this._geometry) this._scheduleDraw();
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-map-card-editor', M3MapCardEditor);

if (!customElements.get('m3-map-card')) {
  customElements.define('m3-map-card', M3MapCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-map-card',
    name: 'M3 Map',
    description: t(null, 'Robot map (Dreame mower...) redrawn in Material 3 colors, with its state'),
    preview: true,
  });
}
