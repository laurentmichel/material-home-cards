// m3-weather-card — météo Material 3 : conditions actuelles teintées selon le temps, et prévisions
// heure par heure (ou jour par jour) reçues en direct de Home Assistant.
const STYLE = `
:host { display: block; }
ha-card {
  overflow: hidden; box-sizing: border-box; padding: 20px; border-radius: 28px; border: none; box-shadow: none; cursor: pointer;
  background: color-mix(in srgb, var(--m3-weather) 20%, var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color))));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  transition: background 600ms ease;
}
.now { display: flex; align-items: center; gap: 16px; }
.now .icon { flex: none; color: var(--m3-weather); --mdc-icon-size: 56px; display: flex; }
.temp { font-size: 3rem; font-weight: 400; line-height: 1; letter-spacing: -1px; }
.text { flex: 1; min-width: 0; }
.condition { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.details { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.forecast {
  display: flex; gap: 4px; margin-top: 18px; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity;
}
.forecast::-webkit-scrollbar { display: none; }
:host([no-forecast]) .forecast { display: none; }
.slot {
  flex: 1 0 52px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: 20px;
  scroll-snap-align: start; background: color-mix(in srgb, var(--md-sys-color-surface, #000) 25%, transparent);
}
.slot .when { font-size: 12px; font-weight: 500; opacity: 0.75; }
.slot ha-icon { --mdc-icon-size: 24px; color: var(--m3-slot, inherit); }
.slot .t { font-size: 14px; font-weight: 600; }
.slot .rain { font-size: 11px; font-weight: 500; color: var(--md-sys-color-primary, #4fc3f7); min-height: 13px; }
`;

// Icône et couleur de chaque condition ; la nuit, les icônes « soleil » passent en version lune.
const WEATHER = {
  'clear-night': ['mdi:weather-night', '#7e8cff'],
  cloudy: ['mdi:weather-cloudy', '#90a4ae'],
  exceptional: ['mdi:alert-circle-outline', '#ff7043'],
  fog: ['mdi:weather-fog', '#b0bec5'],
  hail: ['mdi:weather-hail', '#80deea'],
  lightning: ['mdi:weather-lightning', '#b388ff'],
  'lightning-rainy': ['mdi:weather-lightning-rainy', '#b388ff'],
  partlycloudy: ['mdi:weather-partly-cloudy', '#ffca28'],
  pouring: ['mdi:weather-pouring', '#4fc3f7'],
  rainy: ['mdi:weather-rainy', '#4fc3f7'],
  snowy: ['mdi:weather-snowy', '#e1f5fe'],
  'snowy-rainy': ['mdi:weather-snowy-rainy', '#b3e5fc'],
  sunny: ['mdi:weather-sunny', '#ffb300'],
  windy: ['mdi:weather-windy', '#a5d6a7'],
  'windy-variant': ['mdi:weather-windy-variant', '#a5d6a7'],
};
const NIGHT_ICONS = { sunny: 'mdi:weather-night', partlycloudy: 'mdi:weather-night-partly-cloudy' };

class M3WeatherCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { domain: 'weather' } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        {
          name: 'forecast_type', selector: {
            select: { mode: 'dropdown', options: [
              { value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' }, { value: 'none', label: 'None' },
            ] },
          },
        },
        { name: 'forecast_slots', selector: { number: { min: 3, max: 24, step: 1, mode: 'box' } } },
      ],
    },
  ];

  static labels = { entity: 'Weather', name: 'Name', forecast_type: 'Forecast', forecast_slots: 'Number of forecasts' };
}

class M3WeatherCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-weather-card-editor');
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('weather.')) ?? 'weather.home' };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-weather-card: "entity" is required');
    this._config = { forecast_type: 'hourly', forecast_slots: 8, ...config };
    this.toggleAttribute('no-forecast', this._config.forecast_type === 'none');
    if (!this.shadowRoot) this._build();
    this._forecast = null;
    this._resubscribe();
    if (this._hass) this._render();
  }

  getCardSize() { return 4; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() { this._resubscribe(); }

  disconnectedCallback() { this._unsubscribe(); }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._resubscribe();
    const s = hass.states[this._config.entity];
    if (s === this._stateObj && !first) return;
    this._stateObj = s;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="now">
          <div class="icon"><ha-icon></ha-icon></div>
          <div class="text"><div class="condition"></div><div class="details"></div></div>
          <div class="temp"></div>
        </div>
        <div class="forecast"></div>
      </ha-card>`;
    const q = (s) => root.querySelector(s);
    this._card = q('ha-card');
    this._els = { icon: q('.now ha-icon'), condition: q('.condition'), details: q('.details'), temp: q('.temp'), forecast: q('.forecast') };
    this._card.addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
  }

  // Prévisions par abonnement : Home Assistant renvoie la liste à chaque mise à jour.
  _resubscribe() {
    this._unsubscribe();
    const c = this._config;
    if (!this._hass?.connection || !c || !this.isConnected || c.forecast_type === 'none') return;
    this._unsub = this._hass.connection.subscribeMessage(
      (msg) => {
        this._forecast = msg.forecast ?? [];
        this._render();
      },
      { type: 'weather/subscribe_forecast', forecast_type: c.forecast_type, entity_id: c.entity },
    ).catch(() => null);
  }

  _unsubscribe() {
    this._unsub?.then((fn) => fn?.()).catch(() => {});
    this._unsub = null;
  }

  _isNight(date = new Date()) {
    const sun = this._hass.states['sun.sun'];
    if (!sun) return date.getHours() < 7 || date.getHours() >= 20;
    if (date - Date.now() < 60 * 1000) return sun.state === 'below_horizon';
    // Heure à venir : comparée au prochain coucher et au prochain lever du soleil.
    const rising = Date.parse(sun.attributes.next_rising), setting = Date.parse(sun.attributes.next_setting), t = date.getTime();
    return setting < rising ? t >= setting && t < rising : t < rising || t >= setting;
  }

  // `date` : undefined = maintenant, null = journée entière (jamais la nuit).
  _icon(condition, date) {
    const night = date === null ? false : this._isNight(date ?? new Date());
    return (night && NIGHT_ICONS[condition]) || WEATHER[condition]?.[0] || 'mdi:weather-cloudy';
  }

  _num(v, unit = '') {
    if (v == null || isNaN(v)) return '—';
    const n = new Intl.NumberFormat(this._hass.locale?.language ?? 'fr', { maximumFractionDigits: 0 }).format(v);
    return `${n}${unit}`;
  }

  _render() {
    if (!this._els || !this._hass) return;
    const s = this._stateObj;
    const e = this._els;
    if (!s) {
      e.condition.textContent = t(this._hass, 'Weather not found');
      return;
    }
    const a = s.attributes;
    const condition = s.state;
    const night = this._isNight();
    this._card.style.setProperty('--m3-weather', night && NIGHT_ICONS[condition] ? WEATHER['clear-night'][1] : WEATHER[condition]?.[1] ?? '#90a4ae');
    e.icon.icon = this._icon(condition);
    e.condition.textContent = this._config.name ?? this._hass.formatEntityState?.(s) ?? condition;
    e.temp.textContent = this._num(a.temperature, '°');
    const details = [];
    if (a.apparent_temperature != null && Math.round(a.apparent_temperature) !== Math.round(a.temperature)) {
      details.push(t(this._hass, 'Feels like {temp}', { temp: this._num(a.apparent_temperature, '°') }));
    }
    if (a.humidity != null) details.push(`${this._num(a.humidity)} %`);
    if (a.wind_speed != null) details.push(`${this._num(a.wind_speed)} ${a.wind_speed_unit ?? 'km/h'}`);
    e.details.textContent = this._config.name ? [this._hass.formatEntityState?.(s), ...details].filter(Boolean).join(' • ') : details.join(' • ');

    const daily = this._config.forecast_type === 'daily';
    const slots = (this._forecast ?? [])
      .filter((f) => Date.parse(f.datetime) > Date.now() - (daily ? 12 : 1) * 3600 * 1000)
      .slice(0, this._config.forecast_slots);
    const lang = this._hass.locale?.language ?? 'fr';
    e.forecast.replaceChildren(...slots.map((f) => {
      const date = new Date(f.datetime);
      const slot = document.createElement('div');
      slot.className = 'slot';
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = daily
        ? date.toLocaleDateString(lang, { weekday: 'short' }).replace('.', '')
        : date.toLocaleTimeString(lang, { hour: 'numeric' });
      const icon = document.createElement('ha-icon');
      icon.icon = this._icon(f.condition, daily ? null : date);
      icon.style.setProperty('--m3-slot', WEATHER[f.condition]?.[1] ?? 'inherit');
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = daily && f.templow != null ? `${this._num(f.temperature, '°')} / ${this._num(f.templow, '°')}` : this._num(f.temperature, '°');
      const rain = document.createElement('span');
      rain.className = 'rain';
      rain.textContent = f.precipitation_probability ? `${this._num(f.precipitation_probability)} %` : f.precipitation ? `${f.precipitation} mm` : '';
      slot.append(when, icon, t, rain);
      return slot;
    }));
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-weather-card-editor', M3WeatherCardEditor);

if (!customElements.get('m3-weather-card')) {
  customElements.define('m3-weather-card', M3WeatherCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-weather-card',
    name: 'M3 Weather',
    description: t(null, 'Material 3 weather: current conditions tinted by the weather, with an hourly or daily forecast'),
    preview: true,
  });
}
