// m3-progress-card — suivi d'une tâche en cours (impression 3D, lave-linge...) : état, pourcentage,
// barre de progression Material 3, temps restant et heure de fin, mis à jour chaque minute.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  height: 100%; box-sizing: border-box; padding: 18px 20px; border-radius: 28px; border: none; box-shadow: none; cursor: pointer;
  background: color-mix(in srgb, var(--m3-accent) 14%, var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color))));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  display: flex; flex-direction: column; gap: 14px;
}
.top { display: flex; align-items: center; gap: 14px; }
.icon {
  flex: none; width: 48px; height: 48px; border-radius: 16px; overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--m3-accent) 22%, transparent); color: var(--m3-accent); --mdc-icon-size: 26px;
}
.icon img { width: 100%; height: 100%; object-fit: cover; }
.icon img[hidden], .icon ha-icon[hidden] { display: none; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pct { flex: none; font-size: 1.9rem; font-weight: 400; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.bar { position: relative; height: 12px; border-radius: 6px; background: color-mix(in srgb, var(--m3-accent) 18%, transparent); overflow: hidden; }
.fill { position: absolute; inset: 0 auto 0 0; width: var(--m3-progress, 0%); border-radius: 6px; background: var(--m3-accent); transition: width 600ms ease; }
.times { display: flex; justify-content: space-between; gap: 12px; ${STATE_FONT} }
:host([no-progress]) .bar, :host([no-progress]) .pct { display: none; }
:host([no-times]) .times { display: none; }
`;

const REFRESH_MS = 30 * 1000;

const formatDuration = (minutes) => {
  if (!isFinite(minutes) || minutes < 0) return null;
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

class M3ProgressCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: {} } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        { name: 'progress', selector: { entity: { domain: ['sensor', 'number'] } } },
        { name: 'end_time', selector: { entity: { domain: 'sensor', device_class: 'timestamp' } } },
        { name: 'remaining', selector: { entity: { domain: 'sensor' } } },
        { name: 'image', selector: { entity: { domain: ['image', 'camera'] } } },
        { name: 'color', selector: { ui_color: {} } },
      ],
    },
  ];

  static labels = {
    entity: 'État de la tâche', name: 'Nom', icon: 'Icône', progress: 'Progression (%)', end_time: 'Heure de fin',
    remaining: 'Temps restant', image: 'Image', color: 'Couleur',
  };

  static helpers = {
    end_time: 'Capteur horodatage : le temps restant en est déduit',
    remaining: 'Sinon : capteur de durée (min, h ou s)',
  };
}

class M3ProgressCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-progress-card-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    return { entity: entities.find((e) => /print|lave|wash|dish/.test(e)) ?? entities[0] };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-progress-card : « entity » est obligatoire');
    this._config = config;
    if (!this.shadowRoot) this._build();
    this._key = null;
    if (this._hass) this._render();
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() { this._timer = setInterval(() => { this._key = null; this._render(); }, REFRESH_MS); }

  disconnectedCallback() { clearInterval(this._timer); }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="top">
          <div class="icon"><img alt="" hidden><ha-state-icon></ha-state-icon></div>
          <div class="text"><div class="name"></div><div class="state"></div></div>
          <div class="pct"></div>
        </div>
        <div class="bar"><div class="fill"></div></div>
        <div class="times"><span class="left"></span><span class="end"></span></div>
      </ha-card>`;
    const q = (s) => root.querySelector(s);
    this._card = q('ha-card');
    this._els = {
      img: q('.icon img'), icon: q('ha-state-icon'), name: q('.name'), state: q('.state'), pct: q('.pct'),
      left: q('.left'), end: q('.end'),
    };
    this._els.img.addEventListener('error', () => { this._els.img.hidden = true; this._els.icon.hidden = false; });
    this._card.addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
  }

  _state(id) { return id ? this._hass.states[id] : undefined; }

  // Minutes restantes : depuis l'heure de fin, sinon depuis un capteur de durée.
  _remaining() {
    const end = this._state(this._config.end_time);
    const endMs = Date.parse(end?.state);
    if (!isNaN(endMs)) return { minutes: (endMs - Date.now()) / 60000, end: new Date(endMs) };
    const rem = this._state(this._config.remaining);
    const v = parseFloat(rem?.state);
    if (isNaN(v)) return null;
    const unit = rem.attributes.unit_of_measurement ?? 'min';
    const minutes = unit === 'h' ? v * 60 : unit === 's' ? v / 60 : unit === 'd' ? v * 1440 : v;
    return { minutes, end: new Date(Date.now() + minutes * 60000) };
  }

  _render() {
    if (!this._els || !this._hass) return;
    const c = this._config;
    const s = this._state(c.entity);
    const progress = parseFloat(this._state(c.progress)?.state);
    const remaining = this._remaining();
    const image = this._state(c.image);
    const key = [s, this._state(c.progress), this._state(c.end_time), this._state(c.remaining), image].map((x) => x?.last_updated).join();
    if (key === this._key) return;
    this._key = key;

    const e = this._els;
    e.name.textContent = c.name ?? s?.attributes.friendly_name ?? c.entity;
    e.state.textContent = !s ? 'Introuvable' : (this._hass.formatEntityState?.(s) ?? s.state);
    Object.assign(e.icon, { hass: this._hass, stateObj: s, icon: c.icon });

    const picture = image?.attributes.entity_picture;
    const url = picture && !['unavailable', 'unknown'].includes(image.state) ? (this._hass.hassUrl?.(picture) ?? picture) : null;
    e.img.hidden = !url;
    e.icon.hidden = !!url;
    if (url && e.img.getAttribute('src') !== url) e.img.src = url;

    const hasProgress = !isNaN(progress);
    this.toggleAttribute('no-progress', !hasProgress);
    if (hasProgress) {
      const pct = Math.max(0, Math.min(100, progress));
      e.pct.textContent = `${Math.round(pct)} %`;
      this._card.style.setProperty('--m3-progress', `${pct}%`);
    }

    const left = remaining && remaining.minutes > 0 ? formatDuration(remaining.minutes) : null;
    this.toggleAttribute('no-times', !left);
    if (left) {
      e.left.textContent = `Reste ${left}`;
      const lang = this._hass.locale?.language ?? 'fr';
      const sameDay = remaining.end.toDateString() === new Date().toDateString();
      const time = remaining.end.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
      e.end.textContent = sameDay ? `Fin à ${time}` : `Fin ${remaining.end.toLocaleDateString(lang, { weekday: 'short' })} à ${time}`;
    }

    this._card.style.setProperty('--m3-accent', c.color ? cssColor(c.color) : 'var(--md-sys-color-primary, var(--primary-color))');
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-progress-card-editor', M3ProgressCardEditor);

if (!customElements.get('m3-progress-card')) {
  customElements.define('m3-progress-card', M3ProgressCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-progress-card',
    name: 'M3 Progress',
    description: 'Tâche en cours (impression 3D, lave-linge...) : pourcentage, barre de progression, temps restant et heure de fin',
    preview: true,
  });
}
