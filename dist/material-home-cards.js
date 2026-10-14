/*! Material Home Cards v1.2.0 — https://github.com/laurentmichel/material-home-cards */
console.info('%c MATERIAL-HOME-CARDS %c v1.2.0 ', 'color:#fff;background:#6750a4;font-weight:700', 'color:#6750a4;background:#eaddff');

// ---- m3-light-slider-card.js ----
{
// m3-light-slider-card — carte lumière Material 3 : toute la carte est un slider,
// teintée avec la couleur actuelle de la lumière.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 96px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  touch-action: pan-y; user-select: none; -webkit-user-select: none; cursor: pointer;
  transition: background 300ms ease, color 300ms ease;
}
.fill {
  position: absolute; top: 0; bottom: 0; left: 0; width: var(--m3-pct, 0%);
  background: var(--m3-fill); transition: width 200ms ease, background 300ms ease;
}
:host([dragging]) .fill { transition: background 300ms ease; }
.content {
  position: relative; display: flex; align-items: center; gap: 16px;
  height: 100%; padding: 0 24px; box-sizing: border-box;
}
.icon {
  width: 48px; height: 48px; flex: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--m3-icon-bg); color: var(--m3-icon-fg); transition: background 300ms ease;
}
.icon ha-icon { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { font-size: 1rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { font-size: 0.8125rem; opacity: 0.8; }
.pct { font-size: 1.75rem; font-weight: 400; font-variant-numeric: tabular-nums; }
:host([unavailable]) ha-card { opacity: 0.5; cursor: default; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const SEND_INTERVAL = 300;
const PENDING_TTL = 5000;

class M3LightSliderCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity || !config.entity.startsWith('light.')) {
      throw new Error('m3-light-slider-card : « entity » doit être une entité light.*');
    }
    this._config = config;
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('light.')) || 'light.example' };
  }

  getCardSize() { return 2; }

  getGridOptions() { return { columns: 12, rows: 2, min_rows: 2 }; }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (stateObj === this._stateObj) return;
    this._stateObj = stateObj;
    if (!this._dragging) this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="fill"></div>
        <div class="content">
          <div class="icon"><ha-icon></ha-icon></div>
          <div class="text"><div class="name"></div><div class="state"></div></div>
          <div class="pct"></div>
        </div>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      icon: root.querySelector('ha-icon'),
      name: root.querySelector('.name'),
      state: root.querySelector('.state'),
      pct: root.querySelector('.pct'),
    };
    this._card.addEventListener('pointerdown', (e) => this._onDown(e));
    this._card.addEventListener('pointermove', (e) => this._onMove(e));
    this._card.addEventListener('pointerup', (e) => this._onUp(e));
    this._card.addEventListener('pointercancel', () => this._reset());
    this._card.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // État réel de la lumière, remplacé par la valeur en attente tant que HA n'a pas confirmé.
  _effective() {
    const s = this._stateObj;
    const realOn = s?.state === 'on';
    const realPct = realOn ? Math.round(((s.attributes.brightness ?? 255) / 255) * 100) : 0;
    const p = this._pending;
    if (p) {
      const confirmed = p.on === realOn && (!p.on || p.anyPct || Math.abs(p.pct - realPct) <= 1);
      if (confirmed || Date.now() > p.until) this._pending = null;
      else return { on: p.on, pct: p.pct };
    }
    return { on: realOn, pct: realPct };
  }

  _render() {
    const s = this._stateObj;
    if (!s || !this._card) return;
    const unavailable = s.state === 'unavailable' || s.state === 'unknown';
    this.toggleAttribute('unavailable', unavailable);
    const { on, pct } = this._effective();
    const a = s.attributes;

    this._els.name.textContent = this._config.name ?? a.friendly_name ?? this._config.entity;
    this._els.icon.icon = this._config.icon ?? a.icon ?? (on ? 'mdi:lightbulb' : 'mdi:lightbulb-outline');
    this._els.state.textContent = unavailable ? 'Indisponible' : on ? 'Allumée' : 'Éteinte';
    this._els.pct.textContent = on ? `${pct} %` : '';

    const st = this._card.style;
    if (on) {
      const [r, g, b] = a.rgb_color ?? [255, 183, 77];
      const lightFill = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
      const overFill = pct >= 45;
      st.setProperty('--m3-fill', `rgb(${r}, ${g}, ${b})`);
      st.setProperty('--m3-bg', `linear-gradient(rgba(${r}, ${g}, ${b}, 0.22), rgba(${r}, ${g}, ${b}, 0.22)), ${SURFACE}`);
      st.setProperty('--m3-pct', `${Math.max(pct, 4)}%`);
      st.setProperty('--m3-fg', overFill ? (lightFill ? '#1c1b1f' : '#ffffff') : ON_SURFACE);
      st.setProperty('--m3-icon-bg', lightFill ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.22)');
      st.setProperty('--m3-icon-fg', lightFill ? '#1c1b1f' : '#ffffff');
    } else {
      st.setProperty('--m3-fill', 'transparent');
      st.setProperty('--m3-bg', SURFACE);
      st.setProperty('--m3-pct', '0%');
      st.setProperty('--m3-fg', ON_SURFACE);
      st.setProperty('--m3-icon-bg', 'var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.15))');
      st.setProperty('--m3-icon-fg', ON_SURFACE);
    }
  }

  _onDown(e) {
    if (e.button !== 0 || this.hasAttribute('unavailable')) return;
    this._down = {
      x: e.clientX, y: e.clientY, id: e.pointerId,
      pct: this._effective().pct, width: this._card.getBoundingClientRect().width,
    };
    this._holdTimer = setTimeout(() => {
      if (!this._down || this._dragging) return;
      this._reset();
      this._fire('hass-more-info', { entityId: this._config.entity });
    }, 500);
  }

  _onMove(e) {
    const d = this._down;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!this._dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return this._reset();
      if (Math.abs(dx) < 6) return;
      this._dragging = true;
      clearTimeout(this._holdTimer);
      this._card.setPointerCapture(d.id);
      this.setAttribute('dragging', '');
    }
    const pct = Math.max(1, Math.min(100, Math.round(d.pct + (dx / d.width) * 100)));
    this._setPending(true, pct);
    this._throttledSend(pct);
  }

  _onUp() {
    clearTimeout(this._holdTimer);
    if (!this._down) return;
    if (this._dragging) {
      clearTimeout(this._sendTimer);
      this._sendTimer = null;
      this._send(this._pending?.pct ?? this._effective().pct);
    } else {
      const { on, pct } = this._effective();
      this._setPending(!on, on ? 0 : pct || 100, true);
      this._fire('haptic', 'light');
      this._hass.callService('light', 'toggle', { entity_id: this._config.entity });
    }
    this._reset();
  }

  _reset() {
    clearTimeout(this._holdTimer);
    this._down = null;
    this._dragging = false;
    this.removeAttribute('dragging');
  }

  _setPending(on, pct, anyPct = false) {
    this._pending = { on, pct, anyPct, until: Date.now() + PENDING_TTL };
    this._render();
  }

  // Pendant le glissement, au plus un appel toutes les 300 ms ; la valeur finale part au relâchement.
  _throttledSend(pct) {
    this._lastPct = pct;
    if (this._sendTimer) return;
    this._send(pct);
    this._sendTimer = setTimeout(() => {
      this._sendTimer = null;
      if (this._dragging && this._lastPct !== pct) this._throttledSend(this._lastPct);
    }, SEND_INTERVAL);
  }

  _send(pct) {
    this._hass.callService('light', 'turn_on', { entity_id: this._config.entity, brightness_pct: pct });
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

if (!customElements.get('m3-light-slider-card')) {
  customElements.define('m3-light-slider-card', M3LightSliderCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-light-slider-card',
    name: 'M3 Light Slider',
    description: 'Slider de luminosité Material 3 teinté avec la couleur de la lumière',
  });
}
}

// ---- m3-thermostat-card.js ----
{
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
.name { flex: 1; min-width: 0; font-size: 1rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
.status { text-align: center; font-size: 0.875rem; opacity: 0.85; }
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
  heat: { label: 'Chauffage', icon: 'mdi:fire' },
  cool: { label: 'Climatisation', icon: 'mdi:snowflake' },
  heat_cool: { label: 'Auto', icon: 'mdi:sun-snowflake-variant' },
  auto: { label: 'Auto', icon: 'mdi:thermostat-auto' },
  dry: { label: 'Déshumidification', icon: 'mdi:water-percent' },
  fan_only: { label: 'Ventilation', icon: 'mdi:fan' },
  off: { label: 'Arrêt', icon: 'mdi:power' },
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
          <button class="power" aria-label="Allumer / éteindre"><ha-icon icon="mdi:power"></ha-icon><span></span></button>
        </div>
        <div class="controls">
          <button class="step minus" aria-label="Baisser la consigne"><ha-icon icon="mdi:minus"></ha-icon></button>
          <div class="target"></div>
          <button class="step plus" aria-label="Monter la consigne"><ha-icon icon="mdi:plus"></ha-icon></button>
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
    const mode = MODES[s.state] ?? { label: s.state, icon: 'mdi:thermostat' };
    const target = this._target();

    this.toggleAttribute('unavailable', unavailable);
    this.toggleAttribute('off', !on);
    this.toggleAttribute('no-target', target == null);
    this._els.name.textContent = this._config.name ?? a.friendly_name ?? this._config.entity;
    this._els.icon.icon = this._config.icon ?? mode.icon;
    this._els.powerLabel.textContent = on ? 'Marche' : 'Arrêt';
    this._els.target.textContent = target == null ? '—' : fmt(target);
    const parts = [unavailable ? 'Indisponible' : mode.label];
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

if (!customElements.get('m3-thermostat-card')) {
  customElements.define('m3-thermostat-card', M3ThermostatCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-thermostat-card',
    name: 'M3 Thermostat',
    description: 'Thermostat Material 3 avec consigne réglable et affichage immédiat',
  });
}
}
