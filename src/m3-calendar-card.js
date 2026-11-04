// m3-calendar-card — agenda Material 3 : les prochains événements d'un ou plusieurs calendriers, groupés par jour,
// en lignes empilées aux grands coins arrondis ; chaque calendrier a sa couleur, l'événement en cours est mis en avant.
const STYLE = `
:host { display: block; }
ha-card { background: none; border: none; box-shadow: none; }
.title { ${TITLE_FONT} padding: 4px 4px 10px; color: var(--md-sys-color-on-surface, var(--primary-text-color)); }
:host(:not([titled])) .title { display: none; }
.days { display: flex; flex-direction: column; gap: 14px; }
.day-label {
  font-size: 14px; font-weight: 600; letter-spacing: 0.1px; padding: 0 4px 8px;
  color: var(--md-sys-color-on-surface-variant, var(--secondary-text-color));
}
.day-label::first-letter { text-transform: uppercase; }
.day[today] .day-label { color: var(--md-sys-color-primary, var(--primary-color)); }
.events { display: flex; flex-direction: column; gap: 2px; }
.event {
  display: flex; align-items: center; gap: 16px; min-height: 64px; box-sizing: border-box; padding: 10px 16px 10px 12px;
  border-radius: 4px; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  transition: border-radius 200ms ease, background 300ms ease;
}
.event:first-child { border-top-left-radius: var(--m3-radius); border-top-right-radius: var(--m3-radius); }
.event:last-child { border-bottom-left-radius: var(--m3-radius); border-bottom-right-radius: var(--m3-radius); }
.event:active { border-radius: calc(var(--m3-radius) / 2); }
.event[now] {
  background: color-mix(in srgb, var(--m3-color) 22%, var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color))));
}
.lead {
  flex: none; width: 52px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--m3-color) 24%, transparent);
  /* Texte mêlé à on-surface : lisible même quand la couleur du calendrier est foncée (mode sombre) ou claire. */
  color: color-mix(in srgb, var(--m3-color) 55%, var(--md-sys-color-on-surface, var(--primary-text-color)));
  flex-direction: column; line-height: 1.1; --mdc-icon-size: 22px;
}
.lead .time { font-size: 14px; font-weight: 650; letter-spacing: -0.2px; font-variant-numeric: tabular-nums; }
.lead .period { font-size: 10px; font-weight: 600; opacity: 0.85; }
.lead .period:empty { display: none; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip {
  flex: none; padding: 4px 10px; border-radius: 10px; font-size: 12px; font-weight: 600;
  background: var(--m3-color); color: var(--md-sys-color-surface, #fff);
}
.empty {
  display: flex; align-items: center; gap: 16px; min-height: 64px; box-sizing: border-box; padding: 10px 20px;
  border-radius: var(--m3-radius);
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
}
.empty ha-icon { --mdc-icon-size: 24px; color: var(--md-sys-color-primary, var(--primary-color)); }
`;

// Sans couleur configurée : les couleurs du thème Material 3, puis des couleurs HA.
// Chaque couleur garde une valeur finale : la carte reste colorée même si le thème ne définit pas la variable.
const DEFAULT_COLORS = [
  'var(--md-sys-color-primary, var(--primary-color, #6750a4))',
  'var(--md-sys-color-tertiary, var(--accent-color, #7d5260))',
  'var(--md-sys-color-secondary, var(--teal-color, #009688))',
  'var(--orange-color, #ff9800)', 'var(--pink-color, #e91e63)', 'var(--green-color, #4caf50)',
];
const RADIUS = { small: 12, medium: 20, large: 28 };
const REFRESH_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

class M3CalendarCardEditor extends M3CardEditor {
  static schema = [
    {
      name: 'entities', selector: {
        object: {
          multiple: true, label_field: 'name', description_field: 'entity',
          fields: {
            entity: { label: 'Calendar', required: true, selector: { entity: { domain: 'calendar' } } },
            name: { label: 'Name', selector: { text: {} } },
            color: { label: 'Color (CSS or HA color)', selector: { text: {} } },
          },
        },
      },
    },
    {
      type: 'grid', name: '', schema: [
        { name: 'title', selector: { text: {} } },
        { name: 'days', selector: { number: { min: 1, max: 60, step: 1, mode: 'box' } } },
        { name: 'max_events', selector: { number: { min: 1, max: 50, step: 1, mode: 'box' } } },
        {
          name: 'radius', selector: {
            select: { mode: 'dropdown', options: [
              { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' },
            ] },
          },
        },
      ],
    },
    { name: 'show_calendar', selector: { boolean: {} } },
  ];

  static labels = {
    entities: 'Calendars', title: 'Title', days: 'Days to show', max_events: 'Max events', radius: 'Corners',
    show_calendar: 'Show the calendar name',
  };
}

class M3CalendarCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-calendar-card-editor');
  }

  static getStubConfig(hass) {
    const calendars = Object.keys(hass.states).filter((e) => e.startsWith('calendar.')).slice(0, 2);
    return { entities: calendars.map((entity) => ({ entity })), days: 7 };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || !config.entities.length) {
      throw new Error('m3-calendar-card: "entities" must contain at least one calendar');
    }
    // Les calendriers s'écrivent en liste d'objets ou simplement d'identifiants.
    const entities = config.entities.map((e) => (typeof e === 'string' ? { entity: e } : e));
    if (entities.some((e) => !e.entity)) throw new Error('m3-calendar-card: every calendar needs an "entity"');
    const previous = this._config;
    this._config = { days: 7, max_events: 10, radius: 'large', show_calendar: true, ...config, entities };
    const key = (c) => `${c.entities.map((e) => e.entity).join()}|${c.days}`;
    if (!previous || key(previous) !== key(this._config)) this._events = null;
    this._build();
    if (this._hass) { this._load(); this._render(); }
  }

  getCardSize() { return 1 + Math.min(this._events?.length ?? 2, this._config.max_events); }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() {
    this._timer = setInterval(() => this._load(), REFRESH_MS);
    if (this._hass) this._load();
  }

  disconnectedCallback() { clearInterval(this._timer); }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // L'état d'un calendrier change quand un événement commence ou finit : la liste est alors rechargée.
    const watched = this._config.entities.map((e) => hass.states[e.entity]);
    const changed = !this._watched || watched.some((s, i) => s !== this._watched[i]);
    this._watched = watched;
    if (first || changed) this._load();
  }

  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const c = this._config;
    root.innerHTML = `<style>${STYLE}</style><ha-card><div class="title"></div><div class="days"></div></ha-card>`;
    root.querySelector('.title').textContent = c.title ?? '';
    this.toggleAttribute('titled', !!c.title);
    this.style.setProperty('--m3-radius', `${RADIUS[c.radius] ?? (Number(c.radius) || RADIUS.large)}px`);
    this._days = root.querySelector('.days');
  }

  // Événements de tous les calendriers sur la période, via l'API REST de Home Assistant.
  async _load() {
    if (!this._hass || !this._config) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + this._config.days * DAY_MS);
    const query = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const token = (this._loading = Symbol('load'));
    const lists = await Promise.all(this._config.entities.map(async (cal, index) => {
      try {
        const events = await this._hass.callApi('GET', `calendars/${cal.entity}?${query}`);
        return events.map((ev) => this._normalize(ev, cal, index)).filter(Boolean);
      } catch {
        return [];
      }
    }));
    if (token !== this._loading) return;
    const now = Date.now();
    this._events = lists.flat()
      .filter((ev) => ev.end > now)
      .sort((a, b) => a.start - b.start || a.allDay - b.allDay || a.summary.localeCompare(b.summary));
    this._render();
  }

  // Les journées entières arrivent en date locale (« 2026-11-05 »), les autres en date-heure ISO.
  _normalize(ev, cal, index) {
    const parse = (v) => {
      if (!v) return null;
      if (v.date) {
        const [y, m, d] = v.date.split('-').map(Number);
        return new Date(y, m - 1, d).getTime();
      }
      return Date.parse(v.dateTime ?? v);
    };
    const start = parse(ev.start);
    const end = parse(ev.end) ?? start;
    if (start == null || isNaN(start)) return null;
    const s = this._hass.states[cal.entity];
    return {
      start, end, allDay: !!ev.start?.date, summary: ev.summary ?? '', calendar: cal.entity,
      calendarName: cal.name ?? s?.attributes.friendly_name ?? cal.entity,
      color: cal.color ? cssColor(cal.color) : DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    };
  }

  _render() {
    if (!this._days || !this._hass) return;
    const lang = langOf(this._hass);
    if (!this._events) {
      this._days.replaceChildren();
      return;
    }
    const events = this._events.slice(0, this._config.max_events);
    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const days = this._config.days;
      empty.innerHTML = '<ha-icon icon="mdi:calendar-check-outline"></ha-icon><div class="text"><div class="name"></div><div class="sub"></div></div>';
      empty.querySelector('.name').textContent = t(this._hass, 'Nothing planned');
      empty.querySelector('.sub').textContent = days === 1 ? t(this._hass, 'Today') : t(this._hass, 'In the next {days} days', { days });
      this._days.replaceChildren(empty);
      return;
    }
    // Un événement commencé avant aujourd'hui (plusieurs jours, en cours) est rangé sous aujourd'hui.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups = new Map();
    for (const ev of events) {
      const day = new Date(Math.max(ev.start, today.getTime()));
      day.setHours(0, 0, 0, 0);
      const k = day.getTime();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(ev);
    }
    this._days.replaceChildren(...[...groups].map(([day, list]) => {
      const group = document.createElement('div');
      group.className = 'day';
      group.toggleAttribute('today', day === today.getTime());
      const label = document.createElement('div');
      label.className = 'day-label';
      label.textContent = this._dayLabel(day, today.getTime(), lang);
      const rows = document.createElement('div');
      rows.className = 'events';
      rows.append(...list.map((ev) => this._row(ev, lang)));
      group.append(label, rows);
      return group;
    }));
  }

  _dayLabel(day, today, lang) {
    const diff = Math.round((day - today) / DAY_MS);
    if (diff === 0) return t(this._hass, 'Today');
    if (diff === 1) return t(this._hass, 'Tomorrow');
    const opts = diff < 7 ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'long' };
    return new Date(day).toLocaleDateString(lang, opts);
  }

  _time(ms, lang) {
    return new Date(ms).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' });
  }

  _row(ev, lang) {
    const now = Date.now();
    const ongoing = ev.start <= now && now < ev.end;
    const el = document.createElement('div');
    el.className = 'event';
    el.toggleAttribute('now', ongoing);
    el.style.setProperty('--m3-color', ev.color);
    el.innerHTML = '<div class="lead"></div><div class="text"><div class="name"></div><div class="sub"></div></div>';
    const lead = el.querySelector('.lead');
    if (ev.allDay) {
      lead.innerHTML = '<ha-icon icon="mdi:calendar-blank-outline"></ha-icon>';
    } else {
      // Heure en grand ; en format 12 h, « AM » / « PM » en petit dessous pour tenir dans la pastille.
      const parts = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(ev.start));
      const period = parts.find((p) => p.type === 'dayPeriod')?.value;
      const time = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
      lead.innerHTML = '<span class="time"></span><span class="period"></span>';
      lead.querySelector('.time').textContent = time;
      lead.querySelector('.period').textContent = period ?? '';
    }
    el.querySelector('.name').textContent = ev.summary || '—';
    const when = ev.allDay ? t(this._hass, 'All day') : `${this._time(ev.start, lang)} – ${this._time(ev.end, lang)}`;
    el.querySelector('.sub').textContent = this._config.show_calendar ? `${when} • ${ev.calendarName}` : when;
    if (ongoing) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = t(this._hass, 'Now');
      el.append(chip);
    }
    el.addEventListener('click', () => {
      this._fire('haptic', 'light');
      this._fire('hass-more-info', { entityId: ev.calendar });
    });
    return el;
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-calendar-card-editor', M3CalendarCardEditor);

if (!customElements.get('m3-calendar-card')) {
  customElements.define('m3-calendar-card', M3CalendarCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-calendar-card',
    name: 'M3 Calendar',
    description: t(null, "Material 3 calendar: upcoming events grouped by day, tinted with each calendar's color"),
    preview: true,
  });
}
