// m3-cover-card — volet roulant Material 3 : une fenêtre dont le tablier descend selon la position
// (glisser pour régler), boutons ouvrir / stop / fermer, positions favorites et batterie (volets solaires).
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  height: 100%; box-sizing: border-box; padding: 16px; border-radius: 28px; border: none; box-shadow: none;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  display: flex; gap: 16px; align-items: stretch;
}
/* Fenêtre : ciel clair derrière, tablier à lames qui descend du haut. */
.window {
  position: relative; flex: none; width: 92px; min-height: 124px; border-radius: 20px; overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--m3-accent) 28%, var(--m3-glass)), color-mix(in srgb, var(--m3-accent) 10%, var(--m3-glass)));
  --m3-glass: var(--md-sys-color-surface-container-highest, #ffffff);
  touch-action: none; cursor: ns-resize; user-select: none; -webkit-user-select: none;
  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--m3-accent) 35%, transparent);
}
.window::after {
  content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 3px; transform: translateX(-50%);
  background: color-mix(in srgb, var(--m3-accent) 35%, transparent);
}
.shutter {
  position: absolute; left: 0; right: 0; top: 0; height: var(--m3-closed, 0%); z-index: 1;
  background: repeating-linear-gradient(180deg,
    color-mix(in srgb, var(--m3-accent) 70%, #1c1b1f) 0 9px,
    color-mix(in srgb, var(--m3-accent) 55%, #1c1b1f) 9px 11px);
  transition: height 500ms cubic-bezier(0.2, 0, 0, 1);
}
.shutter::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 5px;
  background: color-mix(in srgb, var(--m3-accent) 40%, #1c1b1f);
}
:host([dragging]) .shutter { transition: none; }
:host([no-position]) .window { cursor: default; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { display: flex; align-items: center; gap: 8px; min-width: 0; margin-top: 2px; }
.state { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.pct { flex: none; font-size: 1.6rem; font-weight: 400; line-height: 1; font-variant-numeric: tabular-nums; }
:host([no-position]) .pct { display: none; }
.battery {
  flex: none; display: inline-flex; align-items: center; gap: 2px; height: 22px; padding: 0 8px 0 4px; border-radius: 11px; cursor: pointer;
  font-size: 12px; font-weight: 600; --mdc-icon-size: 16px;
  background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.15));
}
.battery[low] { background: var(--md-sys-color-error-container, #f9dedc); color: var(--md-sys-color-on-error-container, #410e0b); }
.battery[hidden] { display: none; }
.buttons { display: flex; gap: 8px; margin-top: auto; }
.btn {
  flex: 1; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: color-mix(in srgb, var(--m3-accent) 16%, var(--md-sys-color-surface-container-highest, transparent));
  color: var(--md-sys-color-on-surface, var(--primary-text-color)); --mdc-icon-size: 24px;
  -webkit-tap-highlight-color: transparent; transition: transform 120ms ease, background 200ms ease, border-radius 200ms ease;
}
.btn:active { transform: scale(0.94); border-radius: 12px; }
.btn[active] { background: var(--m3-accent); color: var(--m3-on-accent); }
.btn[disabled] { opacity: 0.38; pointer-events: none; }
.favorites { display: flex; gap: 6px; flex-wrap: wrap; }
.favorites:empty { display: none; }
.chip {
  height: 32px; padding: 0 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
  font-size: 13px; font-weight: 600; --mdc-icon-size: 18px; -webkit-tap-highlight-color: transparent;
  box-shadow: inset 0 0 0 1px var(--md-sys-color-outline-variant, rgba(127, 127, 127, 0.4));
}
.chip[active] { box-shadow: none; background: var(--md-sys-color-secondary-container, rgba(127, 127, 127, 0.2)); color: var(--md-sys-color-on-secondary-container, inherit); }
:host([unavailable]) ha-card { opacity: 0.5; }
:host([unavailable]) .window, :host([unavailable]) .btn, :host([unavailable]) .chip { pointer-events: none; }
`;

// Bits de supported_features des entités cover.
const OPEN = 1;
const CLOSE = 2;
const SET_POSITION = 4;
const STOP = 8;
const PENDING_TTL = 60 * 1000;
const LOW_BATTERY = 20;

const batteryIcon = (level) => {
  if (!isFinite(level)) return 'mdi:battery-unknown';
  const step = Math.round(Math.max(0, Math.min(100, level)) / 10) * 10;
  return step >= 100 ? 'mdi:battery' : step <= 0 ? 'mdi:battery-outline' : `mdi:battery-${step}`;
};

class M3CoverCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { filter: { domain: 'cover' } } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'color', selector: { ui_color: {} } },
        { name: 'battery', selector: { entity: { filter: { domain: 'sensor', device_class: 'battery' } } } },
      ],
    },
    {
      name: 'favorites', selector: {
        object: {
          multiple: true, label_field: 'name', description_field: 'position',
          fields: {
            position: { label: 'Position (%)', required: true, selector: { number: { min: 0, max: 100, mode: 'box', unit_of_measurement: '%' } } },
            name: { label: 'Name', selector: { text: {} } },
            icon: { label: 'Icon', selector: { icon: {} } },
          },
        },
      },
    },
  ];

  static labels = { entity: 'Shutter', name: 'Name', color: 'Color', battery: 'Battery', favorites: 'Favorite positions' };

  static helpers = {
    battery: 'Optional: battery level of a solar shutter',
    favorites: '100 % = fully open, 0 % = closed',
  };
}

class M3CoverCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-cover-card-editor');
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('cover.')) ?? 'cover.example' };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-cover-card: "entity" is required');
    this._config = config;
    if (!this.shadowRoot) this._build();
    this._buildFavorites();
    this._key = null;
    if (this._hass) this._render();
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="window" role="slider" aria-valuemin="0" aria-valuemax="100"><div class="shutter"></div></div>
        <div class="main">
          <div class="top">
            <div class="text">
              <div class="name"></div>
              <div class="sub"><span class="state"></span><span class="battery" hidden><ha-icon></ha-icon><span></span></span></div>
            </div>
            <div class="pct"></div>
          </div>
          <div class="favorites"></div>
          <div class="buttons">
            <div class="btn" data-action="open" role="button"><ha-icon icon="mdi:arrow-up"></ha-icon></div>
            <div class="btn" data-action="stop" role="button"><ha-icon icon="mdi:stop"></ha-icon></div>
            <div class="btn" data-action="close" role="button"><ha-icon icon="mdi:arrow-down"></ha-icon></div>
          </div>
        </div>
      </ha-card>`;
    const q = (s) => root.querySelector(s);
    this._card = q('ha-card');
    this._els = {
      window: q('.window'), name: q('.name'), state: q('.state'), pct: q('.pct'), favorites: q('.favorites'),
      battery: q('.battery'), batteryIcon: q('.battery ha-icon'), batteryText: q('.battery span'),
      buttons: Object.fromEntries([...root.querySelectorAll('.btn')].map((b) => [b.dataset.action, b])),
    };
    for (const [action, btn] of Object.entries(this._els.buttons)) btn.addEventListener('click', () => this._command(action));
    q('.top').addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
    this._els.battery.addEventListener('click', (e) => {
      e.stopPropagation();
      this._fire('hass-more-info', { entityId: this._config.battery });
    });
    const win = this._els.window;
    win.addEventListener('pointerdown', (e) => this._onDown(e));
    win.addEventListener('pointermove', (e) => this._onMove(e));
    win.addEventListener('pointerup', (e) => this._onUp(e));
    win.addEventListener('pointercancel', () => this._endDrag());
  }

  _buildFavorites() {
    const box = this._els.favorites;
    box.replaceChildren();
    this._chips = (this._config.favorites ?? []).map((fav) => {
      const position = Math.max(0, Math.min(100, Number(fav.position)));
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.setAttribute('role', 'button');
      if (fav.icon) chip.appendChild(Object.assign(document.createElement('ha-icon'), { icon: fav.icon }));
      chip.append(fav.name ?? `${position} %`);
      chip.addEventListener('click', () => this._setPosition(position));
      box.appendChild(chip);
      return { chip, position };
    });
  }

  _stateObj() { return this._hass?.states[this._config.entity]; }

  _supports(s, feature) { return ((s?.attributes.supported_features ?? 0) & feature) !== 0; }

  // Position affichée : celle en cours de glissement, puis celle demandée en attendant HA, puis la réelle.
  _position(s) {
    if (this._drag?.moved) return this._drag.position;
    if (this._pending && Date.now() < this._pending.until) return this._pending.position;
    const pos = s?.attributes.current_position;
    if (pos != null) return pos;
    return s?.state === 'closed' ? 0 : s?.state === 'open' ? 100 : null;
  }

  _render() {
    if (!this._els || !this._hass) return;
    const c = this._config;
    const s = this._stateObj();
    const battery = c.battery ? this._hass.states[c.battery] : undefined;
    // Arrivée à la position demandée (ou mouvement terminé) : on reprend la position réelle.
    if (this._pending && s) {
      const reached = s.attributes.current_position === this._pending.position;
      const stopped = s.last_updated !== this._pending.since && !['opening', 'closing'].includes(s.state);
      if (reached || stopped || Date.now() > this._pending.until) this._pending = null;
    }
    const key = [s?.last_updated, battery?.last_updated, this._drag?.position, this._pending?.position].join();
    if (key === this._key) return;
    this._key = key;

    const unavailable = !s || s.state === 'unavailable';
    const hasPosition = this._supports(s, SET_POSITION) || s?.attributes.current_position != null;
    this.toggleAttribute('unavailable', unavailable);
    this.toggleAttribute('no-position', !hasPosition);
    const e = this._els;
    e.name.textContent = c.name ?? s?.attributes.friendly_name ?? c.entity;
    const position = this._position(s);
    e.state.textContent = this._stateText(s, position);
    e.pct.textContent = position != null ? `${Math.round(position)} %` : '';
    e.window.setAttribute('aria-valuenow', String(position ?? 0));
    this._card.style.setProperty('--m3-closed', `${100 - (position ?? 100)}%`);

    const moving = s?.state === 'opening' ? 'open' : s?.state === 'closing' ? 'close' : null;
    for (const [action, btn] of Object.entries(e.buttons)) {
      const feature = { open: OPEN, stop: STOP, close: CLOSE }[action];
      btn.toggleAttribute('disabled', !!s && !this._supports(s, feature));
      btn.toggleAttribute('active', action === moving);
    }
    btnDisableAtLimit(e.buttons, position, moving);
    for (const { chip, position: p } of this._chips) chip.toggleAttribute('active', position != null && Math.round(position) === p);

    const level = parseFloat(battery?.state);
    e.battery.hidden = !battery;
    if (battery) {
      e.batteryIcon.icon = battery.attributes.icon ?? batteryIcon(level);
      e.batteryText.textContent = isFinite(level) ? `${Math.round(level)} %` : t(this._hass, 'Not found');
      e.battery.toggleAttribute('low', isFinite(level) && level <= LOW_BATTERY);
    }

    const accent = c.color ? cssColor(c.color) : 'var(--md-sys-color-primary, var(--primary-color))';
    this._card.style.setProperty('--m3-accent', accent);
    this._card.style.setProperty('--m3-on-accent', c.color ? '#1c1b1f' : 'var(--md-sys-color-on-primary, #fff)');
  }

  _stateText(s, position) {
    if (!s) return t(this._hass, 'Not found');
    if (s.state === 'opening') return t(this._hass, 'Opening…');
    if (s.state === 'closing') return t(this._hass, 'Closing…');
    if (this._drag?.moved || (this._pending && Date.now() < this._pending.until)) return t(this._hass, 'Moving to {pct} %', { pct: Math.round(position) });
    if (position == null) return this._hass.formatEntityState?.(s) ?? s.state;
    if (position >= 100) return t(this._hass, 'Fully open');
    if (position <= 0) return t(this._hass, 'Fully closed');
    return t(this._hass, 'Open at {pct} %', { pct: Math.round(position) });
  }

  _command(action) {
    this._fire('haptic', 'light');
    this._pending = null;
    this._key = null;
    const service = { open: 'open_cover', stop: 'stop_cover', close: 'close_cover' }[action];
    this._hass.callService('cover', service, { entity_id: this._config.entity });
  }

  _setPosition(position) {
    const s = this._stateObj();
    this._fire('haptic', 'light');
    if (!this._supports(s, SET_POSITION)) {
      // Volet sans position : seuls ouvert et fermé sont possibles.
      this._command(position >= 50 ? 'open' : 'close');
      return;
    }
    this._pending = { position, since: s?.last_updated, until: Date.now() + PENDING_TTL };
    this._key = null;
    this._render();
    this._hass.callService('cover', 'set_cover_position', { entity_id: this._config.entity, position });
  }

  // Glisser sur la fenêtre : la position suit le doigt, envoyée au relâchement.
  _onDown(e) {
    const s = this._stateObj();
    if (!this._supports(s, SET_POSITION)) return;
    this._els.window.setPointerCapture(e.pointerId);
    this._drag = { id: e.pointerId, y: e.clientY, moved: false, position: this._position(s) ?? 100 };
  }

  _onMove(e) {
    if (!this._drag || e.pointerId !== this._drag.id) return;
    if (!this._drag.moved && Math.abs(e.clientY - this._drag.y) < 4) return;
    this._drag.moved = true;
    this.toggleAttribute('dragging', true);
    const rect = this._els.window.getBoundingClientRect();
    const closed = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const position = Math.round((1 - closed) * 100 / 5) * 5;
    if (position !== this._drag.position) {
      this._drag.position = position;
      this._render();
    }
  }

  _onUp(e) {
    if (!this._drag || e.pointerId !== this._drag.id) return;
    const { moved, position } = this._drag;
    this._endDrag();
    if (moved) this._setPosition(position);
    else this._fire('hass-more-info', { entityId: this._config.entity });
  }

  _endDrag() {
    this._drag = null;
    this.removeAttribute('dragging');
    this._key = null;
    this._render();
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

// Ouvrir n'a pas de sens si le volet est déjà ouvert, fermer s'il est déjà fermé (sauf pendant un mouvement).
function btnDisableAtLimit(buttons, position, moving) {
  if (moving || position == null) return;
  if (position >= 100) buttons.open.toggleAttribute('disabled', true);
  if (position <= 0) buttons.close.toggleAttribute('disabled', true);
}

defineEditor('m3-cover-card-editor', M3CoverCardEditor);

if (!customElements.get('m3-cover-card')) {
  customElements.define('m3-cover-card', M3CoverCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-cover-card',
    name: 'M3 Cover',
    description: t(null, 'Roller shutter: drag the window to set the position, open / stop / close, favorite positions and battery'),
    preview: true,
  });
}
