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
      color = isActive(s)
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
