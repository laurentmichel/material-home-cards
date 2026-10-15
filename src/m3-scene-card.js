// m3-scene-card — sélecteur de scènes Material 3 : groupe de boutons, tuiles ou carrousel.
// La scène active (la dernière lancée) est mise en avant ; un bouton « Éteindre » est possible.
const GROUP_MIN_ITEM = 32;
const GROUP_PADDING = 12;
const GROUP_GAP = 4;
const STYLE = `
:host { display: block; }
ha-card { background: none; border: none; box-shadow: none; }
.items { display: flex; }
.item {
  position: relative; display: flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 0;
  background: var(--m3-bg); color: var(--m3-fg); --mdc-icon-size: 24px;
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: flex-grow 350ms cubic-bezier(0.2, 0, 0, 1), flex-basis 350ms cubic-bezier(0.2, 0, 0, 1), border-radius 350ms cubic-bezier(0.2, 0, 0, 1),
    background 300ms ease, color 300ms ease, transform 120ms ease, box-shadow 300ms ease;
}
.item:active { transform: scale(0.95); }
.item ha-state-icon { flex: none; }
.name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.check { display: none; }

/* Groupe de boutons connectés (M3 Expressive) : la scène active s'élargit à la largeur de son nom
   (calculée dans _fitGroup) ; seules les extrémités du groupe sont arrondies. */
:host([variant='group']) .items { gap: ${GROUP_GAP}px; }
:host([variant='group']) .item { flex: 1 1 0; min-width: ${GROUP_MIN_ITEM}px; height: 64px; border-radius: 10px; gap: 8px; padding: 0; }
:host([variant='group']) .item:first-child { border-radius: 32px 10px 10px 32px; }
:host([variant='group']) .item:last-child { border-radius: 10px 32px 32px 10px; }
:host([variant='group']) .item[active] { flex: 0 0 var(--m3-active-width, auto); padding: 0 ${GROUP_PADDING}px; }
:host([variant='group']) .name { display: none; font-size: 14px; font-weight: 550; }
:host([variant='group']) .item[active] .name { display: block; }

/* Tuiles : carrés avec le nom dessous ; la scène active a sa couleur pleine et un contour. */
:host([variant='tiles']) .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
:host([variant='tiles']) .item {
  aspect-ratio: 1; flex-direction: column; gap: 6px; border-radius: 20px; padding: 6px; --mdc-icon-size: 26px;
}
:host([variant='tiles']) .item[active] { box-shadow: 0 0 0 3px var(--md-sys-color-on-surface, var(--primary-text-color)); border-radius: 26px; }
:host([variant='tiles']) .name { font-size: 12px; font-weight: 500; max-width: 100%; }

/* Carrousel : grandes cartes en dégradé qui défilent horizontalement. */
:host([variant='carousel']) .items {
  gap: 8px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding-bottom: 2px;
}
:host([variant='carousel']) .items::-webkit-scrollbar { display: none; }
:host([variant='carousel']) .item {
  flex: none; width: 132px; height: 112px; border-radius: 28px; scroll-snap-align: start;
  flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 16px;
  background: var(--m3-gradient); --mdc-icon-size: 26px;
}
:host([variant='carousel']) .name { ${TITLE_FONT} max-width: 100%; }
:host([variant='carousel']) .check { position: absolute; top: 14px; right: 14px; --mdc-icon-size: 22px; }
:host([variant='carousel']) .item[active] .check { display: flex; }
`;

const VARIANTS = ['group', 'tiles', 'carousel'];
const ON_COLOR = '#1c1b1f';
const PENDING_TTL = 5000;
const DEFAULT_COLORS = ['amber', 'purple', 'red', 'blue', 'pink', 'teal', 'green', 'deep-orange'];

class M3SceneCardEditor extends M3CardEditor {
  static schema = [
    {
      name: 'variant', selector: {
        select: {
          mode: 'box', options: [
            { value: 'group', label: 'Button group' },
            { value: 'tiles', label: 'Tiles' },
            { value: 'carousel', label: 'Carousel' },
          ],
        },
      },
    },
    {
      name: 'scenes', selector: {
        object: {
          multiple: true, label_field: 'name', description_field: 'entity',
          fields: {
            entity: { label: 'Scene', required: true, selector: { entity: { domain: ['scene', 'script'] } } },
            name: { label: 'Name', selector: { text: {} } },
            icon: { label: 'Icon', selector: { icon: {} } },
            color: { label: 'Color', selector: { ui_color: {} } },
          },
        },
      },
    },
    { name: 'off', selector: { entity: { domain: ['light', 'switch', 'group'] } } },
  ];

  static labels = { variant: 'Style', scenes: 'Scenes', off: '"Turn off" button' };

  static helpers = {
    off: 'Optional: adds a button that turns this entity off; when it is off, no scene is active',
  };
}

class M3SceneCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-scene-card-editor');
  }

  static getStubConfig(hass) {
    const scenes = Object.keys(hass.states).filter((e) => e.startsWith('scene.')).slice(0, 4);
    return { variant: 'group', scenes: scenes.map((entity) => ({ entity })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.scenes) || !config.scenes.length) {
      throw new Error('m3-scene-card: "scenes" must contain at least one scene');
    }
    if (config.variant && !VARIANTS.includes(config.variant)) {
      throw new Error(`m3-scene-card: "variant" must be one of ${VARIANTS.join(', ')}`);
    }
    if (config.scenes.some((s) => !s.entity)) throw new Error('m3-scene-card: every scene needs an "entity"');
    this._config = { variant: 'group', ...config };
    // `off` accepte une entité ou un objet { entity, name, icon, color }.
    this._off = typeof config.off === 'string' ? { entity: config.off } : config.off ?? null;
    this.setAttribute('variant', this._config.variant);
    this._build();
    if (this._hass) this._render();
  }

  getCardSize() { return this._config.variant === 'carousel' ? 3 : 2; }

  connectedCallback() {
    this._resizer ??= new ResizeObserver(() => this._fitGroup());
    this._resizer.observe(this);
    // Une police chargée après coup change la largeur du nom : on recalcule.
    this._onFonts ??= () => this._fitGroup();
    document.fonts?.addEventListener('loadingdone', this._onFonts);
    document.fonts?.ready.then(this._onFonts);
  }

  disconnectedCallback() {
    this._resizer?.disconnect();
    document.fonts?.removeEventListener('loadingdone', this._onFonts);
  }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    const ids = [...this._config.scenes.map((s) => s.entity), this._off?.entity];
    const watched = ids.map((e) => e && hass.states[e]);
    if (this._watched && watched.every((s, i) => s === this._watched[i])) return;
    this._watched = watched;
    this._render();
  }

  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><ha-card><div class="items"></div></ha-card>`;
    const list = root.querySelector('.items');
    const items = this._config.scenes.map((scene, i) => ({ ...scene, color: scene.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }));
    if (this._off) items.push({ icon: 'mdi:power', name: t(this._hass, 'Turn off'), color: 'disabled', ...this._off, isOff: true });
    this._items = items.map((item) => {
      const el = document.createElement('div');
      el.className = 'item';
      el.setAttribute('role', 'button');
      el.innerHTML = `<ha-state-icon></ha-state-icon><span class="name"></span>
        <ha-icon class="check" icon="mdi:check-circle"></ha-icon>`;
      el.addEventListener('click', () => this._activate(item));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._fire('hass-more-info', { entityId: item.entity });
      });
      list.appendChild(el);
      return { item, el, icon: el.querySelector('ha-state-icon'), name: el.querySelector('.name') };
    });
    this._watched = null;
  }

  // Scène active : la dernière lancée (l'état d'une scène est sa date d'activation), sauf si tout est éteint.
  _activeEntity() {
    const states = this._hass.states;
    if (this._pending && Date.now() < this._pending.until) return this._pending.entity;
    if (this._off) {
      const off = states[this._off.entity];
      if (!off || off.state === 'off') return this._off.entity;
    }
    let best = null;
    let bestTime = -Infinity;
    for (const { entity } of this._config.scenes) {
      const s = states[entity];
      const time = Date.parse(entity.startsWith('script.') ? s?.attributes.last_triggered : s?.state);
      if (time > bestTime) {
        bestTime = time;
        best = entity;
      }
    }
    return best;
  }

  _render() {
    if (!this._items || !this._hass) return;
    // L'attente se termine dès que HA confirme la scène lancée.
    if (this._pending && this._watched && this._pending.until > Date.now()) {
      const s = this._hass.states[this._pending.entity];
      const confirmed = this._pending.isOff ? s?.state === 'off' : s && s.state !== this._pending.previous;
      if (confirmed) this._pending = null;
    }
    const active = this._activeEntity();
    for (const { item, el, icon, name } of this._items) {
      const s = this._hass.states[item.entity];
      const isActive = item.entity === active;
      el.toggleAttribute('active', isActive);
      el.setAttribute('aria-pressed', String(isActive));
      el.title = item.name ?? s?.attributes.friendly_name ?? item.entity;
      name.textContent = el.title;
      Object.assign(icon, { hass: this._hass, stateObj: s, icon: item.icon });

      const color = cssColor(item.color);
      const pastel = `color-mix(in srgb, ${color} 62%, white)`;
      const st = el.style;
      if (this._config.variant === 'tiles' && !isActive) {
        // Tuiles inactives : ton atténué, l'icône garde la couleur de la scène.
        st.setProperty('--m3-bg', `color-mix(in srgb, ${color} 22%, var(--md-sys-color-surface-container-high, var(--card-background-color)))`);
        st.setProperty('--m3-fg', 'var(--md-sys-color-on-surface, var(--primary-text-color))');
      } else {
        st.setProperty('--m3-bg', pastel);
        st.setProperty('--m3-fg', ON_COLOR);
      }
      st.setProperty('--m3-gradient', `linear-gradient(135deg, ${pastel}, color-mix(in srgb, ${color} 85%, black))`);
    }
    this._fitGroup();
  }

  // Groupe : la scène active prend la largeur de son nom, dans la limite de ce que laissent les autres boutons.
  _fitGroup() {
    if (this._config?.variant !== 'group' || !this._items) return;
    const width = this.shadowRoot.querySelector('.items').clientWidth;
    const current = this._items.find(({ el }) => el.hasAttribute('active'));
    if (!width || !current) return;
    const others = this._items.length - 1;
    const iconWidth = Math.max(current.icon.getBoundingClientRect().width, 24);
    // +2 px : scrollWidth est arrondi, un nom au pixel près serait coupé.
    const needed = Math.ceil(current.name.scrollWidth + iconWidth + 8 + 2 * GROUP_PADDING) + 2;
    const available = width - others * (GROUP_MIN_ITEM + GROUP_GAP);
    this.style.setProperty('--m3-active-width', `${Math.max(GROUP_MIN_ITEM, Math.min(needed, available))}px`);
  }

  _activate(item) {
    this._fire('haptic', 'light');
    const s = this._hass.states[item.entity];
    this._pending = { entity: item.entity, isOff: !!item.isOff, previous: s?.state, until: Date.now() + PENDING_TTL };
    if (item.tap_action) {
      this._fire('hass-action', { config: { entity: item.entity, tap_action: item.tap_action }, action: 'tap' });
    } else if (item.isOff) {
      this._hass.callService('homeassistant', 'turn_off', { entity_id: item.entity });
    } else {
      const [domain] = item.entity.split('.');
      this._hass.callService(domain === 'script' ? 'script' : 'scene', 'turn_on', { entity_id: item.entity });
    }
    this._render();
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-scene-card-editor', M3SceneCardEditor);

if (!customElements.get('m3-scene-card')) {
  customElements.define('m3-scene-card', M3SceneCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-scene-card',
    name: 'M3 Scenes',
    description: t(null, 'Material 3 scene selector: button group, tiles or carousel, with the active scene highlighted'),
    preview: true,
  });
}
