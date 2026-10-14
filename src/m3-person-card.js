// m3-person-card — accueil Material 3 : avatar et « Bonjour Laurent ! » pour l'utilisateur connecté,
// avatars des autres personnes à droite (en gris quand elles sont absentes).
const STYLE = `
:host { display: block; }
ha-card {
  display: flex; align-items: center; gap: 14px; box-sizing: border-box; padding: 4px 4px;
  background: none; border: none; box-shadow: none; color: var(--md-sys-color-on-surface, var(--primary-text-color));
}
:host([background]) ha-card {
  padding: 14px 16px; border-radius: 28px;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
}
.avatar {
  position: relative; flex: none; width: 44px; height: 44px; border-radius: 14px; overflow: visible;
  display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent;
  background: var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.2));
  color: var(--md-sys-color-on-primary-container, var(--primary-text-color));
  font-size: 16px; font-weight: 600; transition: filter 300ms ease, opacity 300ms ease, transform 120ms ease;
}
.avatar:active { transform: scale(0.94); }
.avatar img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.avatar[away] { filter: grayscale(100%); opacity: 0.55; }
/* Pastille d'état : verte à la maison, absente sinon. */
.avatar::after {
  content: ''; position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--md-sys-color-tertiary, #4caf50); border: 2px solid var(--md-sys-color-surface, var(--primary-background-color));
}
.avatar[away]::after { display: none; }
:host(:not([show-dot])) .avatar::after { display: none; }
.text { flex: 1; min-width: 0; }
.greeting { font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
:host(:not([show-state])) .state { display: none; }
.others { flex: none; display: flex; gap: 8px; }
.others .avatar { width: 40px; height: 40px; border-radius: 12px; font-size: 14px; }
`;

// Bonjour le jour, bonsoir à partir de 18 h.
const greetingWord = (date = new Date()) => (date.getHours() >= 18 || date.getHours() < 4 ? 'Bonsoir' : 'Bonjour');

class M3PersonCardEditor extends M3CardEditor {
  static schema = [
    { name: 'persons', selector: { entity: { domain: 'person', multiple: true } } },
    { name: 'greeting', selector: { text: {} } },
    {
      type: 'grid', name: '', schema: [
        { name: 'show_state', selector: { boolean: {} } },
        { name: 'show_dot', selector: { boolean: {} } },
        { name: 'background', selector: { boolean: {} } },
      ],
    },
  ];

  static labels = {
    persons: 'Autres personnes', greeting: 'Message', show_state: 'Afficher l’état',
    show_dot: 'Pastille « à la maison »', background: 'Fond de carte',
  };

  static helpers = {
    persons: 'Vide : toutes les personnes sauf vous',
    greeting: 'Vide : « Bonjour » ou « Bonsoir » suivi du prénom',
  };
}

class M3PersonCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-person-card-editor');
  }

  static getStubConfig() { return {}; }

  setConfig(config) {
    this._config = { show_state: true, show_dot: true, background: false, ...config };
    this.toggleAttribute('show-state', this._config.show_state !== false);
    this.toggleAttribute('show-dot', this._config.show_dot !== false);
    this.toggleAttribute('background', !!this._config.background);
    if (!this.shadowRoot) this._build();
    this._key = null;
    if (this._hass) this._render();
  }

  getCardSize() { return 1; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() {
    // Le message passe de « Bonjour » à « Bonsoir » sans rechargement.
    this._clock = setInterval(() => this._render(), 60 * 1000);
  }

  disconnectedCallback() { clearInterval(this._clock); }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="avatar me"></div>
        <div class="text"><div class="greeting"></div><div class="state"></div></div>
        <div class="others"></div>
      </ha-card>`;
    this._els = {
      me: root.querySelector('.me'),
      greeting: root.querySelector('.greeting'),
      state: root.querySelector('.state'),
      others: root.querySelector('.others'),
    };
    this._els.me.addEventListener('click', () => this._me && this._fire('hass-more-info', { entityId: this._me }));
  }

  // La personne de l'utilisateur connecté : celle dont le user_id correspond.
  _currentPerson() {
    const userId = this._hass.user?.id;
    return Object.keys(this._hass.states).find((e) => e.startsWith('person.') && this._hass.states[e].attributes.user_id === userId);
  }

  _render() {
    if (!this._els || !this._hass) return;
    const c = this._config;
    const states = this._hass.states;
    this._me = this._currentPerson();
    const others = (c.persons?.length ? c.persons : Object.keys(states).filter((e) => e.startsWith('person.')))
      .filter((e) => e !== this._me && states[e]);

    // Ne redessine que si une personne ou l'heure du message a changé.
    const key = [this._me, ...others].map((e) => e && states[e]?.last_updated).join() + greetingWord() + (this._hass.user?.name ?? '');
    if (key === this._key) return;
    this._key = key;

    const me = this._me && states[this._me];
    const firstName = (this._hass.user?.name ?? me?.attributes.friendly_name ?? '').split(' ')[0];
    this._els.greeting.textContent = c.greeting ?? `${greetingWord()} ${firstName} !`;
    this._els.state.textContent = me ? this._stateText(me) : '';
    this._fillAvatar(this._els.me, me, firstName);

    const list = this._els.others;
    while (list.children.length > others.length) list.lastChild.remove();
    others.forEach((entityId, i) => {
      let el = list.children[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'avatar';
        el.addEventListener('click', () => this._fire('hass-more-info', { entityId: el.dataset.entity }));
        list.appendChild(el);
      }
      el.dataset.entity = entityId;
      const s = states[entityId];
      el.title = `${s.attributes.friendly_name ?? entityId} • ${this._stateText(s)}`;
      this._fillAvatar(el, s, s.attributes.friendly_name ?? entityId);
    });
  }

  _stateText(s) {
    if (s.state === 'home') return 'À la maison';
    if (s.state === 'not_home') return 'Hors de la maison';
    return this._hass.formatEntityState?.(s) ?? s.state;
  }

  // Photo de la personne, sinon son initiale.
  _fillAvatar(el, s, name) {
    el.toggleAttribute('away', !!s && s.state !== 'home');
    const picture = s?.attributes.entity_picture;
    const url = picture ? (this._hass.hassUrl?.(picture) ?? picture) : null;
    if (url) {
      let img = el.querySelector('img');
      if (!img) {
        el.textContent = '';
        img = document.createElement('img');
        img.alt = '';
        el.appendChild(img);
      }
      if (img.getAttribute('src') !== url) img.src = url;
    } else {
      el.textContent = (name || '?').trim().charAt(0).toUpperCase();
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-person-card-editor', M3PersonCardEditor);

if (!customElements.get('m3-person-card')) {
  customElements.define('m3-person-card', M3PersonCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-person-card',
    name: 'M3 Person',
    description: 'Accueil Material 3 : « Bonjour » avec votre avatar, et les autres personnes de la maison',
    preview: true,
  });
}
