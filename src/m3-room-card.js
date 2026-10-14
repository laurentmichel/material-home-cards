// m3-room-card — carte pièce Material 3 : nom, icône, température et humidité de la pièce.
// Le fond prend la couleur pastel de la lumière quand elle est allumée, l'icône devient une flamme rouge pendant la chauffe.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 130px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; flex-direction: column; justify-content: space-between; padding: 16px 16px 16px 20px;
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, color 300ms ease, transform 120ms ease;
}
ha-card:active { transform: scale(0.98); }
.top { display: flex; align-items: center; gap: 14px; }
.name {
  ${TITLE_FONT} min-width: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.icon {
  flex: none; display: flex; --mdc-icon-size: 24px;
  color: var(--m3-icon-fg); transition: color 300ms ease;
}
.climate { display: flex; align-items: baseline; gap: 6px; }
.temp { font-size: 2.4rem; font-weight: 400; line-height: 1; letter-spacing: -0.5px; }
.hum { ${STATE_FONT} }
:host([no-climate]) .climate { display: none; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;
const PASTEL = 0.45;

const isNumber = (s) => s && !isNaN(parseFloat(s.state));

class M3RoomCardEditor extends M3CardEditor {
  static schema = [
    {
      type: 'grid', name: '', schema: [
        { name: 'name', required: true, selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
      ],
    },
    { name: 'light', selector: { entity: { domain: 'light' } } },
    { name: 'climate', selector: { entity: { domain: 'climate' } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'temperature', selector: { entity: { domain: 'sensor', device_class: 'temperature' } } },
        { name: 'humidity', selector: { entity: { domain: 'sensor', device_class: 'humidity' } } },
      ],
    },
    {
      type: 'expandable', name: '', title: 'Actions', icon: 'mdi:gesture-tap', schema: [
        { name: 'tap_action', selector: { ui_action: {} } },
        { name: 'hold_action', selector: { ui_action: {} } },
      ],
    },
  ];

  static labels = {
    name: 'Nom', icon: 'Icône', light: 'Lumière', climate: 'Thermostat',
    temperature: 'Température', humidity: 'Humidité', tap_action: 'Appui', hold_action: 'Appui long',
  };

  static helpers = {
    light: 'Le fond prend sa couleur quand elle est allumée',
    climate: 'L’icône devient une flamme pendant la chauffe ; sa température sert si aucun capteur n’est choisi',
    tap_action: 'Par exemple « Naviguer » vers #salon pour ouvrir une popup. Vide : fenêtre de détails',
    hold_action: 'Vide : allumer / éteindre la lumière',
  };
}

class M3RoomCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-room-card-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    const byClass = (dc) => entities.find((e) => e.startsWith('sensor.') && hass.states[e].attributes.device_class === dc);
    const config = { name: 'Salon', light: entities.find((e) => e.startsWith('light.')), temperature: byClass('temperature'), humidity: byClass('humidity') };
    for (const key of Object.keys(config)) if (!config[key]) delete config[key];
    return config;
  }

  setConfig(config) {
    if (!config || !config.name) throw new Error('m3-room-card : « name » est obligatoire');
    this._config = config;
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 4 }; }

  set hass(hass) {
    this._hass = hass;
    const c = this._config;
    // Ne redessine que si une des entités de la pièce a changé.
    const watched = [c.light, c.climate, c.temperature, c.humidity].map((e) => e && hass.states[e]);
    if (this._watched && watched.every((s, i) => s === this._watched[i])) return;
    this._watched = watched;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="top"><div class="icon"><ha-icon></ha-icon></div><div class="name"></div></div>
        <div class="climate"><span class="temp"></span><span class="hum"></span></div>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      name: root.querySelector('.name'),
      icon: root.querySelector('ha-icon'),
      temp: root.querySelector('.temp'),
      hum: root.querySelector('.hum'),
    };
    this._card.addEventListener('pointerdown', (e) => this._onDown(e));
    this._card.addEventListener('pointerup', () => this._onUp());
    this._card.addEventListener('pointerleave', () => this._cancel());
    this._card.addEventListener('pointercancel', () => this._cancel());
    this._card.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _number(value, decimals = 0) {
    return new Intl.NumberFormat(this._hass?.locale?.language ?? 'fr', { maximumFractionDigits: decimals }).format(value);
  }

  _render() {
    if (!this._card || !this._hass) return;
    const c = this._config;
    const states = this._hass.states;
    const light = c.light && states[c.light];
    const climate = c.climate && states[c.climate];
    const tempObj = c.temperature && states[c.temperature];
    const humObj = c.humidity && states[c.humidity];

    this._els.name.textContent = c.name;

    // Température du capteur, sinon celle mesurée par le thermostat.
    const temp = isNumber(tempObj) ? parseFloat(tempObj.state) : climate?.attributes.current_temperature;
    const hum = isNumber(humObj) ? parseFloat(humObj.state) : climate?.attributes.current_humidity;
    this._els.temp.textContent = temp != null ? `${this._number(temp)}°` : '';
    this._els.hum.textContent = hum != null ? `${this._number(hum)} %` : '';
    this.toggleAttribute('no-climate', temp == null && hum == null);

    // Chauffe en cours : hvac_action si le thermostat le fournit, sinon le mode « heat ».
    const action = climate?.attributes.hvac_action;
    const heating = climate && (action ? action === 'heating' : climate.state === 'heat');
    this._els.icon.icon = heating ? 'mdi:fire' : c.icon ?? 'mdi:home-outline';

    const st = this._card.style;
    let fg = ON_SURFACE;
    if (light?.state === 'on') {
      // Même ton pastel que le slider de lumière : la couleur de la lumière mélangée à 45 % de blanc.
      const [r, g, b] = (light.attributes.rgb_color ?? [255, 183, 77]).map((v) => Math.round(v + (255 - v) * PASTEL));
      fg = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? '#1c1b1f' : '#ffffff';
      st.setProperty('--m3-bg', `rgb(${r}, ${g}, ${b})`);
    } else {
      st.setProperty('--m3-bg', SURFACE);
    }
    st.setProperty('--m3-fg', fg);
    // En chauffe, la flamme prend la couleur d'erreur du thème (rouge), plus foncée sur un fond clair.
    const heat = fg === '#1c1b1f' ? '#ba1a1a' : 'var(--md-sys-color-error, #ffb4ab)';
    st.setProperty('--m3-icon-fg', heating ? heat : fg);
  }

  _onDown(e) {
    if (e.button !== 0) return;
    this._down = true;
    this._held = false;
    this._holdTimer = setTimeout(() => {
      this._held = true;
      this._run('hold');
    }, HOLD_MS);
  }

  _onUp() {
    clearTimeout(this._holdTimer);
    if (this._down && !this._held) this._run('tap');
    this._down = false;
  }

  _cancel() {
    clearTimeout(this._holdTimer);
    this._down = false;
  }

  // Action configurée → gestion native de HA ; sinon appui = détails, appui long = lumière.
  _run(kind) {
    const c = this._config;
    const entity = c.light ?? c.climate ?? c.temperature;
    const configured = c[`${kind}_action`];
    this._fire('haptic', kind === 'hold' ? 'medium' : 'light');
    if (configured) {
      this._fire('hass-action', { config: { entity, [`${kind}_action`]: configured }, action: kind });
    } else if (kind === 'hold' && c.light && this._hass.states[c.light]) {
      this._hass.callService('light', 'toggle', { entity_id: c.light });
    } else if (entity) {
      this._fire('hass-more-info', { entityId: entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-room-card-editor', M3RoomCardEditor);

if (!customElements.get('m3-room-card')) {
  customElements.define('m3-room-card', M3RoomCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-room-card',
    name: 'M3 Room',
    description: 'Pièce Material 3 : température, humidité, couleur de la lumière et chauffage en cours',
    preview: true,
  });
}
