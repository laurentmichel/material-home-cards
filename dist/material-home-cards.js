/*! Material Home Cards v1.8.1 — https://github.com/laurentmichel/material-home-cards */
console.info('%c MATERIAL-HOME-CARDS %c v1.8.1 ', 'color:#fff;background:#6750a4;font-weight:700', 'color:#6750a4;background:#eaddff');

// ---- shared/editor.js ----
// Éditeur visuel commun : un <ha-form> natif de Home Assistant décrit par un schéma de sélecteurs.
// Chaque carte déclare une sous-classe avec `schema` et `labels`, et la renvoie via getConfigElement().

// ha-form est chargé à la demande par HA : on force son chargement via l'éditeur d'une carte native.
async function ensureHaForm() {
  if (customElements.get('ha-form')) return;
  const helpers = await window.loadCardHelpers?.();
  const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
  await card?.constructor?.getConfigElement?.();
  await customElements.whenDefined('ha-form');
}

class M3CardEditor extends HTMLElement {
  static schema = [];
  static labels = {};
  static helpers = {};

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      const { labels, helpers } = this.constructor;
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => labels[s.name] ?? s.name;
      this._form.computeHelper = (s) => helpers[s.name];
      this._form.addEventListener('value-changed', (e) => this._changed(e.detail.value));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this.constructor.schema;
  }

  // Les champs vidés sont retirés du YAML plutôt qu'enregistrés comme chaînes vides.
  _changed(value) {
    const config = { ...value };
    for (const key of Object.keys(config)) {
      if (config[key] === '' || config[key] == null) delete config[key];
    }
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }
}

const defineEditor = (tag, editorClass) => {
  if (!customElements.get(tag)) customElements.define(tag, editorClass);
};

// ---- shared/typography.js ----
// Typographie commune aux cartes : titre (nom de l'entité) et état / sous-titre.
const TITLE_FONT = 'font-size: 15px; font-weight: 550;';
const STATE_FONT = 'font-size: 13px; font-weight: 500; opacity: 0.8;';

// ---- m3-badge.js ----
{
// m3-badge — badge Material 3 pour le haut des vues : icône, valeur et couleur, en trois styles
// (chip tonal, pilule avec pastille, deux lignes). Contenu, icône et couleur acceptent les templates.
const SURFACE_HIGH = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';

const STYLE = `
:host { display: inline-block; --m3-color: var(--md-sys-color-primary, var(--primary-color)); }
.badge {
  display: flex; align-items: center; box-sizing: border-box; max-width: 100%;
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, transform 120ms ease;
}
.badge:active { transform: scale(0.96); }
.dot { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 300ms ease, color 300ms ease; }
.text { min-width: 0; display: flex; flex-direction: column; }
.value, .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label { display: none; }

/* Chip tonal : l'« assist chip » de Material 3, fond teinté de la couleur du badge. */
:host([variant='chip']) .badge {
  height: 32px; gap: 8px; padding: 0 12px 0 8px; border-radius: 8px;
  background: color-mix(in srgb, var(--m3-color) 18%, ${SURFACE_HIGH});
}
:host([variant='chip']) .dot { color: var(--m3-color); --mdc-icon-size: 18px; }
:host([variant='chip']) .value { font-size: 13px; font-weight: 500; }

/* Pilule : l'icône dans une pastille pleine de la couleur du badge. */
:host([variant='pill']) .badge {
  height: 40px; gap: 10px; padding: 0 16px 0 6px; border-radius: 20px; background: ${SURFACE_HIGH};
}
:host([variant='pill']) .dot { width: 28px; height: 28px; background: var(--m3-color); color: #fff; --mdc-icon-size: 16px; }
:host([variant='pill']) .value { font-size: 14px; font-weight: 550; }

/* Deux lignes : valeur et libellé, même typographie que les cartes. */
:host([variant='two-line']) .badge {
  height: 52px; gap: 10px; padding: 0 18px 0 8px; border-radius: 26px; background: ${SURFACE_HIGH};
}
:host([variant='two-line']) .dot {
  width: 36px; height: 36px; color: var(--m3-color); --mdc-icon-size: 20px;
  background: color-mix(in srgb, var(--m3-color) 20%, transparent);
}
:host([variant='two-line']) .value { ${TITLE_FONT} line-height: 1.2; }
:host([variant='two-line']) .label { display: block; ${STATE_FONT} line-height: 1.2; }
`;

const VARIANTS = ['chip', 'pill', 'two-line'];
// Clés acceptant un template Jinja (rendu par Home Assistant, mis à jour en direct).
const TEMPLATE_KEYS = ['content', 'icon', 'color', 'label'];
const isTemplate = (v) => typeof v === 'string' && /\{[{%]/.test(v);

// Couleurs nommées de HA (amber, blue...) → variables du thème ; le reste (hex, rgb) tel quel.
const HA_COLORS = new Set([
  'primary', 'accent', 'red', 'pink', 'purple', 'deep-purple', 'indigo', 'blue', 'light-blue', 'cyan', 'teal',
  'green', 'light-green', 'lime', 'yellow', 'amber', 'orange', 'deep-orange', 'brown', 'light-grey', 'grey',
  'dark-grey', 'blue-grey', 'black', 'white', 'disabled',
]);
const cssColor = (c) => (HA_COLORS.has(c) ? `var(--${c}-color)` : c);

const ACTIVE_STATES = new Set(['on', 'open', 'playing', 'unlocked', 'home', 'cleaning', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'active']);

class M3BadgeEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', selector: { entity: {} } },
    {
      name: 'variant', selector: {
        select: {
          mode: 'box', options: [
            { value: 'chip', label: 'Chip tonal' },
            { value: 'pill', label: 'Pilule' },
            { value: 'two-line', label: 'Deux lignes' },
          ],
        },
      },
    },
    {
      type: 'grid', name: '', schema: [
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        { name: 'color', selector: { ui_color: { include_state: true } } },
        { name: 'label', selector: { text: {} } },
        { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } },
      ],
    },
    { name: 'content', selector: { template: {} } },
    { name: 'tap_action', selector: { ui_action: {} } },
  ];

  static labels = {
    entity: 'Entité', variant: 'Style', icon: 'Icône', color: 'Couleur', label: 'Libellé (deux lignes)',
    attribute: 'Attribut affiché', content: 'Contenu (template)', tap_action: 'Appui',
  };

  static helpers = {
    color: 'Vide : couleur de l’état, comme les badges natifs',
    content: 'Remplace l’état ; icône, couleur et libellé acceptent aussi un template',
    tap_action: 'Vide : fenêtre de détails',
  };
}

class M3Badge extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-badge-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    return { entity: entities.find((e) => e.startsWith('light.')) ?? entities[0], variant: 'pill' };
  }

  setConfig(config) {
    if (!config) throw new Error('m3-badge : configuration invalide');
    if (config.variant && !VARIANTS.includes(config.variant)) {
      throw new Error(`m3-badge : « variant » doit valoir ${VARIANTS.join(', ')}`);
    }
    this._config = { variant: 'chip', ...config };
    this._tpl = {};
    this.setAttribute('variant', this._config.variant);
    if (!this.shadowRoot) this._build();
    this._resubscribe();
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._resubscribe();
    const stateObj = this._config.entity ? hass.states[this._config.entity] : undefined;
    if (!first && stateObj === this._stateObj) return;
    this._stateObj = stateObj;
    this._render();
  }

  connectedCallback() { this._resubscribe(); }

  disconnectedCallback() { this._unsubscribe(); }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="badge" role="button" tabindex="0">
        <div class="dot"><ha-state-icon></ha-state-icon></div>
        <div class="text"><span class="value"></span><span class="label"></span></div>
      </div>`;
    this._els = {
      badge: root.querySelector('.badge'),
      icon: root.querySelector('ha-state-icon'),
      value: root.querySelector('.value'),
      label: root.querySelector('.label'),
    };
    this._els.badge.addEventListener('click', () => this._tap());
    this._els.badge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this._tap(); });
  }

  // Un abonnement render_template par clé templatée ; HA renvoie le résultat à chaque changement.
  _resubscribe() {
    this._unsubscribe();
    if (!this._hass?.connection || !this._config || !this.isConnected) return;
    this._unsubs = TEMPLATE_KEYS.filter((key) => isTemplate(this._config[key])).map((key) =>
      this._hass.connection.subscribeMessage(
        (msg) => {
          if (!('result' in msg)) return;
          this._tpl[key] = String(msg.result ?? '').trim();
          this._render();
        },
        {
          type: 'render_template',
          template: this._config[key],
          variables: { config: this._config, user: this._hass.user?.name, entity: this._config.entity },
          strict: false,
        },
      ).catch(() => null));
  }

  _unsubscribe() {
    for (const unsub of this._unsubs ?? []) unsub.then((fn) => fn?.()).catch(() => {});
    this._unsubs = [];
  }

  // Valeur d'une clé : résultat du template si c'en est un, sinon la valeur brute.
  _get(key) {
    const v = this._config[key];
    return isTemplate(v) ? this._tpl[key] : v;
  }

  _render() {
    if (!this._els || !this._config) return;
    const c = this._config;
    const s = this._stateObj;
    const hass = this._hass;

    let value = this._get('content');
    if (value == null && !isTemplate(c.content)) {
      if (!s) value = c.entity ? 'Introuvable' : '';
      else if (c.attribute) value = hass?.formatEntityAttributeValue?.(s, c.attribute) ?? s.attributes[c.attribute];
      else value = hass?.formatEntityState?.(s) ?? s.state;
    }
    this._els.value.textContent = value ?? '';
    this._els.label.textContent = this._get('label') ?? s?.attributes.friendly_name ?? '';

    const icon = this._get('icon');
    Object.assign(this._els.icon, { hass, stateObj: s, icon: icon || undefined });

    let color = this._get('color');
    if (!color || color === 'state') {
      const [domain] = (c.entity ?? '').split('.');
      color = s && ACTIVE_STATES.has(s.state)
        ? `var(--state-${domain}-${s.state}-color, var(--state-${domain}-active-color, var(--state-active-color)))`
        : 'var(--state-inactive-color, var(--disabled-color))';
    }
    this.style.setProperty('--m3-color', cssColor(color));
  }

  _tap() {
    const c = this._config;
    this.dispatchEvent(new CustomEvent('haptic', { detail: 'light', bubbles: true, composed: true }));
    if (c.tap_action) {
      this.dispatchEvent(new CustomEvent('hass-action', {
        detail: { config: { entity: c.entity, tap_action: c.tap_action }, action: 'tap' }, bubbles: true, composed: true,
      }));
    } else if (c.entity) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: c.entity }, bubbles: true, composed: true }));
    }
  }
}

defineEditor('m3-badge-editor', M3BadgeEditor);

if (!customElements.get('m3-badge')) {
  customElements.define('m3-badge', M3Badge);
  window.customBadges = window.customBadges || [];
  window.customBadges.push({
    type: 'm3-badge',
    name: 'M3 Badge',
    description: 'Badge Material 3 : chip tonal, pilule avec pastille ou deux lignes',
    preview: true,
  });
}
}

// ---- m3-button-card.js ----
{
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
:host(:not([offline])) .badge { display: none; }
:host([offline]) ha-card { opacity: 0.6; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;
// Délai pour attendre un second appui, seulement si un double appui est configuré.
const DOUBLE_TAP_MS = 250;

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
        { name: 'double_tap_action', selector: { ui_action: {} } },
      ],
    },
  ];

  static labels = {
    entity: 'Entité', name: 'Nom', icon: 'Icône', icon_on: 'Icône allumé', icon_off: 'Icône éteint',
    text_on: 'Texte allumé', text_off: 'Texte éteint', show_state: 'Afficher l’état',
    tap_action: 'Appui', hold_action: 'Appui long', double_tap_action: 'Double appui',
  };

  static helpers = {
    tap_action: 'Vide : action adaptée à l’entité (allumer, lancer la scène, appuyer…)',
    hold_action: 'Vide : fenêtre de détails',
    double_tap_action: 'Vide : désactivé, l’appui simple reste instantané',
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
    description: 'Bouton Material 3 pour n’importe quelle entité, action adaptée au type d’entité',
    preview: true,
  });
}
}

// ---- m3-graph-card.js ----
{
// m3-graph-card — carte capteur Material 3 : valeur actuelle avec une courbe d'historique lissée
// dessinée en fond, couleurs d'alerte sous un seuil (batterie faible...).
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
  /* Centrage par la carte : fonctionne en grille (hauteur imposée) comme en popup (hauteur libre). */
  display: flex; align-items: center;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  cursor: pointer; user-select: none; -webkit-user-select: none;
  transition: background 300ms ease, color 300ms ease;
}
svg {
  position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: var(--m3-graph-height, 60%);
  pointer-events: none;
}
.area { fill: var(--m3-graph-fill); transition: fill 300ms ease; }
.line {
  fill: none; stroke: var(--m3-graph-line); stroke-width: 0.75; vector-effect: non-scaling-stroke;
  stroke-linejoin: round; stroke-linecap: round; transition: stroke 300ms ease;
}
.content {
  position: relative; display: flex; align-items: center; gap: 14px;
  width: 100%; padding: 0 20px; box-sizing: border-box;
}
.icon { flex: none; display: flex; color: var(--m3-icon-fg, inherit); }
.icon ha-state-icon { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.value { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chevron { --mdc-icon-size: 22px; flex: none; opacity: 0.9; }
:host(:not([chevron])) .chevron { display: none; }
:host([unavailable]) ha-card { opacity: 0.5; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const BUCKETS = 60;
const REFRESH_MS = 5 * 60 * 1000;

// Courbe monotone (Fritsch-Carlson) : lisse sans dépasser les valeurs réelles entre deux points.
function monotonePath(points) {
  const n = points.length;
  if (n < 2) return '';
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    m.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = dx[i] / 3;
    d += ` C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

// Moyenne par tranche de temps ; une tranche sans mesure reprend la dernière valeur connue.
function bucketize(samples, start, end) {
  const size = (end - start) / BUCKETS;
  const sums = new Array(BUCKETS).fill(0), counts = new Array(BUCKETS).fill(0);
  let before;
  for (const { t, v } of samples) {
    if (t < start) { before = v; continue; }
    const i = Math.min(BUCKETS - 1, Math.floor((t - start) / size));
    sums[i] += v; counts[i]++;
  }
  const out = [];
  let last = before;
  for (let i = 0; i < BUCKETS; i++) {
    if (counts[i]) last = sums[i] / counts[i];
    out.push(last);
  }
  return out;
}

class M3GraphCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { filter: { domain: ['sensor', 'input_number', 'number', 'counter'] } } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        { name: 'hours_to_show', selector: { number: { min: 1, max: 720, step: 1, mode: 'box', unit_of_measurement: 'h' } } },
        { name: 'graph_height', selector: { number: { min: 10, max: 100, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
        { name: 'color', selector: { text: {} } },
        { name: 'alert_below', selector: { number: { mode: 'box', step: 'any' } } },
      ],
    },
    { name: 'show_chevron', selector: { boolean: {} } },
  ];

  static labels = {
    entity: 'Entité', name: 'Nom', icon: 'Icône', hours_to_show: 'Période',
    graph_height: 'Hauteur de la courbe', color: 'Couleur de la courbe',
    alert_below: 'Alerte sous', show_chevron: 'Afficher le chevron',
  };

  static helpers = {
    color: 'Couleur CSS (#3b82f6, var(--...)). Vide : couleurs du thème',
    alert_below: 'Couleurs d’alerte quand la valeur passe sous ce seuil (ex. 15 pour une batterie)',
  };
}

class M3GraphCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-graph-card-editor');
  }

  static getStubConfig(hass) {
    const numeric = (e) => e.startsWith('sensor.') && !isNaN(parseFloat(hass.states[e].state));
    const entities = Object.keys(hass.states);
    const entity = entities.find((e) => numeric(e) && hass.states[e].attributes.device_class === 'battery')
      ?? entities.find(numeric) ?? 'sensor.example';
    return { entity, hours_to_show: 24 };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-graph-card : « entity » est obligatoire');
    const previous = this._config;
    this._config = { hours_to_show: 24, graph_height: 60, show_chevron: false, ...config };
    if (!this.shadowRoot) this._build();
    if (previous && (previous.entity !== config.entity || previous.hours_to_show !== this._config.hours_to_show)) {
      this._samples = null;
    }
    if (this._hass) { this._load(); this._render(); }
  }

  getCardSize() { return 2; }

  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 }; }

  connectedCallback() {
    this._timer = setInterval(() => { this._samples = null; this._load(); }, REFRESH_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (stateObj === this._stateObj) return;
    const previous = this._stateObj;
    this._stateObj = stateObj;
    // Mise à jour en direct : la nouvelle mesure s'ajoute à la courbe sans recharger l'historique.
    const v = parseFloat(stateObj?.state);
    if (previous && this._samples && !isNaN(v)) this._samples.push({ t: Date.now(), v });
    this._load();
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="area"></path><path class="line"></path>
        </svg>
        <div class="content">
          <div class="icon"><ha-state-icon></ha-state-icon></div>
          <div class="text"><div class="name"></div><div class="value"></div></div>
          <ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>
        </div>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      icon: root.querySelector('ha-state-icon'),
      name: root.querySelector('.name'),
      value: root.querySelector('.value'),
      area: root.querySelector('.area'),
      line: root.querySelector('.line'),
    };
    this._card.addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
  }

  // Historique via l'API WebSocket de HA (format compact : s = état, lu = horodatage en secondes).
  async _load() {
    if (this._samples || this._loading || !this._hass) return;
    this._loading = true;
    const entity = this._config.entity;
    const end = new Date();
    const start = new Date(end - this._config.hours_to_show * 3600 * 1000);
    try {
      const res = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: [entity],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      if (entity !== this._config.entity) return;
      this._samples = (res[entity] ?? [])
        .map((p) => ({ t: (p.lu ?? p.lc) * 1000, v: parseFloat(p.s) }))
        .filter((p) => !isNaN(p.v) && !isNaN(p.t));
    } catch (err) {
      console.warn('m3-graph-card : historique indisponible', err);
      this._samples = [];
    } finally {
      this._loading = false;
    }
    this._render();
  }

  _graphPaths() {
    const end = Date.now();
    const start = end - this._config.hours_to_show * 3600 * 1000;
    const samples = [...(this._samples ?? [])];
    const current = parseFloat(this._stateObj?.state);
    if (!isNaN(current)) samples.push({ t: end, v: current });
    const values = bucketize(samples, start, end);
    const first = values.findIndex((v) => v !== undefined);
    if (first === -1) return null;
    const defined = values.slice(first);
    let min = Math.min(...defined), max = Math.max(...defined);
    if (max - min < 1e-9) { min -= 1; max += 1; }
    // 8 % de marge en haut pour que la ligne ne touche pas le bord de la zone.
    const y = (v) => 100 - ((v - min) / (max - min)) * 92;
    const points = defined.map((v, i) => [((first + i) / (BUCKETS - 1)) * 100, y(v)]);
    if (points.length === 1) points.unshift([0, points[0][1]]);
    const line = monotonePath(points);
    return { line, area: `${line} L100,100 L${points[0][0]},100 Z` };
  }

  _render() {
    const s = this._stateObj;
    if (!this._card) return;
    const c = this._config;
    const unavailable = !s || s.state === 'unavailable' || s.state === 'unknown';
    const value = parseFloat(s?.state);
    const alert = c.alert_below != null && !isNaN(value) && value < Number(c.alert_below);

    this.toggleAttribute('unavailable', unavailable);
    this.toggleAttribute('chevron', !!c.show_chevron);
    this._els.name.textContent = c.name ?? s?.attributes.friendly_name ?? c.entity;
    // ha-state-icon choisit l'icône par défaut selon le capteur (batterie, température...) ; `icon` la remplace.
    Object.assign(this._els.icon, { hass: this._hass, stateObj: s, icon: c.icon });
    this._els.value.textContent = unavailable
      ? 'Indisponible'
      : (this._hass?.formatEntityState?.(s) ?? `${s.state} ${s.attributes.unit_of_measurement ?? ''}`.trim());

    const paths = this._graphPaths();
    this._els.area.setAttribute('d', paths?.area ?? '');
    this._els.line.setAttribute('d', paths?.line ?? '');

    const st = this._card.style;
    st.setProperty('--m3-graph-height', `${Math.max(10, Math.min(100, Number(c.graph_height)))}%`);
    if (alert) {
      st.setProperty('--m3-bg', 'var(--md-sys-color-error-container, rgba(var(--rgb-error-color, 219, 68, 55), 0.2))');
      st.setProperty('--m3-fg', 'var(--md-sys-color-on-error-container, var(--primary-text-color))');
      st.setProperty('--m3-graph-line', 'var(--md-sys-color-error, var(--error-color))');
      st.setProperty('--m3-graph-fill', 'color-mix(in srgb, var(--md-sys-color-error, var(--error-color)) 25%, transparent)');
    } else {
      st.setProperty('--m3-bg', SURFACE);
      st.setProperty('--m3-fg', ON_SURFACE);
      st.setProperty('--m3-graph-line', c.color ?? 'var(--md-sys-color-secondary, var(--secondary-text-color))');
      st.setProperty('--m3-graph-fill', c.color
        ? `color-mix(in srgb, ${c.color} 30%, transparent)`
        : 'var(--md-sys-color-secondary-container, rgba(127, 127, 127, 0.2))');
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-graph-card-editor', M3GraphCardEditor);

if (!customElements.get('m3-graph-card')) {
  customElements.define('m3-graph-card', M3GraphCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-graph-card',
    name: 'M3 Graph',
    description: 'Valeur d’un capteur avec sa courbe d’historique lissée en fond',
    preview: true,
  });
}
}

// ---- m3-light-slider-card.js ----
{
// m3-light-slider-card — carte lumière Material 3 : toute la carte est un slider,
// teintée avec la couleur actuelle de la lumière.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
  /* Centrage par la carte : fonctionne en grille (hauteur imposée) comme en popup (hauteur libre). */
  display: flex; align-items: center;
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
  position: relative; display: flex; align-items: center; gap: 14px;
  width: 100%; padding: 0 20px; box-sizing: border-box;
}
.icon { flex: none; display: flex; color: var(--m3-icon-fg); transition: color 300ms ease; }
.icon ha-icon { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} }
.pct { color: var(--m3-pct-fg); transition: color 300ms ease; font-size: 1.5rem; font-weight: 400; font-variant-numeric: tabular-nums; }
:host([unavailable]) ha-card { opacity: 0.5; cursor: default; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const SEND_INTERVAL = 300;
const PASTEL = 0.45;
const PENDING_TTL = 5000;

class M3LightSliderCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { filter: { domain: 'light' } } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
      ],
    },
  ];

  static labels = { entity: 'Entité', name: 'Nom', icon: 'Icône' };
}

class M3LightSliderCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-light-slider-card-editor');
  }


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

  // Hauteur auto : la carte fait 100 px (entre 1 rangée de 56 px et 2 rangées de 120 px).
  getGridOptions() { return { columns: 12, rows: 'auto', min_rows: 1 }; }

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
      // Ton pastel : la couleur de la lumière mélangée à 45 % de blanc.
      const [r, g, b] = (a.rgb_color ?? [255, 183, 77]).map((c) => Math.round(c + (255 - c) * PASTEL));
      const lightFill = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
      const overFill = pct >= 45;
      st.setProperty('--m3-fill', `rgb(${r}, ${g}, ${b})`);
      st.setProperty('--m3-bg', `linear-gradient(rgba(${r}, ${g}, ${b}, 0.22), rgba(${r}, ${g}, ${b}, 0.22)), ${SURFACE}`);
      st.setProperty('--m3-pct', `${Math.max(pct, 4)}%`);
      const onFill = lightFill ? '#1c1b1f' : '#ffffff';
      st.setProperty('--m3-fg', overFill ? onFill : ON_SURFACE);
      // Le pourcentage est collé au bord droit : il n'est sur la partie remplie qu'au-delà de ~85 %.
      st.setProperty('--m3-pct-fg', pct >= 85 ? onFill : ON_SURFACE);
      // Sans fond, l'icône (à gauche) est sur la partie remplie dès ~12 % : même contraste que le texte.
      st.setProperty('--m3-icon-fg', pct >= 12 ? onFill : ON_SURFACE);
    } else {
      st.setProperty('--m3-fill', 'transparent');
      st.setProperty('--m3-bg', SURFACE);
      st.setProperty('--m3-pct', '0%');
      st.setProperty('--m3-fg', ON_SURFACE);
      st.setProperty('--m3-pct-fg', ON_SURFACE);
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

defineEditor('m3-light-slider-card-editor', M3LightSliderCardEditor);

if (!customElements.get('m3-light-slider-card')) {
  customElements.define('m3-light-slider-card', M3LightSliderCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-light-slider-card',
    name: 'M3 Light Slider',
    description: 'Slider de luminosité Material 3 teinté avec la couleur de la lumière',
    preview: true,
  });
}
}

// ---- m3-popup-card.js ----
{
// m3-popup-card — popup Material 3 ouverte par un #hash dans l'URL (action « naviguer » vers #salon...).
// Panneau qui glisse depuis le bas sur mobile, fenêtre centrée sur ordinateur ; contient n'importe quelles cartes.
const PLACEHOLDER_STYLE = `
:host { display: none; }
:host([preview]) { display: block; }
ha-card {
  display: flex; align-items: center; gap: 14px; padding: 14px 20px; box-sizing: border-box;
  border-radius: 28px; border: 1px dashed var(--md-sys-color-outline, var(--divider-color));
  background: transparent; box-shadow: none; color: var(--md-sys-color-on-surface, var(--primary-text-color));
}
ha-icon { --mdc-icon-size: 24px; flex: none; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} }
.info { ${STATE_FONT} }
button {
  font: inherit; font-size: 14px; font-weight: 500; border: none; cursor: pointer;
  height: 36px; padding: 0 16px; border-radius: 18px;
  background: var(--md-sys-color-primary, var(--primary-color)); color: var(--md-sys-color-on-primary, #fff);
}
`;

// Styles de la popup elle-même : elle est rendue dans document.body, hors des conteneurs du tableau de bord.
const POPUP_STYLE = `
:host { position: fixed; inset: 0; z-index: 7; display: block; }
.backdrop {
  position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(var(--m3-blur)); -webkit-backdrop-filter: blur(var(--m3-blur));
  opacity: 0; transition: opacity 250ms ease;
}
.sheet {
  position: absolute; box-sizing: border-box; display: flex; flex-direction: column;
  max-height: 90vh; overflow: hidden;
  background: var(--md-sys-color-surface-container-low, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: transform 300ms cubic-bezier(0.2, 0, 0, 1), opacity 250ms ease;
}
:host([mobile]) .sheet {
  left: 50%; bottom: 0; width: var(--m3-width-mobile); max-height: 92vh;
  border-radius: var(--m3-radius) var(--m3-radius) 0 0;
  transform: translate(-50%, 100%);
}
:host(:not([mobile])) .sheet {
  left: 50%; top: 50%; width: min(var(--m3-width-desktop), calc(100vw - 32px));
  border-radius: var(--m3-radius);
  transform: translate(-50%, -50%) scale(0.94); opacity: 0;
}
:host([open]) .backdrop { opacity: 1; }
:host([open][mobile]) .sheet { transform: translate(-50%, var(--m3-drag, 0px)); }
:host([open]:not([mobile])) .sheet { transform: translate(-50%, -50%); opacity: 1; }
:host([dragging]) .sheet { transition: none; }
.handle { display: none; width: 32px; height: 4px; border-radius: 2px; margin: 12px auto 0; flex: none;
  background: var(--md-sys-color-on-surface-variant, var(--secondary-text-color)); opacity: 0.4; }
:host([mobile]) .handle { display: block; }
.header { display: flex; align-items: center; gap: 12px; padding: 16px 16px 8px 24px; flex: none; touch-action: none; }
:host([no-header]) .header { display: none; }
.header .icon { --mdc-icon-size: 24px; flex: none; }
.title { flex: 1; min-width: 0; }
.name { font-size: 20px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} }
.state:empty { display: none; }
button {
  font: inherit; color: inherit; border: none; background: none; padding: 0; margin: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.icon-button { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; }
.icon-button:hover { background: rgba(127, 127, 127, 0.12); }
.icon-button ha-icon { --mdc-icon-size: 22px; }
.switch {
  position: relative; width: 52px; height: 32px; border-radius: 16px; flex: none; box-sizing: border-box;
  border: 2px solid var(--md-sys-color-outline, rgba(127, 127, 127, 0.6));
  background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.15));
  transition: background 200ms ease, border-color 200ms ease;
}
.switch::after {
  content: ''; position: absolute; top: 50%; left: 6px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--md-sys-color-outline, rgba(127, 127, 127, 0.8));
  transform: translateY(-50%); transition: all 200ms ease;
}
.switch[aria-checked='true'] { background: var(--md-sys-color-primary, var(--primary-color)); border-color: transparent; }
.switch[aria-checked='true']::after { left: 22px; width: 24px; height: 24px; background: var(--md-sys-color-on-primary, #fff); }
.body { overflow-y: auto; padding: 8px 16px 24px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; }
:host([mobile]) .body { padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
`;

const isMobile = () => window.matchMedia('(max-width: 600px)').matches;

// Événements des cartes imbriquées à faire remonter dans l'arbre du tableau de bord, où HA les écoute.
const FORWARDED_EVENTS = ['hass-more-info', 'hass-action', 'show-dialog', 'hass-notification', 'haptic', 'll-custom'];

class M3PopupCardEditor extends M3CardEditor {
  static schema = [
    { name: 'hash', required: true, selector: { text: {} } },
    {
      type: 'expandable', name: 'header', title: 'En-tête', icon: 'mdi:page-layout-header', schema: [
        {
          type: 'grid', name: '', schema: [
            { name: 'name', selector: { text: {} } },
            { name: 'icon', selector: { icon: {} } },
            { name: 'entity', selector: { entity: {} } },
            {
              name: 'button_type',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: [
                    { value: 'name', label: 'Nom seulement' },
                    { value: 'state', label: 'Nom et état' },
                    { value: 'switch', label: 'Nom, état et interrupteur' },
                  ],
                },
              },
            },
          ],
        },
        { name: 'show_header', selector: { boolean: {} } },
      ],
    },
    {
      type: 'expandable', name: 'settings', title: 'Comportement', icon: 'mdi:gesture-swipe-down', schema: [
        { name: 'close_by_clicking_outside', selector: { boolean: {} } },
        {
          type: 'grid', name: '', schema: [
            { name: 'auto_close', selector: { number: { min: 0, step: 1000, mode: 'box', unit_of_measurement: 'ms' } } },
            { name: 'slide_to_close_distance', selector: { number: { min: 20, max: 400, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
          ],
        },
      ],
    },
    {
      type: 'expandable', name: 'style', title: 'Apparence', icon: 'mdi:palette-outline', schema: [
        {
          type: 'grid', name: '', schema: [
            { name: 'width_desktop', selector: { number: { min: 280, max: 1200, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
            { name: 'width_mobile', selector: { number: { min: 50, max: 100, step: 1, mode: 'box', unit_of_measurement: '%' } } },
            { name: 'border_radius', selector: { number: { min: 0, max: 48, step: 1, mode: 'box', unit_of_measurement: 'px' } } },
            { name: 'backdrop_blur', selector: { number: { min: 0, max: 30, step: 1, mode: 'box', unit_of_measurement: 'px' } } },
          ],
        },
      ],
    },
  ];

  static labels = {
    hash: 'Hash d’ouverture', name: 'Titre', icon: 'Icône', entity: 'Entité', button_type: 'En-tête',
    show_header: 'Afficher l’en-tête', close_by_clicking_outside: 'Fermer en appuyant à côté',
    auto_close: 'Fermeture automatique', slide_to_close_distance: 'Distance de glissement',
    width_desktop: 'Largeur (ordinateur)', width_mobile: 'Largeur (mobile)',
    border_radius: 'Arrondi', backdrop_blur: 'Flou du fond',
  };

  static helpers = {
    hash: 'Ex. #salon : ouvrir avec une action « Naviguer » vers #salon. Les cartes de la popup se modifient en YAML (cards:)',
    auto_close: '0 ou vide : pas de fermeture automatique',
  };
}

class M3PopupCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-popup-card-editor');
  }

  static getStubConfig() {
    return { hash: '#popup', header: { name: 'Popup', icon: 'mdi:dock-window' }, cards: [] };
  }

  setConfig(config) {
    if (!config || !config.hash || !String(config.hash).startsWith('#')) {
      throw new Error('m3-popup-card : « hash » est obligatoire et doit commencer par # (ex. #salon)');
    }
    this._config = config;
    this._header = { show_header: true, name: 'Popup', button_type: 'name', ...config.header };
    this._settings = { close_by_clicking_outside: true, slide_to_close_distance: 100, ...config.settings };
    this._style = { width_desktop: 540, width_mobile: 100, border_radius: 28, backdrop_blur: 6, ...config.style };
    this._cards = null;
    if (!this.shadowRoot) this._buildPlaceholder();
    this._renderPlaceholder();
    if (this._popup) { this._closeNow(); this._checkHash(); }
  }

  getCardSize() { return this._preview ? 1 : 0; }

  getGridOptions() { return { columns: 'full', rows: 'auto' }; }

  // HA passe preview = true en mode édition : on affiche alors un repère pour retrouver la carte.
  set preview(value) {
    this._preview = value;
    this.toggleAttribute('preview', !!value);
  }

  get preview() { return this._preview; }

  set hass(hass) {
    this._hass = hass;
    if (this._cards) for (const card of this._cards) card.hass = hass;
    if (this._popup) this._renderHeader();
  }

  connectedCallback() {
    this._onLocation = () => this._checkHash();
    for (const type of ['hashchange', 'location-changed', 'popstate']) window.addEventListener(type, this._onLocation);
    // Après une navigation interne, location-changed peut précéder la mise à jour de l'URL.
    setTimeout(this._onLocation, 0);
  }

  disconnectedCallback() {
    for (const type of ['hashchange', 'location-changed', 'popstate']) window.removeEventListener(type, this._onLocation);
    this._closeNow();
  }

  _buildPlaceholder() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${PLACEHOLDER_STYLE}</style>
      <ha-card>
        <ha-icon></ha-icon>
        <div class="text"><div class="name"></div><div class="info"></div></div>
        <button>Ouvrir</button>
      </ha-card>`;
    root.querySelector('button').addEventListener('click', () => this._open());
  }

  _renderPlaceholder() {
    const root = this.shadowRoot;
    const count = (this._config.cards ?? []).length;
    root.querySelector('ha-icon').icon = this._header.icon ?? 'mdi:dock-window';
    root.querySelector('.name').textContent = `Popup ${this._header.name}`;
    root.querySelector('.info').textContent = `${this._config.hash} • ${count} carte${count > 1 ? 's' : ''}`;
  }

  _checkHash() {
    const match = window.location.hash === this._config?.hash;
    if (match && !this._popup) this._open();
    else if (!match && this._popup && !this._manual) this._close(false);
  }

  async _createCards() {
    const helpers = await window.loadCardHelpers?.();
    const configs = this._config.cards ?? [];
    this._cards = configs.map((config) => {
      const card = helpers ? helpers.createCardElement(config) : document.createElement('div');
      card.hass = this._hass;
      return card;
    });
    return this._cards;
  }

  async _open() {
    if (this._popup) return;
    this._manual = window.location.hash !== this._config.hash;
    const popup = document.createElement('m3-popup-overlay');
    this._popup = popup;
    this._openedAt = Date.now();
    this._backdropDown = false;
    const root = popup.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${POPUP_STYLE}</style>
      <div class="backdrop"></div>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="handle"></div>
        <div class="header">
          <ha-icon class="icon"></ha-icon>
          <div class="title"><div class="name"></div><div class="state"></div></div>
          <button class="switch" role="switch" aria-label="Allumer / éteindre"></button>
          <button class="icon-button close" aria-label="Fermer"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <div class="body"></div>
      </div>`;
    const st = popup.style;
    // Rendue dans document.body, la popup n'hérite pas de la police du tableau de bord : on reprend celle de la carte.
    const font = getComputedStyle(this);
    st.fontFamily = font.fontFamily;
    st.setProperty('-webkit-font-smoothing', font.getPropertyValue('-webkit-font-smoothing') || 'antialiased');
    st.setProperty('--m3-blur', `${Number(this._style.backdrop_blur)}px`);
    st.setProperty('--m3-radius', `${Number(this._style.border_radius)}px`);
    st.setProperty('--m3-width-desktop', `${Number(this._style.width_desktop)}px`);
    st.setProperty('--m3-width-mobile', `${Number(this._style.width_mobile)}%`);
    popup.toggleAttribute('mobile', isMobile());
    popup.toggleAttribute('no-header', !this._header.show_header);

    // Le même clic fantôme peut tomber sur une carte de la popup (bouton du thermostat...) : on l'absorbe.
    popup.addEventListener('click', (e) => {
      if (Date.now() - this._openedAt < 350) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    for (const type of FORWARDED_EVENTS) {
      popup.addEventListener(type, (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent(type, { detail: e.detail, bubbles: true, composed: true }));
      });
    }
    // Sur écran tactile, le « click » qui suit l'appui sur le bouton d'ouverture retombe sur le fond
    // qui vient d'apparaître : on ne ferme que si l'appui a commencé sur le fond, et pas juste après l'ouverture.
    const backdrop = root.querySelector('.backdrop');
    backdrop.addEventListener('pointerdown', () => { this._backdropDown = Date.now() - this._openedAt > 300; });
    backdrop.addEventListener('click', () => {
      const fromBackdrop = this._backdropDown;
      this._backdropDown = false;
      if (fromBackdrop && this._settings.close_by_clicking_outside) this._close();
    });
    root.querySelector('.close').addEventListener('click', () => this._close());
    root.querySelector('.switch').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('haptic', { detail: 'light', bubbles: true, composed: true }));
      this._hass?.callService('homeassistant', 'toggle', { entity_id: this._header.entity });
    });
    this._setupDrag(root.querySelector('.header'), root.querySelector('.handle'));
    this._onKey = (e) => { if (e.key === 'Escape') this._close(); };
    window.addEventListener('keydown', this._onKey);

    document.body.appendChild(popup);
    this._renderHeader();
    const body = root.querySelector('.body');
    for (const card of await this._createCards()) body.appendChild(card);

    this._scrollLock = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => popup.setAttribute('open', '')));
    clearTimeout(this._autoClose);
    if (Number(this._settings.auto_close) > 0) {
      this._autoClose = setTimeout(() => this._close(), Number(this._settings.auto_close));
    }
  }

  _renderHeader() {
    const root = this._popup?.shadowRoot;
    if (!root) return;
    const h = this._header;
    const stateObj = h.entity ? this._hass?.states[h.entity] : undefined;
    const icon = root.querySelector('.header .icon');
    icon.icon = h.icon ?? stateObj?.attributes.icon ?? '';
    icon.style.display = icon.icon ? '' : 'none';
    root.querySelector('.name').textContent = h.name;
    const showState = stateObj && (h.button_type === 'state' || h.button_type === 'switch');
    root.querySelector('.state').textContent = showState ? (this._hass.formatEntityState?.(stateObj) ?? stateObj.state) : '';
    const sw = root.querySelector('.switch');
    sw.style.display = stateObj && h.button_type === 'switch' ? '' : 'none';
    sw.setAttribute('aria-checked', String(stateObj?.state === 'on'));
  }

  // Glisser l'en-tête (ou la poignée) vers le bas ferme le panneau sur mobile.
  _setupDrag(...handles) {
    for (const handle of handles) {
      handle.addEventListener('pointerdown', (e) => {
        if (!this._popup?.hasAttribute('mobile') || e.target.closest('button')) return;
        this._dragStart = e.clientY;
        handle.setPointerCapture(e.pointerId);
        this._popup.setAttribute('dragging', '');
      });
      handle.addEventListener('pointermove', (e) => {
        if (this._dragStart == null) return;
        this._dragY = Math.max(0, e.clientY - this._dragStart);
        this._popup.style.setProperty('--m3-drag', `${this._dragY}px`);
      });
      const end = () => {
        if (this._dragStart == null) return;
        this._dragStart = null;
        this._popup.removeAttribute('dragging');
        if (this._dragY > Number(this._settings.slide_to_close_distance)) this._close();
        else this._popup.style.setProperty('--m3-drag', '0px');
        this._dragY = 0;
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }
  }

  // Fermeture : animation, puis retrait du #hash de l'URL pour que la popup ne se rouvre pas.
  _close(clearHash = true) {
    const popup = this._popup;
    if (!popup || popup.closing) return;
    popup.closing = true;
    popup.removeAttribute('open');
    if (clearHash && window.location.hash === this._config.hash) {
      history.replaceState(history.state, '', window.location.href.split('#')[0]);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: true } }));
    }
    setTimeout(() => this._closeNow(), 300);
  }

  _closeNow() {
    clearTimeout(this._autoClose);
    window.removeEventListener('keydown', this._onKey);
    if (this._popup) {
      this._popup.remove();
      document.documentElement.style.overflow = this._scrollLock ?? '';
    }
    this._popup = null;
    this._cards = null;
    this._manual = false;
  }
}

if (!customElements.get('m3-popup-overlay')) customElements.define('m3-popup-overlay', class extends HTMLElement {});
defineEditor('m3-popup-card-editor', M3PopupCardEditor);

if (!customElements.get('m3-popup-card')) {
  customElements.define('m3-popup-card', M3PopupCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-popup-card',
    name: 'M3 Popup',
    description: 'Popup Material 3 ouverte par un #hash, contenant n’importe quelles cartes',
  });
}
}

// ---- m3-room-card.js ----
{
// m3-room-card — carte pièce Material 3 : nom, icône, température et humidité de la pièce.
// Le fond prend la couleur pastel de la lumière quand elle est allumée, l'icône devient une flamme rouge quand le chauffage est en marche.
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
    climate: 'L’icône devient une flamme quand le chauffage est en marche ; sa température sert si aucun capteur n’est choisi',
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

    // Chauffage en marche : le thermostat n'est pas éteint, même s'il ne chauffe pas à cet instant.
    const heating = climate && !['off', 'unavailable', 'unknown'].includes(climate.state);
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
    // Chauffage en marche : la flamme prend la couleur d'erreur du thème (rouge), plus foncée sur un fond clair.
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
  heat: { label: 'Chauffage', icon: 'mdi:fire' },
  cool: { label: 'Climatisation', icon: 'mdi:snowflake' },
  heat_cool: { label: 'Chaud / froid', icon: 'mdi:sun-snowflake-variant' },
  auto: { label: 'Auto', icon: 'mdi:thermostat-auto' },
  dry: { label: 'Déshumidification', icon: 'mdi:water-percent' },
  fan_only: { label: 'Ventilation', icon: 'mdi:fan' },
  off: { label: 'Arrêt', icon: 'mdi:power' },
};

const fmt = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

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
    entity: 'Entité', name: 'Nom', icon: 'Icône',
    step: 'Pas des boutons − / +', hvac_mode: 'Mode au démarrage',
  };

  static helpers = {
    icon: 'Laisser vide pour que l’icône suive le mode',
    hvac_mode: 'Mode activé par le bouton Marche (par défaut : chauffage)',
  };
}

class M3ThermostatCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-thermostat-card-editor');
  }


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

defineEditor('m3-thermostat-card-editor', M3ThermostatCardEditor);

if (!customElements.get('m3-thermostat-card')) {
  customElements.define('m3-thermostat-card', M3ThermostatCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-thermostat-card',
    name: 'M3 Thermostat',
    description: 'Thermostat Material 3 avec consigne réglable et affichage immédiat',
    preview: true,
  });
}
}
