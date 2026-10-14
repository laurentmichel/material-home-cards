// m3-thermostat-card — carte thermostat Material 3 : température actuelle, consigne réglable
// par pas avec affichage immédiat, bouton marche/arrêt.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  height: 100%; box-sizing: border-box; padding: 20px;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: grid; grid-template-columns: 48px 1fr auto;
  grid-template-areas: "icon name mode" "temp temp temp" "minus target plus";
  column-gap: 12px; row-gap: 16px; align-items: center;
  cursor: pointer; user-select: none; -webkit-user-select: none;
  transition: background 300ms ease, color 300ms ease;
}
button {
  font: inherit; color: inherit; border: none; background: none; padding: 0; margin: 0;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
button:focus-visible { outline: 2px solid var(--m3-primary); outline-offset: 2px; }
.icon {
  grid-area: icon; width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--m3-icon-bg); color: var(--m3-icon-fg); transition: background 300ms ease;
}
.icon ha-icon { --mdc-icon-size: 24px; }
.title { grid-area: name; min-width: 0; }
.name { font-size: 1rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { font-size: 0.8125rem; opacity: 0.75; }
.mode {
  grid-area: mode; display: flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 14px 0 10px; border-radius: 18px;
  font-size: 0.875rem; font-weight: 500;
  border: var(--m3-chip-border); background: var(--m3-chip-bg); color: var(--m3-chip-fg);
  transition: background 300ms ease;
}
.mode ha-icon { --mdc-icon-size: 18px; }
.temp { grid-area: temp; font-size: 3.5rem; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.temp .unit { font-size: 1.5rem; vertical-align: top; margin-left: 2px; }
.step {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--md-sys-color-secondary-container, rgba(127, 127, 127, 0.15));
  color: var(--md-sys-color-on-secondary-container, var(--primary-text-color));
  transition: transform 100ms ease;
}
.step:active { transform: scale(0.92); }
.step ha-icon { --mdc-icon-size: 24px; }
.minus { grid-area: minus; justify-self: start; }
.plus { grid-area: plus; justify-self: end; }
.target { grid-area: target; justify-self: center; font-size: 1rem; font-weight: 500; font-variant-numeric: tabular-nums; }
:host([no-target]) .step, :host([no-target]) .target { visibility: hidden; }
:host([unavailable]) ha-card { opacity: 0.5; pointer-events: none; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const PRIMARY = 'var(--md-sys-color-primary, var(--primary-color))';
const ON_PRIMARY = 'var(--md-sys-color-on-primary, #fff)';
const SEND_DELAY = 600;
const PENDING_TTL = 8000;

const ACTIONS = {
  heating: { label: 'Chauffe', icon: 'mdi:fire' },
  cooling: { label: 'Refroidit', icon: 'mdi:snowflake' },
  drying: { label: 'Déshumidifie', icon: 'mdi:water-percent' },
  fan: { label: 'Ventile', icon: 'mdi:fan' },
  idle: { label: 'En veille', icon: 'mdi:radiator' },
  off: { label: 'Éteint', icon: 'mdi:radiator' },
};

const fmt = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

class M3ThermostatCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity || !config.entity.startsWith('climate.')) {
      throw new Error('m3-thermostat-card : « entity » doit être une entité climate.*');
    }
    this._config = { step: 0.5, ...config };
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('climate.')) || 'climate.example' };
  }

  getCardSize() { return 4; }

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
        <div class="icon"><ha-icon></ha-icon></div>
        <div class="title"><div class="name"></div><div class="status"></div></div>
        <button class="mode"><ha-icon icon="mdi:power"></ha-icon><span></span></button>
        <div class="temp"></div>
        <button class="step minus" aria-label="Baisser la consigne"><ha-icon icon="mdi:minus"></ha-icon></button>
        <div class="target"></div>
        <button class="step plus" aria-label="Monter la consigne"><ha-icon icon="mdi:plus"></ha-icon></button>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      icon: root.querySelector('.icon ha-icon'),
      name: root.querySelector('.name'),
      status: root.querySelector('.status'),
      mode: root.querySelector('.mode'),
      modeLabel: root.querySelector('.mode span'),
      temp: root.querySelector('.temp'),
      target: root.querySelector('.target'),
    };
    this._card.addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
    this._els.mode.addEventListener('click', (e) => { e.stopPropagation(); this._toggleMode(); });
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
    const action = ACTIONS[on ? a.hvac_action : 'off'] ?? ACTIONS.idle;
    const target = this._target();

    this.toggleAttribute('unavailable', unavailable);
    this.toggleAttribute('no-target', target == null);
    this._els.name.textContent = this._config.name ?? a.friendly_name ?? this._config.entity;
    this._els.status.textContent = unavailable ? 'Indisponible' : action.label;
    this._els.icon.icon = this._config.icon ?? action.icon;
    this._els.modeLabel.textContent = on ? 'Marche' : 'Arrêt';
    this._els.temp.innerHTML = a.current_temperature == null
      ? '—'
      : `${fmt(a.current_temperature)}<span class="unit">°C</span>`;
    this._els.target.textContent = target == null ? '' : `Consigne ${fmt(target)}°`;

    const st = this._card.style;
    st.setProperty('--m3-primary', PRIMARY);
    st.setProperty('--m3-bg', on ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', on ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-icon-bg', on ? PRIMARY : 'var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.15))');
    st.setProperty('--m3-icon-fg', on ? ON_PRIMARY : 'inherit');
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

if (!customElements.get('m3-thermostat-card')) {
  customElements.define('m3-thermostat-card', M3ThermostatCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-thermostat-card',
    name: 'M3 Thermostat',
    description: 'Thermostat Material 3 avec consigne réglable et affichage immédiat',
  });
}
