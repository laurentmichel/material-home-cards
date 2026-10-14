// m3-thermostat-card — carte thermostat Material 3 : consigne en grand entre deux boutons − / +
// avec affichage immédiat, mode et température actuelle en dessous, bouton marche/arrêt.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  height: 100%; box-sizing: border-box; padding: 16px 20px 20px;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; flex-direction: column; gap: 4px;
  cursor: pointer; user-select: none; -webkit-user-select: none;
  transition: background 300ms ease, color 300ms ease;
}
button {
  font: inherit; color: inherit; border: none; background: none; padding: 0; margin: 0;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
button:focus-visible { outline: 2px solid var(--m3-primary); outline-offset: 2px; }
.header { display: flex; align-items: center; gap: 12px; min-height: 32px; }
.mode-icon { --mdc-icon-size: 20px; flex: none; }
.name { flex: 1; min-width: 0; ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.power {
  display: flex; align-items: center; gap: 6px; flex: none;
  height: 32px; padding: 0 14px 0 10px; border-radius: 16px;
  font-size: 0.875rem; font-weight: 500;
  border: var(--m3-chip-border); background: var(--m3-chip-bg); color: var(--m3-chip-fg);
  transition: background 300ms ease;
}
.power ha-icon { --mdc-icon-size: 18px; }
.controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.step {
  width: 80px; height: 52px; border-radius: 26px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: var(--md-sys-color-secondary-container, rgba(127, 127, 127, 0.15));
  color: var(--md-sys-color-on-secondary-container, var(--primary-text-color));
  transition: transform 100ms ease;
}
.step:active { transform: scale(0.94); }
.step ha-icon { --mdc-icon-size: 26px; }
.target {
  font-size: 4.5rem; font-weight: 400; line-height: 1.1; letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; text-align: center;
}
.status { text-align: center; ${STATE_FONT} }
:host([no-target]) .step { visibility: hidden; }
:host([off]) .target { opacity: 0.6; }
:host([unavailable]) ha-card { opacity: 0.5; pointer-events: none; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const PRIMARY = 'var(--md-sys-color-primary, var(--primary-color))';
const ON_PRIMARY = 'var(--md-sys-color-on-primary, #fff)';
const SEND_DELAY = 600;
const PENDING_TTL = 8000;

const MODES = {
  heat: { icon: 'mdi:fire' },
  cool: { icon: 'mdi:snowflake' },
  heat_cool: { icon: 'mdi:sun-snowflake-variant' },
  auto: { icon: 'mdi:thermostat-auto' },
  dry: { icon: 'mdi:water-percent' },
  fan_only: { icon: 'mdi:fan' },
  off: { icon: 'mdi:power' },
};

const fmt = (n) => Number(n).toLocaleString(langOf(), { maximumFractionDigits: 1 });

class M3ThermostatCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { filter: { domain: 'climate' } } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        { name: 'step', selector: { number: { min: 0.1, max: 5, step: 0.1, mode: 'box', unit_of_measurement: '°' } } },
        {
          name: 'hvac_mode',
          selector: {
            select: {
              mode: 'dropdown',
              options: Object.entries(MODES)
                .filter(([mode]) => mode !== 'off')
                .map(([value, { label }]) => ({ value, label })),
            },
          },
        },
      ],
    },
  ];

  static labels = {
    entity: 'Entity', name: 'Name', icon: 'Icon',
    step: 'Step of the − / + buttons', hvac_mode: 'Mode when turned on',
  };

  static helpers = {
    icon: 'Leave empty so the icon follows the mode',
    hvac_mode: 'Mode set by the on button (default: heat)',
  };
}

class M3ThermostatCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-thermostat-card-editor');
  }


  setConfig(config) {
    if (!config || !config.entity || !config.entity.startsWith('climate.')) {
      throw new Error('m3-thermostat-card: "entity" must be a climate.* entity');
    }
    this._config = { step: 0.5, ...config };
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('climate.')) || 'climate.example' };
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (stateObj === this._stateObj) return;
    this._stateObj = stateObj;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="header">
          <ha-icon class="mode-icon"></ha-icon>
          <div class="name"></div>
          <button class="power" aria-label="${t(this._hass, 'Turn on / off')}"><ha-icon icon="mdi:power"></ha-icon><span></span></button>
        </div>
        <div class="controls">
          <button class="step minus" aria-label="${t(this._hass, 'Lower the target')}"><ha-icon icon="mdi:minus"></ha-icon></button>
          <div class="target"></div>
          <button class="step plus" aria-label="${t(this._hass, 'Raise the target')}"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>
        <div class="status"></div>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      power: root.querySelector('.power'),
      icon: root.querySelector('.mode-icon'),
      powerLabel: root.querySelector('.power span'),
      name: root.querySelector('.name'),
      target: root.querySelector('.target'),
      status: root.querySelector('.status'),
    };
    this._card.addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
    this._els.power.addEventListener('click', (e) => { e.stopPropagation(); this._toggleMode(); });
    root.querySelector('.minus').addEventListener('click', (e) => { e.stopPropagation(); this._step(-1); });
    root.querySelector('.plus').addEventListener('click', (e) => { e.stopPropagation(); this._step(1); });
  }

  // Consigne réelle, remplacée par la valeur en attente tant que HA n'a pas confirmé.
  _target() {
    const real = this._stateObj?.attributes.temperature;
    const p = this._pending;
    if (p) {
      if (Date.now() < p.until && Math.abs((real ?? 0) - p.value) > 0.01) return p.value;
      if (!this._sendTimer) this._pending = null;
    }
    return real;
  }

  _render() {
    const s = this._stateObj;
    if (!s || !this._card) return;
    const a = s.attributes;
    const unavailable = s.state === 'unavailable' || s.state === 'unknown';
    const on = !unavailable && s.state !== 'off';
    const mode = MODES[s.state] ?? { icon: 'mdi:thermostat' };
    const target = this._target();

    this.toggleAttribute('unavailable', unavailable);
    this.toggleAttribute('off', !on);
    this.toggleAttribute('no-target', target == null);
    this._els.name.textContent = this._config.name ?? a.friendly_name ?? this._config.entity;
    this._els.icon.icon = this._config.icon ?? mode.icon;
    this._els.powerLabel.textContent = t(this._hass, on ? 'On' : 'Off');
    this._els.target.textContent = target == null ? '—' : fmt(target);
    // Nom du mode traduit par Home Assistant (l'état d'un thermostat est son mode).
    const parts = [unavailable ? t(this._hass, 'Unavailable') : (this._hass.formatEntityState?.(s) ?? s.state)];
    if (a.current_temperature != null) parts.push(`${fmt(a.current_temperature)} °C`);
    this._els.status.textContent = parts.join(' • ');

    const st = this._card.style;
    st.setProperty('--m3-primary', PRIMARY);
    st.setProperty('--m3-bg', on ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', on ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-chip-bg', on ? PRIMARY : 'transparent');
    st.setProperty('--m3-chip-fg', on ? ON_PRIMARY : 'inherit');
    st.setProperty('--m3-chip-border', on ? 'none' : '1px solid var(--md-sys-color-outline, rgba(127, 127, 127, 0.5))');
  }

  // Chaque appui part de la dernière valeur affichée ; une seule commande part après le dernier appui.
  _step(direction) {
    const a = this._stateObj?.attributes;
    const current = this._target();
    if (!a || current == null) return;
    const step = Number(this._config.step);
    const raw = Math.round((current + direction * step) / step) * step;
    const value = Math.max(a.min_temp ?? -Infinity, Math.min(a.max_temp ?? Infinity, Number(raw.toFixed(2))));
    this._pending = { value, until: Date.now() + PENDING_TTL };
    this._fire('haptic', 'light');
    this._render();
    clearTimeout(this._sendTimer);
    this._sendTimer = setTimeout(() => {
      this._sendTimer = null;
      this._hass.callService('climate', 'set_temperature', { entity_id: this._config.entity, temperature: value });
    }, SEND_DELAY);
  }

  _toggleMode() {
    const s = this._stateObj;
    if (!s) return;
    const modes = s.attributes.hvac_modes ?? [];
    const onMode = this._config.hvac_mode ?? (modes.includes('heat') ? 'heat' : modes.find((m) => m !== 'off'));
    const hvacMode = s.state === 'off' ? onMode : 'off';
    if (!hvacMode) return;
    this._fire('haptic', 'light');
    this._hass.callService('climate', 'set_hvac_mode', { entity_id: this._config.entity, hvac_mode: hvacMode });
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-thermostat-card-editor', M3ThermostatCardEditor);

if (!customElements.get('m3-thermostat-card')) {
  customElements.define('m3-thermostat-card', M3ThermostatCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-thermostat-card',
    name: 'M3 Thermostat',
    description: t(null, 'Material 3 thermostat with an adjustable target and instant feedback'),
    preview: true,
  });
}
