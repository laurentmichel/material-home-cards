// m3-multi-graph-card — plusieurs capteurs sur un même graphique Material 3 (ex. température dedans / dehors) :
// valeurs en haut, courbes lissées avec dégradé en bas, sur une échelle commune.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 170px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
}
svg {
  position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: var(--m3-graph-height, 55%);
  pointer-events: none;
}
.line { fill: none; stroke-width: 1.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.values { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 0; }
.entity { min-width: 0; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.entity:last-child:not(:first-child) { text-align: right; }
.entity:last-child:not(:first-child) .head { justify-content: flex-end; }
.head { display: flex; align-items: center; gap: 6px; ${STATE_FONT} }
.head ha-state-icon { --mdc-icon-size: 18px; color: var(--m3-color); }
.head span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.value { font-size: 2rem; font-weight: 400; line-height: 1.25; letter-spacing: -0.5px; white-space: nowrap; }
.unit { font-size: 14px; font-weight: 500; opacity: 0.7; margin-left: 2px; letter-spacing: 0; }
.extrema { ${STATE_FONT} white-space: nowrap; }
:host(:not([variant='extrema'])) .extrema { display: none; }
.delta {
  align-self: center; flex: none; display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 16px;
  background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.2));
  font-size: 13px; font-weight: 550; --mdc-icon-size: 16px;
}
:host(:not([variant='delta'])) .delta { display: none; }
`;

const VARIANTS = ['simple', 'delta', 'extrema'];
const DEFAULT_COLORS = ['var(--md-sys-color-primary, #8ec9ff)', 'var(--md-sys-color-tertiary, #fea6ff)', 'var(--md-sys-color-secondary, #9ccc65)'];
const GRAPH_REFRESH_MS = 5 * 60 * 1000;

class M3MultiGraphCardEditor extends M3CardEditor {
  static schema = [
    {
      name: 'entities', selector: {
        object: {
          multiple: true, label_field: 'name', description_field: 'entity',
          fields: {
            entity: { label: 'Sensor', required: true, selector: { entity: { domain: ['sensor', 'input_number', 'number'] } } },
            name: { label: 'Name', selector: { text: {} } },
            icon: { label: 'Icon', selector: { icon: {} } },
            color: { label: 'Color (CSS or HA color)', selector: { text: {} } },
          },
        },
      },
    },
    {
      name: 'variant', selector: {
        select: {
          mode: 'box', options: [
            { value: 'simple', label: 'Simple' },
            { value: 'delta', label: 'With the difference' },
            { value: 'extrema', label: 'With min / max' },
          ],
        },
      },
    },
    {
      type: 'grid', name: '', schema: [
        { name: 'hours_to_show', selector: { number: { min: 1, max: 720, step: 1, mode: 'box', unit_of_measurement: 'h' } } },
        { name: 'graph_height', selector: { number: { min: 20, max: 100, step: 5, mode: 'slider', unit_of_measurement: '%' } } },
      ],
    },
  ];

  static labels = { entities: 'Sensors', variant: 'Style', hours_to_show: 'Period', graph_height: 'Curves height' };

  static helpers = { variant: 'The difference compares the first two sensors' };
}

class M3MultiGraphCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-multi-graph-card-editor');
  }

  static getStubConfig(hass) {
    const temps = Object.keys(hass.states)
      .filter((e) => e.startsWith('sensor.') && hass.states[e].attributes.device_class === 'temperature').slice(0, 2);
    return { entities: temps.map((entity) => ({ entity })), hours_to_show: 24 };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || !config.entities.length) {
      throw new Error('m3-multi-graph-card: "entities" must contain at least one sensor');
    }
    if (config.variant && !VARIANTS.includes(config.variant)) {
      throw new Error(`m3-multi-graph-card: "variant" must be one of ${VARIANTS.join(', ')}`);
    }
    // Les capteurs s'écrivent en liste d'objets ou simplement d'identifiants.
    const entities = config.entities.map((e) => (typeof e === 'string' ? { entity: e } : e));
    if (entities.some((e) => !e.entity)) throw new Error('m3-multi-graph-card: every sensor needs an "entity"');
    const previous = this._config;
    this._config = { variant: 'simple', hours_to_show: 24, graph_height: 55, ...config, entities };
    this.setAttribute('variant', this._config.variant);
    const key = (c) => `${c.entities.map((e) => e.entity).join()}|${c.hours_to_show}`;
    if (!previous || key(previous) !== key(this._config)) this._samples = null;
    this._build();
    if (this._hass) { this._load(); this._render(); }
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() {
    this._timer = setInterval(() => { this._samples = null; this._load(); }, GRAPH_REFRESH_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  set hass(hass) {
    this._hass = hass;
    const states = this._config.entities.map((e) => hass.states[e.entity]);
    if (this._states && states.every((s, i) => s === this._states[i])) return;
    // Mise à jour en direct : chaque nouvelle mesure s'ajoute à sa courbe sans recharger l'historique.
    if (this._states && this._samples) {
      states.forEach((s, i) => {
        const v = parseFloat(s?.state);
        if (s !== this._states[i] && !isNaN(v)) this._samples[i].push({ t: Date.now(), v });
      });
    }
    this._states = states;
    this._load();
    this._render();
  }

  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const { entities } = this._config;
    const uid = Math.random().toString(36).slice(2, 8);
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>${entities.map((_, i) => `<linearGradient id="g${uid}${i}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-opacity="0.35"></stop><stop offset="1" stop-opacity="0"></stop></linearGradient>`).join('')}</defs>
          ${entities.map((_, i) => `<path class="area" fill="url(#g${uid}${i})"></path>`).join('')}
          ${entities.map(() => '<path class="line"></path>').join('')}
        </svg>
        <div class="values"></div>
      </ha-card>`;
    const values = root.querySelector('.values');
    const areas = root.querySelectorAll('.area');
    const lines = root.querySelectorAll('.line');
    const stops = root.querySelectorAll('stop');
    this._series = entities.map((cfg, i) => {
      const el = document.createElement('div');
      el.className = 'entity';
      el.innerHTML = `<div class="head"><ha-state-icon></ha-state-icon><span></span></div>
        <div class="value"></div><div class="extrema"></div>`;
      el.addEventListener('click', () => this._fire('hass-more-info', { entityId: cfg.entity }));
      values.appendChild(el);
      // L'écart s'affiche entre les deux premiers capteurs.
      if (i === 0 && entities.length > 1) {
        this._delta = document.createElement('div');
        this._delta.className = 'delta';
        this._delta.innerHTML = '<ha-icon icon="mdi:swap-horizontal"></ha-icon><span></span>';
        values.appendChild(this._delta);
      }
      const color = cssColor(cfg.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
      el.style.setProperty('--m3-color', color);
      lines[i].style.stroke = color;
      stops[i * 2].style.stopColor = color;
      stops[i * 2 + 1].style.stopColor = color;
      return {
        cfg, el, area: areas[i], line: lines[i],
        icon: el.querySelector('ha-state-icon'), name: el.querySelector('.head span'),
        value: el.querySelector('.value'), extrema: el.querySelector('.extrema'),
      };
    });
    if (entities.length < 2) this._delta = null;
    this._states = null;
  }

  // Historique de tous les capteurs en une requête (format compact : s = état, lu = horodatage en secondes).
  async _load() {
    if (this._samples || this._loading || !this._hass) return;
    this._loading = true;
    const ids = this._config.entities.map((e) => e.entity);
    const end = new Date();
    const start = new Date(end - this._config.hours_to_show * 3600 * 1000);
    try {
      const res = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      if (ids.join() !== this._config.entities.map((e) => e.entity).join()) return;
      this._samples = ids.map((id) => (res[id] ?? [])
        .map((p) => ({ t: (p.lu ?? p.lc) * 1000, v: parseFloat(p.s) }))
        .filter((p) => !isNaN(p.v) && !isNaN(p.t)));
    } catch (err) {
      console.warn('m3-multi-graph-card : historique indisponible', err);
      this._samples = ids.map(() => []);
    } finally {
      this._loading = false;
    }
    this._render();
  }

  // Valeurs par tranche de chaque capteur, puis une échelle commune à toutes les courbes.
  _graph() {
    const end = Date.now();
    const start = end - this._config.hours_to_show * 3600 * 1000;
    const series = this._series.map((_, i) => {
      const samples = [...(this._samples?.[i] ?? [])];
      const current = parseFloat(this._states?.[i]?.state);
      if (!isNaN(current)) samples.push({ t: end, v: current });
      return { samples, values: bucketize(samples, start, end) };
    });
    const all = series.flatMap((s) => s.values.filter((v) => v !== undefined));
    if (!all.length) return series.map((s) => ({ ...s, line: '', area: '' }));
    let min = Math.min(...all), max = Math.max(...all);
    if (max - min < 1e-9) { min -= 1; max += 1; }
    // 10 % de marge en haut pour que la courbe la plus haute ne touche pas le bord.
    const y = (v) => 100 - ((v - min) / (max - min)) * 90;
    return series.map((s) => {
      const first = s.values.findIndex((v) => v !== undefined);
      if (first === -1) return { ...s, line: '', area: '' };
      const points = s.values.slice(first).map((v, i) => [((first + i) / (GRAPH_BUCKETS - 1)) * 100, y(v)]);
      if (points.length === 1) points.unshift([0, points[0][1]]);
      const line = monotonePath(points);
      return { ...s, line, area: `${line} L100,100 L${points[0][0]},100 Z` };
    });
  }

  _format(value, entityId) {
    const precision = this._hass.entities?.[entityId]?.display_precision ?? 1;
    return new Intl.NumberFormat(this._hass.locale?.language ?? 'fr', {
      minimumFractionDigits: precision, maximumFractionDigits: precision,
    }).format(value);
  }

  _render() {
    if (!this._series || !this._hass) return;
    const graph = this._graph();
    this._card = this.shadowRoot.querySelector('ha-card');
    this._card.style.setProperty('--m3-graph-height', `${Math.max(20, Math.min(100, Number(this._config.graph_height)))}%`);

    this._series.forEach((serie, i) => {
      const s = this._states?.[i];
      const { cfg } = serie;
      const value = parseFloat(s?.state);
      const unit = s?.attributes.unit_of_measurement ?? '';
      serie.name.textContent = cfg.name ?? s?.attributes.friendly_name ?? cfg.entity;
      Object.assign(serie.icon, { hass: this._hass, stateObj: s, icon: cfg.icon });
      serie.value.innerHTML = '';
      serie.value.append(isNaN(value) ? '—' : this._format(value, cfg.entity));
      if (!isNaN(value) && unit) {
        const u = document.createElement('span');
        u.className = 'unit';
        u.textContent = unit;
        serie.value.append(u);
      }
      // Min / max de la période, sur les mesures brutes.
      const values = graph[i].samples.map((p) => p.v);
      const suffix = unit.startsWith('°') ? '°' : unit ? ` ${unit}` : '';
      serie.extrema.textContent = values.length
        ? `↓ ${this._format(Math.min(...values), cfg.entity)}${suffix}  ↑ ${this._format(Math.max(...values), cfg.entity)}${suffix}`
        : '';
      serie.line.setAttribute('d', graph[i].line);
      serie.area.setAttribute('d', graph[i].area);
    });

    if (this._delta) {
      const [a, b] = this._states ?? [];
      const diff = parseFloat(a?.state) - parseFloat(b?.state);
      const unit = a?.attributes.unit_of_measurement ?? '';
      this._delta.querySelector('span').textContent = isNaN(diff)
        ? '—'
        : `${diff > 0 ? '+' : ''}${this._format(diff, this._config.entities[0].entity)} ${unit}`.trim();
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-multi-graph-card-editor', M3MultiGraphCardEditor);

if (!customElements.get('m3-multi-graph-card')) {
  customElements.define('m3-multi-graph-card', M3MultiGraphCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-multi-graph-card',
    name: 'M3 Multi Graph',
    description: t(null, 'Several sensors on one graph (e.g. indoor / outdoor temperature), with an optional difference or min / max'),
    preview: true,
  });
}
