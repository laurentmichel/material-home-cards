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
