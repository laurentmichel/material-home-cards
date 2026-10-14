// m3-button-card — bouton Material 3 pour n'importe quelle entité : icône, nom, état,
// action par défaut adaptée au domaine (allumer, lancer une scène, appuyer...) et teinte quand c'est actif.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; align-items: center; gap: 14px; padding: 0 20px;
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, color 300ms ease, transform 120ms ease;
}
ha-card:active { transform: scale(0.98); }
.icon { flex: none; display: flex; color: var(--m3-icon-fg); transition: color 300ms ease; }
.icon > * { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
:host([no-state]) .state { display: none; }
.badge { flex: none; --mdc-icon-size: 20px; }
:host(:not([offline])) .badge { display: none; }
:host([offline]) ha-card { opacity: 0.6; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;

// États considérés comme « actifs » : la carte prend alors la teinte primary-container.
const ACTIVE_STATES = new Set([
  'on', 'open', 'opening', 'closing', 'playing', 'unlocked', 'unlocking', 'home',
  'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'cleaning', 'active',
  'armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'armed_custom_bypass', 'triggered',
]);

const TOGGLE_DOMAINS = new Set([
  'light', 'switch', 'input_boolean', 'fan', 'cover', 'humidifier', 'siren', 'valve', 'group', 'remote',
]);

// Action par défaut d'un appui, selon le domaine ; null = fenêtre de détails.
function defaultTapService(stateObj) {
  const [domain] = stateObj.entity_id.split('.');
  const s = stateObj.state;
  if (TOGGLE_DOMAINS.has(domain)) return ['homeassistant', 'toggle'];
  switch (domain) {
    case 'scene': return ['scene', 'turn_on'];
    case 'script': return ['script', 'turn_on'];
    case 'automation': return ['automation', 'trigger'];
    case 'button': return ['button', 'press'];
    case 'input_button': return ['input_button', 'press'];
    case 'lock': return ['lock', s === 'locked' ? 'unlock' : 'lock'];
    case 'media_player': return ['media_player', 'media_play_pause'];
    case 'vacuum': return ['vacuum', s === 'cleaning' ? 'return_to_base' : 'start'];
    default: return null;
  }
}

class M3ButtonCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: {} } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
      ],
    },
    {
      type: 'expandable', name: '', title: 'Allumé / éteint', icon: 'mdi:toggle-switch-outline', schema: [
        {
          type: 'grid', name: '', schema: [
            { name: 'icon_on', selector: { icon: {} }, context: { icon_entity: 'entity' } },
            { name: 'icon_off', selector: { icon: {} }, context: { icon_entity: 'entity' } },
            { name: 'text_on', selector: { text: {} } },
            { name: 'text_off', selector: { text: {} } },
          ],
        },
        { name: 'show_state', selector: { boolean: {} } },
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
    entity: 'Entité', name: 'Nom', icon: 'Icône', icon_on: 'Icône allumé', icon_off: 'Icône éteint',
    text_on: 'Texte allumé', text_off: 'Texte éteint', show_state: 'Afficher l’état',
    tap_action: 'Appui', hold_action: 'Appui long',
  };

  static helpers = {
    tap_action: 'Vide : action adaptée à l’entité (allumer, lancer la scène, appuyer…)',
    hold_action: 'Vide : fenêtre de détails',
  };
}

class M3ButtonCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-button-card-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    return { entity: entities.find((e) => e.startsWith('light.')) ?? entities.find((e) => e.startsWith('switch.')) ?? entities[0] };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-button-card : « entity » est obligatoire');
    this._config = { show_state: true, ...config };
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  getCardSize() { return 2; }

  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 }; }

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
        <div class="icon"><ha-state-icon></ha-state-icon></div>
        <div class="text"><div class="name"></div><div class="state"></div></div>
        <ha-icon class="badge" icon="mdi:alert-circle-outline" title="Hors ligne"></ha-icon>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      icon: root.querySelector('ha-state-icon'),
      name: root.querySelector('.name'),
      state: root.querySelector('.state'),
    };
    this._card.addEventListener('pointerdown', (e) => this._onDown(e));
    this._card.addEventListener('pointerup', () => this._onUp());
    this._card.addEventListener('pointerleave', () => this._cancel());
    this._card.addEventListener('pointercancel', () => this._cancel());
    this._card.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _render() {
    if (!this._card) return;
    const c = this._config;
    const s = this._stateObj;
    const offline = !s || s.state === 'unavailable' || s.state === 'unknown';
    const domain = c.entity.split('.')[0];
    const active = !offline && (domain === 'climate' ? s.state !== 'off' : ACTIVE_STATES.has(s.state));

    this.toggleAttribute('offline', offline);
    const text = this._stateText(s, active, offline);
    this.toggleAttribute('no-state', c.show_state === false || !text);
    this._els.name.textContent = c.name ?? s?.attributes.friendly_name ?? c.entity;
    Object.assign(this._els.icon, {
      hass: this._hass,
      stateObj: s,
      icon: (active ? c.icon_on : c.icon_off) ?? c.icon,
    });
    this._els.state.textContent = text ?? '';

    const st = this._card.style;
    st.setProperty('--m3-bg', active ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', active ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-icon-fg', active ? 'var(--md-sys-color-primary, var(--primary-color))' : ON_SURFACE);
  }

  _stateText(s, active, offline) {
    if (offline) return 'Hors ligne';
    const c = this._config;
    if (active && c.text_on) return c.text_on;
    if (!active && c.text_off) return c.text_off;
    const format = (obj, attr) => this._hass?.formatEntityAttributeValue?.(obj, attr) ?? obj.attributes[attr];
    const state = this._hass?.formatEntityState?.(s) ?? s.state;
    const [domain] = s.entity_id.split('.');
    // L'état d'une scène ou d'un bouton est la date du dernier déclenchement : rien à afficher.
    if (['scene', 'button', 'input_button'].includes(domain)) return null;
    if (domain === 'script') return s.state === 'on' ? 'En cours' : null;
    if (domain === 'climate' && s.attributes.current_temperature != null) {
      return `${state} • ${format(s, 'current_temperature')}`;
    }
    if (domain === 'light' && active && s.attributes.brightness != null) {
      return `${state} • ${Math.round((s.attributes.brightness / 255) * 100)} %`;
    }
    if (domain === 'media_player' && active && s.attributes.media_title) {
      return [s.attributes.media_title, s.attributes.media_artist].filter(Boolean).join(' • ');
    }
    return state;
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

  // Glissement hors de la carte ou défilement : ni appui ni appui long.
  _cancel() {
    clearTimeout(this._holdTimer);
    this._down = false;
  }

  // Action configurée → gestion native de HA (hass-action) ; sinon action par défaut du domaine.
  _run(kind) {
    const c = this._config;
    const configured = c[`${kind}_action`];
    this._fire('haptic', kind === 'hold' ? 'medium' : 'light');
    if (configured) {
      this._fire('hass-action', { config: { entity: c.entity, [`${kind}_action`]: configured }, action: kind });
      return;
    }
    const offline = this.hasAttribute('offline');
    const service = kind === 'tap' && !offline && this._stateObj ? defaultTapService(this._stateObj) : null;
    if (service) {
      this._hass.callService(service[0], service[1], { entity_id: c.entity });
    } else {
      this._fire('hass-more-info', { entityId: c.entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-button-card-editor', M3ButtonCardEditor);

if (!customElements.get('m3-button-card')) {
  customElements.define('m3-button-card', M3ButtonCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-button-card',
    name: 'M3 Button',
    description: 'Bouton Material 3 pour n’importe quelle entité, action adaptée au type d’entité',
    preview: true,
  });
}
