// m3-statistics-card — statistiques longue durée en barres Material 3 (ex. consommation heures creuses / pleines par jour) :
// valeurs de la période choisie en haut, une barre par jour (semaine, mois), empilée quand il y a plusieurs capteurs.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 200px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  display: flex; flex-direction: column; padding: 18px 20px 14px; gap: 14px;
}
.values { display: flex; align-items: flex-start; gap: 12px; }
.entity { min-width: 0; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.head { display: flex; align-items: center; gap: 6px; ${STATE_FONT} }
.head ha-state-icon { --mdc-icon-size: 18px; color: var(--m3-color); }
.head span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.value { font-size: 1.6rem; font-weight: 400; line-height: 1.25; letter-spacing: -0.5px; white-space: nowrap; }
.chip {
  margin-left: auto; flex: none; align-self: center; padding: 6px 12px; border-radius: 16px; white-space: nowrap;
  background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.2));
  font-size: 13px; font-weight: 550;
}
.chart { flex: 1; min-height: var(--m3-chart-height, 110px); display: flex; align-items: stretch; gap: 6px; }
.col {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer;
  -webkit-tap-highlight-color: transparent; transition: opacity 200ms ease;
}
.chart.picked .col:not(.on) { opacity: 0.4; }
.track { flex: 1; width: 100%; max-width: 36px; display: flex; flex-direction: column; justify-content: flex-end; }
.stack {
  display: flex; flex-direction: column-reverse; gap: 2px; border-radius: 10px; overflow: hidden;
  min-height: 4px; transition: height 300ms ease;
}
.seg { flex: none; background: var(--m3-color); }
.stack.empty { background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.2)); }
.label { ${STATE_FONT} font-size: 12px; white-space: nowrap; }
.col.on .label { opacity: 1; font-weight: 700; }
`;

const PERIODS = ['day', 'week', 'month'];
const STAT_TYPES = ['change', 'mean', 'min', 'max'];
const DEFAULT_COLORS = ['var(--md-sys-color-primary, #8ec9ff)', 'var(--md-sys-color-tertiary, #fea6ff)', 'var(--md-sys-color-secondary, #9ccc65)'];
const REFRESH_MS = 5 * 60 * 1000;
// Après un changement d'état, on relit au plus une fois par minute.
const THROTTLE_MS = 60 * 1000;

class M3StatisticsCardEditor extends M3CardEditor {
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
      type: 'grid', name: '', schema: [
        {
          name: 'period', selector: {
            select: {
              mode: 'dropdown', options: [
                { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' },
              ],
            },
          },
        },
        { name: 'count', selector: { number: { min: 2, max: 31, step: 1, mode: 'box' } } },
        {
          name: 'stat_type', selector: {
            select: {
              mode: 'dropdown', options: [
                { value: 'change', label: 'Change' }, { value: 'mean', label: 'Mean' },
                { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' },
              ],
            },
          },
        },
        { name: 'stacked', selector: { boolean: {} } },
      ],
    },
    { name: 'chart_height', selector: { number: { min: 60, max: 300, step: 10, mode: 'slider', unit_of_measurement: 'px' } } },
  ];

  static labels = {
    entities: 'Sensors', period: 'Period', count: 'Number of bars', stat_type: 'Statistic', stacked: 'Stacked bars',
    chart_height: 'Bars height',
  };

  static helpers = {
    stacked: 'Off: one bar per sensor, side by side',
  };
}

class M3StatisticsCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-statistics-card-editor');
  }

  static getStubConfig(hass) {
    const energy = Object.keys(hass.states)
      .filter((e) => e.startsWith('sensor.') && hass.states[e].attributes.device_class === 'energy').slice(0, 2);
    return { entities: energy.map((entity) => ({ entity })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || !config.entities.length) {
      throw new Error('m3-statistics-card: "entities" must contain at least one sensor');
    }
    if (config.period && !PERIODS.includes(config.period)) {
      throw new Error(`m3-statistics-card: "period" must be one of ${PERIODS.join(', ')}`);
    }
    if (config.stat_type && !STAT_TYPES.includes(config.stat_type)) {
      throw new Error(`m3-statistics-card: "stat_type" must be one of ${STAT_TYPES.join(', ')}`);
    }
    const entities = config.entities.map((e) => (typeof e === 'string' ? { entity: e } : e));
    if (entities.some((e) => !e.entity)) throw new Error('m3-statistics-card: every sensor needs an "entity"');
    const c = { period: 'day', count: 7, stat_type: 'change', stacked: true, chart_height: 110, ...config, entities };
    c.count = Math.max(2, Math.min(60, Math.round(Number(c.count)) || 7));
    const key = `${entities.map((e) => e.entity).join()}|${c.period}|${c.count}|${c.stat_type}`;
    if (key !== this._key) { this._data = null; this._loadedAt = 0; this._pick = null; }
    this._key = key;
    this._config = c;
    this._build();
    if (this._hass) { this._load(true); this._render(); }
  }

  getCardSize() { return 4; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() {
    clearInterval(this._timer);
    this._timer = setInterval(() => this._load(true), REFRESH_MS);
    this._load(true);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    clearTimeout(this._later);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const states = this._config.entities.map((e) => hass.states[e.entity]);
    if (this._states && states.every((s, i) => s === this._states[i])) return;
    this._states = states;
    this._load(first);
    this._render();
  }

  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card><div class="values"></div><div class="chart"></div></ha-card>`;
    this._card = root.querySelector('ha-card');
    this._chart = root.querySelector('.chart');
    const values = root.querySelector('.values');
    this._series = this._config.entities.map((cfg, i) => {
      const el = document.createElement('div');
      el.className = 'entity';
      el.innerHTML = '<div class="head"><ha-state-icon></ha-state-icon><span></span></div><div class="value"></div>';
      el.addEventListener('click', () => this._fire('hass-more-info', { entityId: cfg.entity }));
      const color = cssColor(cfg.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
      el.style.setProperty('--m3-color', color);
      values.appendChild(el);
      return { cfg, color, icon: el.querySelector('ha-state-icon'), name: el.querySelector('.head span'), value: el.querySelector('.value') };
    });
    this._chip = document.createElement('div');
    this._chip.className = 'chip';
    values.appendChild(this._chip);
    this._cols = null;
    this._states = null;
  }

  // Début de chaque période (minuit local, lundi, 1er du mois), de la plus ancienne à celle en cours.
  _starts() {
    const { period, count } = this._config;
    const now = new Date();
    const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
    if (period === 'month') cur.setDate(1);
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(cur);
      if (period === 'day') d.setDate(d.getDate() - i);
      if (period === 'week') d.setDate(d.getDate() - 7 * i);
      if (period === 'month') d.setMonth(d.getMonth() - i);
      out.push(d);
    }
    return out;
  }

  async _load(force = false) {
    if (!this._hass?.callWS || !this.isConnected || !this._config) return;
    const wait = this._loadedAt + THROTTLE_MS - Date.now();
    if (!force && wait > 0) {
      clearTimeout(this._later);
      this._later = setTimeout(() => this._load(), wait);
      return;
    }
    this._loadedAt = Date.now();
    const key = this._key;
    const c = this._config;
    const starts = this._starts();
    const ids = c.entities.map((e) => e.entity);
    try {
      const res = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: starts[0].toISOString(),
        statistic_ids: ids,
        period: c.period,
        types: [c.stat_type],
        units: {},
      });
      if (key !== this._key) return;
      const ms = (v) => (typeof v === 'number' ? v : Date.parse(v));
      // Une valeur par période et par capteur ; une période sans statistique reste vide.
      this._data = {
        starts,
        values: ids.map((id) => {
          const rows = res?.[id] ?? [];
          return starts.map((s) => {
            const row = rows.find((r) => Math.abs(ms(r.start) - s.getTime()) < 3 * 3600 * 1000);
            const v = row?.[c.stat_type];
            return typeof v === 'number' ? v : null;
          });
        }),
      };
    } catch (err) {
      if (key !== this._key) return;
      console.warn('m3-statistics-card: statistics unavailable', err);
      this._data = { starts, values: ids.map(() => starts.map(() => null)) };
    }
    this._render();
  }

  _label(date, long) {
    const lang = this._hass?.locale?.language ?? this._hass?.language ?? 'fr';
    const { period } = this._config;
    if (period === 'month') return new Intl.DateTimeFormat(lang, { month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}) }).format(date);
    if (period === 'week') {
      const text = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(date);
      return long ? t(this._hass, 'Week of {date}', { date: text }) : text;
    }
    return new Intl.DateTimeFormat(lang, long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short' }).format(date);
  }

  _currentLabel() {
    return t(this._hass, { day: 'Today', week: 'This week', month: 'This month' }[this._config.period]);
  }

  _format(value, i) {
    const s = this._states?.[i];
    if (value == null) return '—';
    if (s && this._hass?.formatEntityState) return this._hass.formatEntityState(s, String(value));
    const unit = s?.attributes.unit_of_measurement;
    return unit ? `${value} ${unit}` : String(value);
  }

  _render() {
    if (!this._series || !this._hass) return;
    const c = this._config;
    this._card.style.setProperty('--m3-chart-height', `${Math.max(60, Math.min(300, Number(c.chart_height) || 110))}px`);
    const data = this._data;
    const n = c.count;
    const pick = this._pick ?? n - 1;

    this._series.forEach((serie, i) => {
      const s = this._states?.[i];
      serie.name.textContent = serie.cfg.name ?? s?.attributes.friendly_name ?? serie.cfg.entity;
      Object.assign(serie.icon, { hass: this._hass, stateObj: s, icon: serie.cfg.icon });
      serie.value.textContent = data ? this._format(data.values[i][pick], i) : '…';
    });
    this._chip.textContent = !data ? '' : pick === n - 1 ? this._currentLabel() : this._label(data.starts[pick], true);

    if (!this._cols || this._cols.length !== n) this._buildCols(n);
    this._chart.classList.toggle('picked', this._pick != null);
    if (!data) return;

    // Échelle commune : la plus haute pile (ou la plus haute barre si non empilé) touche le haut.
    const stacked = c.stacked !== false;
    const totals = data.starts.map((_, d) => data.values.map((v) => Math.max(0, v[d] ?? 0)));
    const max = Math.max(1e-9, ...totals.map((vals) => (stacked ? vals.reduce((a, b) => a + b, 0) : Math.max(...vals))));
    this._cols.forEach((col, d) => {
      col.el.classList.toggle('on', d === pick);
      col.label.textContent = this._label(data.starts[d], false);
      col.track.style.flexDirection = stacked ? 'column' : 'row';
      col.track.style.alignItems = stacked ? 'stretch' : 'flex-end';
      col.track.style.gap = stacked ? '0' : '3px';
      col.stacks.forEach((stack, i) => {
        const v = totals[d][i];
        const sum = totals[d].reduce((a, b) => a + b, 0);
        if (stacked) {
          // Une seule pile : la première pile porte tous les segments, les autres sont cachées.
          stack.style.display = i === 0 ? '' : 'none';
          if (i === 0) {
            stack.style.height = `${(sum / max) * 100}%`;
            stack.classList.toggle('empty', sum === 0);
            stack.replaceChildren(...totals[d].map((val, j) => {
              const seg = document.createElement('div');
              seg.className = 'seg';
              seg.style.setProperty('--m3-color', this._series[j].color);
              seg.style.flexGrow = '0';
              seg.style.height = sum ? `calc((100% - ${2 * (totals[d].filter((x) => x > 0).length - 1)}px) * ${val / sum})` : '0';
              seg.style.display = val > 0 ? '' : 'none';
              return seg;
            }));
          }
        } else {
          stack.style.display = '';
          stack.style.flex = '1';
          stack.style.height = `${(v / max) * 100}%`;
          stack.classList.toggle('empty', v === 0);
          const seg = document.createElement('div');
          seg.className = 'seg';
          seg.style.setProperty('--m3-color', this._series[i].color);
          seg.style.height = v > 0 ? '100%' : '0';
          stack.replaceChildren(seg);
        }
      });
    });
  }

  _buildCols(n) {
    this._chart.replaceChildren();
    this._cols = [];
    for (let d = 0; d < n; d++) {
      const el = document.createElement('div');
      el.className = 'col';
      el.innerHTML = '<div class="track"></div><div class="label"></div>';
      const track = el.querySelector('.track');
      const stacks = this._series.map(() => {
        const st = document.createElement('div');
        st.className = 'stack';
        track.appendChild(st);
        return st;
      });
      // Appui sur une barre : ses valeurs s'affichent en haut ; nouvel appui pour revenir à la période en cours.
      el.addEventListener('click', () => {
        this._pick = this._pick === d || d === n - 1 ? null : d;
        this._fire('haptic', 'selection');
        this._render();
      });
      this._chart.appendChild(el);
      this._cols.push({ el, track, stacks, label: el.querySelector('.label') });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-statistics-card-editor', M3StatisticsCardEditor);

if (!customElements.get('m3-statistics-card')) {
  customElements.define('m3-statistics-card', M3StatisticsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-statistics-card',
    name: 'M3 Statistics',
    description: t(null, 'Long-term statistics as bars per day, week or month (e.g. off-peak / peak consumption), stacked for several sensors'),
    preview: true,
  });
}
