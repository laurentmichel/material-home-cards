// m3-media-card — lecteur multimédia Material 3 : pochette, titre, progression, commandes et volume.
// Les couleurs de la carte sont tirées de la pochette (Material You) ; carte compacte quand rien ne joue.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; box-sizing: border-box; padding: 16px 20px 18px;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; flex-direction: column; gap: 14px;
  transition: background 600ms ease, color 600ms ease;
}
button {
  all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 50%;
  transition: background 200ms ease, border-radius 300ms cubic-bezier(0.2, 0, 0, 1), transform 120ms ease;
}
button:active { transform: scale(0.92); }
button[hidden] { display: none; }
.top { display: flex; align-items: center; gap: 14px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.art {
  flex: none; width: 72px; height: 72px; border-radius: 16px; overflow: hidden;
  display: flex; align-items: center; justify-content: center; --mdc-icon-size: 32px;
  background: color-mix(in srgb, var(--m3-accent) 22%, transparent); color: var(--m3-accent);
}
.art img { width: 100%; height: 100%; object-fit: cover; }
.art img[hidden], .art ha-state-icon[hidden] { display: none; }
.text { flex: 1; min-width: 0; }
.title { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.artist { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.source { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; font-weight: 500; opacity: 0.7; --mdc-icon-size: 14px; }
.source span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.power { flex: none; width: 40px; height: 40px; --mdc-icon-size: 22px; align-self: flex-start; }
.power:hover { background: color-mix(in srgb, var(--m3-fg) 8%, transparent); }

.progress { display: flex; flex-direction: column; gap: 4px; }
.bar { position: relative; height: 16px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.bar::before { content: ''; position: absolute; left: 0; right: 0; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--m3-fg) 18%, transparent); }
.fill { position: absolute; left: 0; height: 4px; border-radius: 2px; background: var(--m3-accent); width: var(--m3-progress, 0%); }
.times { display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; opacity: 0.7; font-variant-numeric: tabular-nums; }
:host(:not([seekable])) .bar { cursor: default; }

.controls { display: flex; align-items: center; justify-content: center; gap: 12px; }
.controls button { width: 48px; height: 48px; --mdc-icon-size: 26px; }
.controls button:hover { background: color-mix(in srgb, var(--m3-fg) 8%, transparent); }
.controls .play {
  width: 64px; height: 64px; border-radius: 32px; --mdc-icon-size: 30px;
  background: var(--m3-accent); color: var(--m3-on-accent);
}
.controls .play:hover { background: var(--m3-accent); }
/* Material 3 Expressive : le bouton passe du cercle au carré arrondi pendant la lecture. */
:host([playing]) .controls .play { border-radius: 20px; }
.controls .small { width: 40px; height: 40px; --mdc-icon-size: 20px; opacity: 0.75; }
.controls .small[active] { opacity: 1; color: var(--m3-accent); }

.volume { display: flex; align-items: center; gap: 10px; }
.volume button { width: 36px; height: 36px; --mdc-icon-size: 20px; }
.vbar { position: relative; flex: 1; height: 24px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.vbar::before { content: ''; position: absolute; left: 0; right: 0; height: 12px; border-radius: 6px; background: color-mix(in srgb, var(--m3-fg) 14%, transparent); }
.vfill { position: absolute; left: 0; height: 12px; border-radius: 6px; background: var(--m3-accent); width: var(--m3-volume, 0%); min-width: 12px; }
.vpct { width: 38px; text-align: right; font-size: 12px; font-weight: 500; opacity: 0.7; font-variant-numeric: tabular-nums; }

:host([compact]) .progress, :host([compact]) .controls, :host([compact]) .volume { display: none; }
:host([compact]) .art { width: 48px; height: 48px; border-radius: 14px; --mdc-icon-size: 24px; }
:host([no-progress]) .progress, :host([no-volume]) .volume, :host([no-source]) .source { display: none; }
:host([unavailable]) ha-card { opacity: 0.6; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const PRIMARY = 'var(--md-sys-color-primary, var(--primary-color))';
const ON_PRIMARY = 'var(--md-sys-color-on-primary, #fff)';
const VOLUME_INTERVAL = 300;

// Fonctionnalités d'un media_player (bits de supported_features).
const F = {
  PAUSE: 1, SEEK: 2, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32,
  TURN_ON: 128, TURN_OFF: 256, PLAY: 16384, SHUFFLE: 32768, REPEAT: 262144,
};

// Icône de l'application ou de la source en cours, d'après son nom.
const APP_ICONS = [
  [/netflix/, 'mdi:netflix'], [/youtube/, 'mdi:youtube'], [/spotify/, 'mdi:spotify'],
  [/music.?assistant/, 'mdi:playlist-music'], [/plex/, 'mdi:plex'], [/twitch/, 'mdi:twitch'],
  [/deezer|tidal|qobuz|apple music/, 'mdi:music-circle'], [/radio|tunein/, 'mdi:radio'],
  [/hdmi|tv|live/, 'mdi:television-classic'], [/airplay|cast|dlna|network/, 'mdi:cast-audio'],
];

const formatTime = (seconds) => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60), m = Math.floor(seconds / 60) % 60, h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
};

class M3MediaCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { domain: 'media_player' } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
      ],
    },
    {
      type: 'grid', name: '', schema: [
        { name: 'show_progress', selector: { boolean: {} } },
        { name: 'show_volume', selector: { boolean: {} } },
        { name: 'show_source', selector: { boolean: {} } },
        { name: 'artwork_colors', selector: { boolean: {} } },
      ],
    },
  ];

  static labels = {
    entity: 'Player', name: 'Name', icon: 'Icon', show_progress: 'Progress', show_volume: 'Volume',
    show_source: 'App / source', artwork_colors: 'Artwork colors',
  };
}

class M3MediaCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-media-card-editor');
  }

  static getStubConfig(hass) {
    const players = Object.keys(hass.states).filter((e) => e.startsWith('media_player.'));
    return { entity: players.find((e) => hass.states[e].state === 'playing') ?? players[0] ?? 'media_player.example' };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-media-card: "entity" is required');
    this._config = { show_progress: true, show_volume: true, show_source: true, artwork_colors: true, ...config };
    if (!this.shadowRoot) this._build();
    this._artColor = undefined;
    this._artUrl = undefined;
    if (this._hass) this._render();
  }

  getCardSize() { return 4; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() {
    // La position de lecture avance localement chaque seconde entre deux mises à jour de HA.
    this._ticker = setInterval(() => this._renderProgress(), 1000);
  }

  disconnectedCallback() { clearInterval(this._ticker); }

  set hass(hass) {
    this._hass = hass;
    const s = hass.states[this._config.entity];
    if (s === this._stateObj) return;
    this._stateObj = s;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="top">
          <div class="art"><img alt="" hidden><ha-state-icon></ha-state-icon></div>
          <div class="text">
            <div class="title"></div><div class="artist"></div>
            <div class="source"><ha-icon></ha-icon><span></span></div>
          </div>
          <button class="power" title="${t(this._hass, 'Turn on / off')}"><ha-icon icon="mdi:power"></ha-icon></button>
        </div>
        <div class="progress">
          <div class="bar"><div class="fill"></div></div>
          <div class="times"><span class="pos"></span><span class="dur"></span></div>
        </div>
        <div class="controls">
          <button class="small shuffle" title="${t(this._hass, 'Shuffle')}"><ha-icon icon="mdi:shuffle-variant"></ha-icon></button>
          <button class="prev" title="${t(this._hass, 'Previous')}"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
          <button class="play" title="${t(this._hass, 'Play / pause')}"><ha-icon></ha-icon></button>
          <button class="next" title="${t(this._hass, 'Next')}"><ha-icon icon="mdi:skip-next"></ha-icon></button>
          <button class="small repeat" title="${t(this._hass, 'Repeat')}"><ha-icon></ha-icon></button>
        </div>
        <div class="volume">
          <button class="mute" title="${t(this._hass, 'Mute')}"><ha-icon></ha-icon></button>
          <div class="vbar"><div class="vfill"></div></div>
          <span class="vpct"></span>
        </div>
      </ha-card>`;
    const q = (s) => root.querySelector(s);
    this._card = q('ha-card');
    this._els = {
      img: q('.art img'), artIcon: q('.art ha-state-icon'), title: q('.title'), artist: q('.artist'),
      sourceIcon: q('.source ha-icon'), source: q('.source span'), power: q('.power'),
      bar: q('.bar'), pos: q('.pos'), dur: q('.dur'),
      shuffle: q('.shuffle'), prev: q('.prev'), play: q('.play'), playIcon: q('.play ha-icon'), next: q('.next'),
      repeat: q('.repeat'), repeatIcon: q('.repeat ha-icon'),
      mute: q('.mute'), muteIcon: q('.mute ha-icon'), vbar: q('.vbar'), vpct: q('.vpct'),
    };
    const e = this._els;
    e.img.addEventListener('error', () => { e.img.hidden = true; e.artIcon.hidden = false; });
    q('.top').addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
    e.power.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const off = ['off', 'standby'].includes(this._stateObj?.state);
      this._call(off ? 'turn_on' : 'turn_off');
    });
    e.play.addEventListener('click', () => this._call('media_play_pause'));
    e.prev.addEventListener('click', () => this._call('media_previous_track'));
    e.next.addEventListener('click', () => this._call('media_next_track'));
    e.shuffle.addEventListener('click', () => this._call('shuffle_set', { shuffle: !this._stateObj?.attributes.shuffle }));
    e.repeat.addEventListener('click', () => {
      const order = ['off', 'all', 'one'];
      const current = order.indexOf(this._stateObj?.attributes.repeat ?? 'off');
      this._call('repeat_set', { repeat: order[(current + 1) % order.length] });
    });
    e.mute.addEventListener('click', () => this._call('volume_mute', { is_volume_muted: !this._stateObj?.attributes.is_volume_muted }));
    this._bindSeek();
    this._bindVolume();
  }

  _supports(flag) { return ((this._stateObj?.attributes.supported_features ?? 0) & flag) !== 0; }

  _call(service, data = {}) {
    this._fire('haptic', 'light');
    this._hass.callService('media_player', service, { entity_id: this._config.entity, ...data });
  }

  _render() {
    if (!this._card || !this._hass) return;
    const c = this._config;
    const s = this._stateObj;
    const e = this._els;
    const a = s?.attributes ?? {};
    const unavailable = !s || s.state === 'unavailable';
    const off = unavailable || ['off', 'standby'].includes(s.state);
    const hasMedia = !off && !!(a.media_title || a.media_artist);
    const playing = s?.state === 'playing';

    this.toggleAttribute('unavailable', unavailable);
    this.toggleAttribute('playing', playing);
    this.toggleAttribute('compact', !hasMedia);
    this.toggleAttribute('no-progress', !c.show_progress || !a.media_duration);
    this.toggleAttribute('no-volume', !c.show_volume || a.volume_level == null || !this._supports(F.VOLUME_SET));
    this.toggleAttribute('seekable', this._supports(F.SEEK));

    const name = c.name ?? a.friendly_name ?? c.entity;
    const stateText = unavailable ? t(this._hass, 'Unavailable') : (this._hass.formatEntityState?.(s) ?? s.state);
    if (hasMedia) {
      e.title.textContent = a.media_title ?? name;
      e.artist.textContent = [a.media_artist ?? a.media_series_title, a.media_album_name].filter(Boolean).join(' • ') || name;
    } else {
      e.title.textContent = name;
      e.artist.textContent = stateText;
    }

    // Application / source : nom et icône, plus le nom du lecteur quand un titre est affiché.
    const app = a.app_name ?? (a.app_id === 'music_assistant' ? 'Music Assistant' : a.source);
    const label = hasMedia ? [name, app].filter(Boolean).join(' • ') : app;
    const key = `${a.app_name ?? ''} ${a.app_id ?? ''} ${a.source ?? ''}`.toLowerCase();
    this.toggleAttribute('no-source', !c.show_source || !label);
    e.source.textContent = label ?? '';
    e.sourceIcon.icon = APP_ICONS.find(([re]) => re.test(key))?.[1] ?? 'mdi:speaker';

    // Pochette, sinon l'icône du lecteur (enceinte, TV...).
    const picture = hasMedia && (a.entity_picture_local ?? a.entity_picture);
    const url = picture ? (this._hass.hassUrl?.(picture) ?? picture) : null;
    if (url !== this._artUrl) {
      this._artUrl = url;
      e.img.hidden = !url;
      if (url) e.img.src = url;
      else e.img.removeAttribute('src');
      e.artIcon.hidden = !!url;
      this._artColor = null;
      if (url && c.artwork_colors) this._extractColor(url);
    }
    Object.assign(e.artIcon, { hass: this._hass, stateObj: s, icon: c.icon });

    e.power.hidden = !(this._supports(F.TURN_ON) || this._supports(F.TURN_OFF)) || unavailable;
    e.playIcon.icon = playing ? 'mdi:pause' : 'mdi:play';
    e.play.hidden = !(this._supports(F.PLAY) || this._supports(F.PAUSE));
    e.prev.hidden = !this._supports(F.PREVIOUS);
    e.next.hidden = !this._supports(F.NEXT);
    e.shuffle.hidden = !this._supports(F.SHUFFLE);
    e.shuffle.toggleAttribute('active', !!a.shuffle);
    e.repeat.hidden = !this._supports(F.REPEAT);
    e.repeat.toggleAttribute('active', !!a.repeat && a.repeat !== 'off');
    e.repeatIcon.icon = a.repeat === 'one' ? 'mdi:repeat-once' : a.repeat === 'all' ? 'mdi:repeat' : 'mdi:repeat-off';

    e.mute.hidden = !this._supports(F.VOLUME_MUTE);
    e.muteIcon.icon = a.is_volume_muted ? 'mdi:volume-off' : 'mdi:volume-high';
    if (!this._dragging) this._setVolume(a.volume_level ?? 0);

    this._applyColors();
    this._renderProgress();
  }

  // Position actuelle : position connue + temps écoulé depuis sa mise à jour, pendant la lecture.
  _position() {
    const a = this._stateObj?.attributes ?? {};
    let pos = a.media_position ?? 0;
    if (this._stateObj?.state === 'playing' && a.media_position_updated_at) {
      pos += (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
    }
    return Math.min(pos, a.media_duration ?? pos);
  }

  _renderProgress() {
    if (!this._els || this._seeking) return;
    const dur = this._stateObj?.attributes.media_duration;
    if (!dur) return;
    const pos = this._position();
    this._card.style.setProperty('--m3-progress', `${(pos / dur) * 100}%`);
    this._els.pos.textContent = formatTime(pos);
    this._els.dur.textContent = formatTime(dur);
  }

  _setVolume(level) {
    this._card.style.setProperty('--m3-volume', `${level * 100}%`);
    this._els.vpct.textContent = `${Math.round(level * 100)} %`;
  }

  // Un appui ou un glissement sur la barre ; la valeur est envoyée au relâchement.
  _bindSeek() {
    const bar = this._els.bar;
    const ratio = (ev) => {
      const r = bar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (ev.clientX - r.left) / (r.width || 1)));
    };
    const show = (ev) => {
      const dur = this._stateObj?.attributes.media_duration ?? 0;
      this._card.style.setProperty('--m3-progress', `${ratio(ev) * 100}%`);
      this._els.pos.textContent = formatTime(ratio(ev) * dur);
    };
    bar.addEventListener('pointerdown', (ev) => {
      if (!this._supports(F.SEEK)) return;
      this._seeking = true;
      bar.setPointerCapture?.(ev.pointerId);
      show(ev);
    });
    bar.addEventListener('pointermove', (ev) => { if (this._seeking) show(ev); });
    bar.addEventListener('pointerup', (ev) => {
      if (!this._seeking) return;
      this._seeking = false;
      const dur = this._stateObj?.attributes.media_duration ?? 0;
      this._call('media_seek', { seek_position: Math.round(ratio(ev) * dur) });
    });
    bar.addEventListener('pointercancel', () => { this._seeking = false; this._renderProgress(); });
  }

  // Volume : envoi pendant le glissement au plus toutes les 300 ms, et la valeur finale au relâchement.
  _bindVolume() {
    const bar = this._els.vbar;
    const level = (ev) => {
      const r = bar.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / (r.width || 1))) * 100) / 100;
    };
    let lastSent = 0;
    const send = (v, force) => {
      if (!force && Date.now() - lastSent < VOLUME_INTERVAL) return;
      lastSent = Date.now();
      this._hass.callService('media_player', 'volume_set', { entity_id: this._config.entity, volume_level: v });
    };
    bar.addEventListener('pointerdown', (ev) => {
      this._dragging = true;
      bar.setPointerCapture?.(ev.pointerId);
      this._setVolume(level(ev));
      send(level(ev));
    });
    bar.addEventListener('pointermove', (ev) => {
      if (!this._dragging) return;
      this._setVolume(level(ev));
      send(level(ev));
    });
    bar.addEventListener('pointerup', (ev) => {
      if (!this._dragging) return;
      this._dragging = false;
      this._setVolume(level(ev));
      send(level(ev), true);
    });
    bar.addEventListener('pointercancel', () => { this._dragging = false; });
  }

  // Couleur dominante de la pochette : moyenne des pixels pondérée par leur saturation.
  _extractColor(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (url !== this._artUrl) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 24;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
          const weight = 0.05 + (max ? (max - min) / max : 0) * (max / 255);
          r += data[i] * weight; g += data[i + 1] * weight; b += data[i + 2] * weight; total += weight;
        }
        this._artColor = [r / total, g / total, b / total].map(Math.round);
      } catch {
        // Image d'un autre domaine sans CORS : pas d'accès aux pixels, on garde les couleurs du thème.
        this._artColor = null;
      }
      this._applyColors();
    };
    img.src = url;
  }

  // Avec une couleur de pochette : fond teinté, accent vif ; sinon les couleurs du thème.
  _applyColors() {
    const st = this._card.style;
    const color = this._artColor;
    if (color && this._config.artwork_colors && !this.hasAttribute('compact')) {
      // Accent assez lumineux pour se détacher d'un fond sombre comme clair.
      const [r, g, b] = color;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const lift = lum < 0.45 ? 0.45 - lum : 0;
      const accent = color.map((v) => Math.round(v + (255 - v) * lift));
      const accentLum = (0.2126 * accent[0] + 0.7152 * accent[1] + 0.0722 * accent[2]) / 255;
      st.setProperty('--m3-accent', `rgb(${accent.join(', ')})`);
      st.setProperty('--m3-on-accent', accentLum > 0.55 ? '#1c1b1f' : '#ffffff');
      st.setProperty('--m3-bg', `color-mix(in srgb, rgb(${color.join(', ')}) 30%, ${SURFACE})`);
    } else {
      st.setProperty('--m3-accent', PRIMARY);
      st.setProperty('--m3-on-accent', ON_PRIMARY);
      st.setProperty('--m3-bg', SURFACE);
    }
    st.setProperty('--m3-fg', ON_SURFACE);
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-media-card-editor', M3MediaCardEditor);

if (!customElements.get('m3-media-card')) {
  customElements.define('m3-media-card', M3MediaCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-media-card',
    name: 'M3 Media',
    description: t(null, 'Material 3 media player: artwork, progress, controls, volume and artwork colors'),
    preview: true,
  });
}
