// m3-graph-card — carte capteur Material 3 : valeur actuelle avec une courbe d'historique lissée
// dessinée en fond, couleurs d'alerte sous un seuil (batterie faible...).
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
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
  height: 100%; padding: 0 20px; box-sizing: border-box;
}
.icon { flex: none; display: flex; color: var(--m3-icon-fg, inherit); }
.icon ha-state-icon { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { font-size: 15px; font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.value { font-size: 13px; font-weight: 500; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
