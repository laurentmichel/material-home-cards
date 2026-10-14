// m3-map-card — carte d'un robot (tondeuse Dreame...) redessinée en Material 3 : la caméra « carte » fournit
// un SVG, dont on retire le fond, le titre et la légende, puis qu'on recolore et recadre sur le terrain.
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
}
.map { display: flex; align-items: center; justify-content: center; min-height: 120px; }
.map svg { width: 100%; height: auto; max-height: var(--m3-map-height, 360px); display: block; overflow: visible; }
.map img { width: 100%; max-height: var(--m3-map-height, 360px); object-fit: contain; border-radius: 16px; }
.boundary { fill: color-mix(in srgb, var(--m3-lawn) 22%, transparent); stroke: var(--m3-lawn); stroke-width: 3; stroke-linejoin: round; }
.mowed { stroke: var(--m3-path); stroke-opacity: 0.55; fill: none; }
.obstacle { fill: color-mix(in srgb, var(--m3-obstacle) 18%, transparent); stroke: color-mix(in srgb, var(--m3-obstacle) 45%, transparent); stroke-width: 1.5; }
.mower { fill: var(--m3-mower); stroke: var(--md-sys-color-on-primary, #fff); stroke-width: 3; }
.mower-halo { fill: var(--m3-mower); opacity: 0.25; }
.chip {
  position: absolute; top: 14px; left: 14px; display: flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px;
  border-radius: 16px; font-size: 13px; font-weight: 500; --mdc-icon-size: 18px;
  background: color-mix(in srgb, var(--md-sys-color-surface-container-highest, #444) 85%, transparent);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.chip:empty, :host(:not([has-chip])) .chip { display: none; }
.empty { ${STATE_FONT} padding: 40px 0; }
`;

// Couleurs du rendu Dreame Mower → rôle de chaque élément.
const ROLES = [
  { role: 'boundary', match: (el) => el.getAttribute('stroke') === '#006400' },
  { role: 'mowed', match: (el) => el.getAttribute('stroke') === '#ffa500' },
  { role: 'obstacle', match: (el) => el.getAttribute('stroke') === '#ff4d00' },
  { role: 'mower', match: (el) => el.tagName === 'circle' && el.getAttribute('fill') === '#ff0000' },
];
const MIN_RELOAD_MS = 10 * 1000;

class M3MapCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { domain: 'camera' } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'mower', selector: { entity: { domain: ['lawn_mower', 'vacuum'] } } },
        { name: 'battery', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
        { name: 'lawn_color', selector: { text: {} } },
        { name: 'height', selector: { number: { min: 150, max: 800, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
      ],
    },
  ];

  static labels = {
    entity: 'Map camera', mower: 'Robot', battery: 'Battery', lawn_color: 'Lawn color', height: 'Max height',
  };

  static helpers = {
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
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('camera.') && /map|carte/.test(e)) ?? 'camera.example' };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-map-card: "entity" (camera) is required');
    this._config = config;
    if (!this.shadowRoot) this._build();
    const st = this._card.style;
    st.setProperty('--m3-map-height', `${Number(config.height) || 360}px`);
    if (config.lawn_color) st.setProperty('--m3-map-lawn', config.lawn_color);
    else st.removeProperty('--m3-map-lawn');
    this.toggleAttribute('has-chip', !!(config.mower || config.battery));
    this._url = null;
    if (this._hass) this._update();
  }

  getCardSize() { return 6; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card><div class="map"><div class="empty">${t(this._hass, 'Loading the map…')}</div></div><div class="chip"></div></ha-card>`;
    this._card = root.querySelector('ha-card');
    this._map = root.querySelector('.map');
    this._chip = root.querySelector('.chip');
    this._card.addEventListener('click', () => {
      this._fire('hass-more-info', { entityId: this._config.mower ?? this._config.entity });
    });
  }

  _update() {
    if (!this._card || !this._hass) return;
    this._renderChip();
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
    const [, , width, height] = (svg.getAttribute('viewBox') ?? `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`)
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
    const boxes = [];
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
      if (found.role === 'boundary') boxes.push(el);
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
    if (!c.mower && !c.battery) return;
    const mower = c.mower && this._hass.states[c.mower];
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
