// m3-list-card — liste Material 3 Expressive : des lignes empilées (icône, titre, sous-titre, élément à droite)
// qui forment un bloc aux grands coins arrondis, comme les réglages Android. Une ligne active se teinte.
const STYLE = `
:host { display: block; }
ha-card { background: none; border: none; box-shadow: none; }
.title { ${TITLE_FONT} padding: 4px 4px 10px; color: var(--md-sys-color-on-surface, var(--primary-text-color)); }
:host(:not([titled])) .title { display: none; }
.rows { display: flex; flex-direction: column; gap: 2px; }
.row {
  display: flex; align-items: center; gap: 16px; min-height: 64px; box-sizing: border-box; padding: 10px 16px 10px 20px;
  border-radius: 4px; background: var(--m3-bg); color: var(--m3-fg);
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, color 300ms ease, border-radius 200ms ease;
}
.row:first-child { border-top-left-radius: var(--m3-radius); border-top-right-radius: var(--m3-radius); }
.row:last-child { border-bottom-left-radius: var(--m3-radius); border-bottom-right-radius: var(--m3-radius); }
.row:active { border-radius: calc(var(--m3-radius) / 2); }
.icon { flex: none; display: flex; color: var(--m3-icon-fg); --mdc-icon-size: 24px; transition: color 300ms ease; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label:empty { display: none; }
.trailing { flex: none; display: flex; align-items: center; }
.state { ${STATE_FONT} }
.chevron { --mdc-icon-size: 24px; opacity: 0.7; }
.row[offline] { opacity: 0.6; }

/* Interrupteur Material 3 : rail 52 × 32, pastille qui grossit quand il est activé. */
.switch {
  position: relative; width: 52px; height: 32px; box-sizing: border-box; border-radius: 16px;
  border: 2px solid var(--md-sys-color-outline, var(--secondary-text-color));
  background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.2));
  transition: background 200ms ease, border-color 200ms ease;
}
.switch::after {
  content: ''; position: absolute; top: 50%; left: 6px; width: 16px; height: 16px; border-radius: 50%;
  transform: translateY(-50%); background: var(--md-sys-color-outline, var(--secondary-text-color));
  transition: all 200ms cubic-bezier(0.2, 0, 0, 1);
}
.switch[on] { background: var(--md-sys-color-primary, var(--primary-color)); border-color: transparent; }
.switch[on]::after { left: 22px; width: 24px; height: 24px; background: var(--md-sys-color-on-primary, #fff); }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;
const RADIUS = { small: 12, medium: 20, large: 28 };
const TRAILING = ['auto', 'state', 'switch', 'chevron', 'none'];

class M3ListCardEditor extends M3CardEditor {
  static schema = [
    {
      type: 'grid', name: '', schema: [
        { name: 'title', selector: { text: {} } },
        {
          name: 'radius', selector: {
            select: { mode: 'dropdown', options: [
              { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' },
            ] },
          },
        },
      ],
    },
    { name: 'dynamic', selector: { boolean: {} } },
    {
      name: 'rows', selector: {
        object: {
          multiple: true, label_field: 'name', description_field: 'entity',
          fields: {
            entity: { label: 'Entity', selector: { entity: {} } },
            name: { label: 'Name', selector: { text: {} } },
            label: { label: 'Subtitle (empty: entity state)', selector: { text: {} } },
            label_on: { label: 'Subtitle when active', selector: { text: {} } },
            label_off: { label: 'Subtitle when inactive', selector: { text: {} } },
            alert_below: { label: 'Alert below (value)', selector: { number: { mode: 'box', step: 'any' } } },
            icon: { label: 'Icon', selector: { icon: {} } },
            trailing: {
              label: 'On the right', selector: {
                select: { mode: 'dropdown', options: [
                  { value: 'auto', label: 'Automatic' }, { value: 'switch', label: 'Switch' },
                  { value: 'state', label: 'State' }, { value: 'chevron', label: 'Chevron' }, { value: 'none', label: 'Nothing' },
                ] },
              },
            },
            tap_action: { label: 'Tap', selector: { ui_action: {} } },
            hold_action: { label: 'Long press', selector: { ui_action: {} } },
          },
        },
      },
    },
  ];

  static labels = { title: 'Title', radius: 'Corners', dynamic: 'Tint active rows', rows: 'Rows' };

  static helpers = {
    rows: 'On the right, "Automatic": a switch for things that turn on, a chevron for navigation',
  };
}

class M3ListCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-list-card-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    const pick = (domain) => entities.find((e) => e.startsWith(`${domain}.`));
    return {
      title: t(hass, 'Settings'),
      rows: [pick('light'), pick('switch'), pick('scene')].filter(Boolean).map((entity) => ({ entity })),
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rows) || !config.rows.length) {
      throw new Error('m3-list-card: "rows" must contain at least one row');
    }
    for (const row of config.rows) {
      if (!row.entity && !row.name) throw new Error('m3-list-card: every row needs an "entity" or a "name"');
      if (row.trailing && !TRAILING.includes(row.trailing)) {
        throw new Error(`m3-list-card: "trailing" must be one of ${TRAILING.join(', ')}`);
      }
    }
    this._config = { dynamic: true, radius: 'large', ...config };
    this._build();
    if (this._hass) this._render();
  }

  getCardSize() { return this._config.rows.length + (this._config.title ? 1 : 0); }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    const watched = this._config.rows.map((row) => row.entity && hass.states[row.entity]);
    if (this._watched && watched.every((s, i) => s === this._watched[i])) return;
    this._watched = watched;
    this._render();
  }

  // La structure dépend du nombre de lignes : reconstruite à chaque setConfig.
  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const c = this._config;
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card><div class="title"></div><div class="rows"></div></ha-card>`;
    root.querySelector('.title').textContent = c.title ?? '';
    this.toggleAttribute('titled', !!c.title);
    this.style.setProperty('--m3-radius', `${RADIUS[c.radius] ?? (Number(c.radius) || RADIUS.large)}px`);
    const list = root.querySelector('.rows');
    this._rows = c.rows.map((row) => {
      const el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = `<div class="icon"><ha-state-icon></ha-state-icon></div>
        <div class="text"><div class="name"></div><div class="label"></div></div>
        <div class="trailing"></div>`;
      list.appendChild(el);
      const r = {
        row, el,
        icon: el.querySelector('ha-state-icon'),
        name: el.querySelector('.name'),
        label: el.querySelector('.label'),
        trailing: el.querySelector('.trailing'),
      };
      this._bindPress(r);
      return r;
    });
    this._watched = null;
  }

  _render() {
    if (!this._rows || !this._hass) return;
    for (const r of this._rows) this._renderRow(r);
  }

  _renderRow(r) {
    const { row } = r;
    const s = row.entity ? this._hass.states[row.entity] : undefined;
    const offline = !!row.entity && (!s || ['unavailable', 'unknown'].includes(s.state));
    const active = !offline && isActive(s);
    const trailing = this._trailing(row, s);

    r.el.toggleAttribute('offline', offline);
    r.name.textContent = row.name ?? s?.attributes.friendly_name ?? row.entity;
    Object.assign(r.icon, { hass: this._hass, stateObj: s, icon: row.icon });
    // Sous-titre : celui de la config, sinon l'état (sauf s'il est déjà affiché à droite).
    const custom = (active ? row.label_on : offline ? null : row.label_off) ?? row.label;
    r.label.textContent = custom ?? (trailing === 'state' ? '' : this._stateText(s, offline) ?? '');

    if (r.kind !== trailing) {
      r.kind = trailing;
      r.trailing.innerHTML = {
        switch: '<div class="switch" role="switch"></div>',
        state: '<span class="state"></span>',
        chevron: '<ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>',
        none: '',
      }[trailing];
      r.switch = r.trailing.querySelector('.switch');
      if (r.switch) {
        // L'interrupteur bascule l'entité sans déclencher l'action de la ligne.
        r.switch.addEventListener('pointerdown', (e) => e.stopPropagation());
        r.switch.addEventListener('pointerup', (e) => e.stopPropagation());
        r.switch.addEventListener('click', (e) => {
          e.stopPropagation();
          if (r.el.hasAttribute('offline')) return;
          this._fire('haptic', 'light');
          r.switch.toggleAttribute('on');
          this._hass.callService('homeassistant', 'toggle', { entity_id: row.entity });
        });
      }
    }
    if (r.switch) {
      r.switch.toggleAttribute('on', active);
      r.switch.setAttribute('aria-checked', String(active));
    }
    const stateEl = r.trailing.querySelector('.state');
    if (stateEl) stateEl.textContent = this._stateText(s, offline) ?? '';

    const tinted = active && this._config.dynamic !== false;
    const st = r.el.style;
    // Valeur sous le seuil d'alerte (batterie faible...) : couleurs d'erreur.
    const value = parseFloat(s?.state);
    if (row.alert_below != null && !isNaN(value) && value < Number(row.alert_below)) {
      st.setProperty('--m3-bg', 'var(--md-sys-color-error-container, rgba(var(--rgb-error-color, 219, 68, 55), 0.2))');
      st.setProperty('--m3-fg', 'var(--md-sys-color-on-error-container, var(--primary-text-color))');
      st.setProperty('--m3-icon-fg', 'var(--md-sys-color-error, var(--error-color))');
      return;
    }
    st.setProperty('--m3-bg', tinted ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', tinted ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-icon-fg', tinted ? 'var(--md-sys-color-primary, var(--primary-color))' : ON_SURFACE);
  }

  // « auto » : interrupteur pour ce qui s'allume (sauf action configurée), flèche pour une navigation.
  _trailing(row, s) {
    if (row.trailing && row.trailing !== 'auto') return row.trailing;
    const action = row.tap_action?.action;
    if (action === 'navigate' || action === 'url') return 'chevron';
    const domain = row.entity?.split('.')[0];
    if (s && TOGGLE_DOMAINS.has(domain) && domain !== 'cover' && (!action || action === 'toggle')) return 'switch';
    return 'none';
  }

  _stateText(s, offline) {
    if (!s) return null;
    if (offline) return t(this._hass, 'Offline');
    const [domain] = s.entity_id.split('.');
    // L'état d'une scène ou d'un bouton est la date du dernier déclenchement : rien à afficher.
    if (['scene', 'button', 'input_button'].includes(domain)) return null;
    if (domain === 'script') return s.state === 'on' ? t(this._hass, 'Running') : null;
    const state = this._hass.formatEntityState?.(s) ?? s.state;
    if (domain === 'light' && s.state === 'on' && s.attributes.brightness != null) {
      return `${state} • ${Math.round((s.attributes.brightness / 255) * 100)} %`;
    }
    return state;
  }

  _bindPress(r) {
    let timer;
    let down = false;
    let held = false;
    r.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      down = true;
      held = false;
      timer = setTimeout(() => {
        held = true;
        this._run(r, 'hold');
      }, HOLD_MS);
    });
    r.el.addEventListener('pointerup', () => {
      clearTimeout(timer);
      if (down && !held) this._run(r, 'tap');
      down = false;
    });
    const cancel = () => {
      clearTimeout(timer);
      down = false;
    };
    r.el.addEventListener('pointerleave', cancel);
    r.el.addEventListener('pointercancel', cancel);
    r.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Action configurée → gestion native de HA ; sinon action par défaut du domaine (appui) ou détails.
  _run(r, kind) {
    const { row } = r;
    const configured = row[`${kind}_action`];
    this._fire('haptic', kind === 'hold' ? 'medium' : 'light');
    if (configured) {
      this._fire('hass-action', { config: { entity: row.entity, [`${kind}_action`]: configured }, action: kind });
      return;
    }
    if (!row.entity) return;
    const s = this._hass.states[row.entity];
    const service = kind === 'tap' && s && !r.el.hasAttribute('offline') ? defaultTapService(s) : null;
    if (service) {
      this._hass.callService(service[0], service[1], { entity_id: row.entity });
    } else {
      this._fire('hass-more-info', { entityId: row.entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-list-card-editor', M3ListCardEditor);

if (!customElements.get('m3-list-card')) {
  customElements.define('m3-list-card', M3ListCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-list-card',
    name: 'M3 List',
    description: t(null, 'Material 3 Expressive list: stacked rows with a switch, state or chevron on the right'),
    preview: true,
  });
}
