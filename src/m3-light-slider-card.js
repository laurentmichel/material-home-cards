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
