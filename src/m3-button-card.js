// m3-button-card — bouton Material 3 pour n'importe quelle entité : icône, nom, état,
// action par défaut adaptée au domaine (allumer, lancer une scène, appuyer...) et teinte quand c'est actif.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; align-items: center; gap: 14px; padding: 0 20px;
  cursor: pointer; touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
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
/* Pastille à droite (numéro d'ordre, compteur...) : inversée par rapport à la carte. */
.chip {
  flex: none; min-width: 28px; height: 28px; box-sizing: border-box; padding: 0 8px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  background: var(--m3-fg); color: var(--m3-chip-fg, var(--md-sys-color-surface, #fff)); font-size: 13px; font-weight: 700;
}
.chip:empty { display: none; }
:host(:not([offline])) .badge { display: none; }
:host([offline]) ha-card { opacity: 0.6; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;
// Délai pour attendre un second appui, seulement si un double appui est configuré.
const DOUBLE_TAP_MS = 250;

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
      type: 'expandable', name: '', title: 'On / off', icon: 'mdi:toggle-switch-outline', schema: [
        {
          type: 'grid', name: '', schema: [
            { name: 'icon_on', selector: { icon: {} }, context: { icon_entity: 'entity' } },
            { name: 'icon_off', selector: { icon: {} }, context: { icon_entity: 'entity' } },
            { name: 'text_on', selector: { text: {} } },
            { name: 'text_off', selector: { text: {} } },
          ],
        },
        { name: 'show_state', selector: { boolean: {} } },
        { name: 'color', selector: { ui_color: {} } },
        { name: 'active', selector: { template: {} } },
        { name: 'chip', selector: { template: {} } },
      ],
    },
    {
      type: 'expandable', name: '', title: 'Actions', icon: 'mdi:gesture-tap', schema: [
        { name: 'tap_action', selector: { ui_action: {} } },
        { name: 'hold_action', selector: { ui_action: {} } },
        { name: 'double_tap_action', selector: { ui_action: {} } },
      ],
    },
  ];

  static labels = {
    entity: 'Entity', name: 'Name', icon: 'Icon', icon_on: 'Icon when on', icon_off: 'Icon when off',
    text_on: 'Text when on', text_off: 'Text when off', show_state: 'Show the state',
    tap_action: 'Tap', hold_action: 'Long press', double_tap_action: 'Double tap',
    color: 'Color when active', active: 'Active when (template)', chip: 'Chip on the right (text or template)',
  };

  static helpers = {
    tap_action: 'Empty: action suited to the entity (turn on, run the scene, press…)',
    hold_action: 'Empty: more-info dialog',
    double_tap_action: 'Empty: disabled, a single tap stays instant',
    color: 'Empty: theme primary color',
    active: 'Empty: based on the entity state. E.g. {{ is_state(\'vacuum.robot\', \'cleaning\') }}',
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
    if (!config || !config.entity) throw new Error('m3-button-card: "entity" is required');
    this._config = { show_state: true, ...config };
    this._tpl = {};
    if (!this.shadowRoot) this._build();
    this._resubscribe();
    if (this._hass) this._render();
  }

  connectedCallback() { this._resubscribe(); }

  disconnectedCallback() { unsubscribeAll(this._unsubs); this._unsubs = []; }

  // `active` et `chip` peuvent être des templates : Home Assistant renvoie leur résultat à chaque changement.
  _resubscribe() {
    unsubscribeAll(this._unsubs);
    this._unsubs = [];
    const c = this._config;
    if (!this._hass?.connection || !c || !this.isConnected) return;
    const variables = { config: c, user: this._hass.user?.name, entity: c.entity };
    this._unsubs = ['active', 'chip'].filter((key) => isTemplate(c[key])).map((key) =>
      subscribeTemplate(this._hass, c[key], variables, (result) => {
        this._tpl[key] = result;
        this._render();
      }));
  }

  getCardSize() { return 2; }

  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 }; }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._resubscribe();
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
        <span class="chip"></span>
        <ha-icon class="badge" icon="mdi:alert-circle-outline" title="${t(this._hass, 'Offline')}"></ha-icon>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      icon: root.querySelector('ha-state-icon'),
      name: root.querySelector('.name'),
      state: root.querySelector('.state'),
      chip: root.querySelector('.chip'),
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
    // `active` : template, booléen, ou à défaut l'état de l'entité.
    const forced = isTemplate(c.active) ? isTruthy(this._tpl.active) : c.active != null ? isTruthy(c.active) : null;
    const active = !offline && (forced ?? isActive(s));

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
    this._els.chip.textContent = (isTemplate(c.chip) ? this._tpl.chip : c.chip) ?? '';

    const st = this._card.style;
    if (active && c.color) {
      // Couleur choisie : ton pastel, texte sombre.
      st.setProperty('--m3-bg', `color-mix(in srgb, ${cssColor(c.color)} 62%, white)`);
      st.setProperty('--m3-fg', '#1c1b1f');
      st.setProperty('--m3-icon-fg', '#1c1b1f');
      st.setProperty('--m3-chip-fg', '#ffffff');
      return;
    }
    st.setProperty('--m3-bg', active ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', active ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-icon-fg', active ? 'var(--md-sys-color-primary, var(--primary-color))' : ON_SURFACE);
  }

  _stateText(s, active, offline) {
    if (offline) return t(this._hass, 'Offline');
    const c = this._config;
    if (active && c.text_on) return c.text_on;
    if (!active && c.text_off) return c.text_off;
    const format = (obj, attr) => this._hass?.formatEntityAttributeValue?.(obj, attr) ?? obj.attributes[attr];
    const state = this._hass?.formatEntityState?.(s) ?? s.state;
    const [domain] = s.entity_id.split('.');
    // L'état d'une scène ou d'un bouton est la date du dernier déclenchement : rien à afficher.
    if (['scene', 'button', 'input_button'].includes(domain)) return null;
    if (domain === 'script') return s.state === 'on' ? t(this._hass, 'Running') : null;
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
    if (this._down && !this._held) this._tap();
    this._down = false;
  }

  // Sans double appui configuré, l'appui part tout de suite ; sinon on attend un éventuel second appui.
  _tap() {
    if (!this._config.double_tap_action) {
      this._run('tap');
    } else if (this._tapTimer) {
      clearTimeout(this._tapTimer);
      this._tapTimer = null;
      this._run('double_tap');
    } else {
      this._tapTimer = setTimeout(() => {
        this._tapTimer = null;
        this._run('tap');
      }, DOUBLE_TAP_MS);
    }
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
    description: t(null, 'Material 3 button for any entity, with an action suited to the entity type'),
    preview: true,
  });
}
