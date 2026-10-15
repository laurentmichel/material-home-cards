// m3-camera-card — caméra Material 3 : la dernière image s'affiche tout de suite (gardée en cache entre deux
// visites), le flux en direct se connecte derrière et ne remplace l'image qu'une fois la vidéo vraiment lancée.
const STYLE = `
:host { display: block; }
ha-card {
  position: relative; overflow: hidden; border-radius: 28px; border: none; box-shadow: none; cursor: pointer;
  aspect-ratio: var(--m3-aspect, 16 / 9); -webkit-tap-highlight-color: transparent;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface-variant, var(--secondary-text-color));
}
.layer { position: absolute; inset: 0; width: 100%; height: 100%; }
.poster { object-fit: var(--m3-fit, cover); opacity: 0; transition: opacity 300ms ease; }
.poster[shown] { opacity: 1; }
.live { opacity: 0; transition: opacity 400ms ease; }
.live[playing] { opacity: 1; }
.live ha-camera-stream { display: block; width: 100%; height: 100%; --video-max-height: none; }
/* Rien à afficher encore : icône et indicateur de connexion plutôt qu'un bloc noir. */
.placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  --mdc-icon-size: 40px; ${STATE_FONT} transition: opacity 300ms ease;
}
:host([has-image]) .placeholder { opacity: 0; pointer-events: none; }
.spinner {
  width: 20px; height: 20px; border-radius: 50%; box-sizing: border-box;
  border: 3px solid color-mix(in srgb, currentColor 25%, transparent); border-top-color: currentColor;
  animation: spin 900ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.chips { position: absolute; top: 12px; left: 12px; right: 12px; display: flex; gap: 8px; align-items: center; pointer-events: none; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 14px; box-sizing: border-box;
  background: rgba(0, 0, 0, 0.45); color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.status { margin-left: auto; }
.status::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #ffb74d; }
:host([playing]) .status::before { background: #ef5350; }
:host(:not([show-name])) .name, :host([no-live]) .status { display: none; }
`;

// Dernière image de chaque caméra, pour l'afficher immédiatement à la prochaine ouverture de la page.
const SNAPSHOT_CACHE_KEY = 'm3-camera-card:';
const SNAPSHOT_CACHE_MAX = 400 * 1024;
const SNAPSHOT_REFRESH_MS = 10 * 1000;
const LIVE_CHECK_MS = 250;

const readSnapshot = (entity) => {
  try { return localStorage.getItem(SNAPSHOT_CACHE_KEY + entity); } catch (e) { return null; }
};
const writeSnapshot = (entity, dataUrl) => {
  try { if (dataUrl.length <= SNAPSHOT_CACHE_MAX) localStorage.setItem(SNAPSHOT_CACHE_KEY + entity, dataUrl); } catch (e) { /* stockage plein ou bloqué */ }
};

// ha-camera-stream est chargé à la demande par HA : on le force via une carte native qui l'utilise.
async function ensureCameraStream() {
  if (customElements.get('ha-camera-stream')) return;
  const helpers = await window.loadCardHelpers?.();
  helpers?.createCardElement({ type: 'picture-entity', entity: 'camera.none', camera_view: 'live' });
  await customElements.whenDefined('ha-camera-stream');
}

// Vidéo du flux, cachée dans les shadow roots du lecteur WebRTC ou HLS.
const findVideo = (root, depth = 0) => {
  if (!root || depth > 4) return null;
  const video = root.querySelector?.('video');
  if (video) return video;
  for (const el of root.querySelectorAll?.('*') ?? []) {
    const found = el.shadowRoot && findVideo(el.shadowRoot, depth + 1);
    if (found) return found;
  }
  return null;
};

class M3CameraCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { domain: 'camera' } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'show_name', selector: { boolean: {} } },
        { name: 'live', selector: { boolean: {} } },
        {
          name: 'fit_mode', selector: {
            select: { mode: 'dropdown', options: [{ value: 'cover', label: 'Fill' }, { value: 'contain', label: 'Fit' }] },
          },
        },
        { name: 'aspect_ratio', selector: { text: {} } },
      ],
    },
  ];

  static labels = {
    entity: 'Camera', name: 'Name', show_name: 'Show the name', live: 'Live view', fit_mode: 'Image',
    aspect_ratio: 'Aspect ratio',
  };

  static helpers = {
    live: 'Otherwise the image is refreshed every 10 seconds',
    aspect_ratio: 'For example 16:9 or 4:3. Empty: from the camera image',
  };
}

class M3CameraCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-camera-card-editor');
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('camera.')) ?? 'camera.example' };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-camera-card: "entity" is required');
    const entityChanged = this._config?.entity !== config.entity;
    this._config = config;
    if (!this.shadowRoot) this._build();
    this.toggleAttribute('show-name', !!config.show_name);
    this.toggleAttribute('no-live', config.live === false);
    this._card.style.setProperty('--m3-fit', config.fit_mode === 'contain' ? 'contain' : 'cover');
    const ratio = String(config.aspect_ratio ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/);
    this._fixedRatio = ratio ? `${ratio[1]} / ${ratio[2]}` : null;
    if (this._fixedRatio) this._card.style.setProperty('--m3-aspect', this._fixedRatio);
    if (entityChanged) {
      this._stopLive();
      this._showCached();
    }
    if (this._hass) this._render();
  }

  getCardSize() { return 4; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() {
    this._refreshTimer = setInterval(() => { if (!this._playing) this._loadSnapshot(); }, SNAPSHOT_REFRESH_MS);
    if (this._hass) this._render();
  }

  disconnectedCallback() {
    clearInterval(this._refreshTimer);
    this._stopLive();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._stream) this._stream.hass = hass;
    if (first) this._loadSnapshot();
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="layer placeholder"><ha-icon icon="mdi:cctv"></ha-icon><div class="spinner"></div></div>
        <img class="layer poster" alt="">
        <div class="layer live"></div>
        <div class="chips"><span class="chip name"></span><span class="chip status"></span></div>
      </ha-card>`;
    const q = (s) => root.querySelector(s);
    this._card = q('ha-card');
    this._els = { poster: q('.poster'), live: q('.live'), name: q('.name'), status: q('.status') };
    this._els.poster.addEventListener('load', () => this._onPoster());
    this._card.addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
  }

  _showCached() {
    const cached = readSnapshot(this._config.entity);
    if (cached) this._els.poster.src = cached;
  }

  // Image actuelle de la caméra, chargée à part puis gardée en cache local.
  async _loadSnapshot() {
    const s = this._hass?.states[this._config.entity];
    const picture = s?.attributes.entity_picture;
    if (!picture || s.state === 'unavailable' || this._loadingSnapshot) return;
    this._loadingSnapshot = true;
    try {
      const url = this._hass.hassUrl?.(picture) ?? picture;
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      this._els.poster.src = dataUrl;
      writeSnapshot(this._config.entity, dataUrl);
    } catch (e) {
      // pas d'image : on garde la précédente ou l'icône d'attente
    } finally {
      this._loadingSnapshot = false;
    }
  }

  _onPoster() {
    const { poster } = this._els;
    poster.toggleAttribute('shown', true);
    this.toggleAttribute('has-image', true);
    if (!this._fixedRatio && poster.naturalWidth && poster.naturalHeight) {
      this._card.style.setProperty('--m3-aspect', `${poster.naturalWidth} / ${poster.naturalHeight}`);
    }
  }

  async _startLive() {
    if (this._stream || this._starting) return;
    this._starting = true;
    await ensureCameraStream();
    this._starting = false;
    if (!this.isConnected || this._stream || this._config.live === false) return;
    const stream = document.createElement('ha-camera-stream');
    stream.muted = true;
    stream.controls = false;
    stream.fitMode = this._config.fit_mode === 'contain' ? 'contain' : 'cover';
    stream.hass = this._hass;
    stream.stateObj = this._hass.states[this._config.entity];
    this._stream = stream;
    this._els.live.replaceChildren(stream);
    // Le lecteur ne signale pas le début de la lecture : on surveille sa vidéo.
    this._liveTimer = setInterval(() => {
      const video = findVideo(stream.shadowRoot);
      this._setPlaying(!!video && video.readyState >= 2 && !video.paused && video.videoWidth > 0);
    }, LIVE_CHECK_MS);
  }

  _stopLive() {
    clearInterval(this._liveTimer);
    this._stream?.remove();
    this._stream = null;
    this._setPlaying(false);
  }

  _setPlaying(playing) {
    if (playing === !!this._playing) return;
    this._playing = playing;
    this.toggleAttribute('playing', playing);
    this._els.live.toggleAttribute('playing', playing);
    this._els.status.textContent = playing ? t(this._hass, 'Live') : t(this._hass, 'Connecting…');
  }

  _render() {
    if (!this._els || !this._hass) return;
    const c = this._config;
    const s = this._hass.states[c.entity];
    this._els.name.textContent = c.name ?? s?.attributes.friendly_name ?? c.entity;
    if (!this._playing) this._els.status.textContent = t(this._hass, 'Connecting…');
    if (this._stream && s && this._stream.stateObj?.entity_id !== s.entity_id) this._stopLive();
    if (this._stream && s) this._stream.stateObj = s;
    if (c.live !== false && s && s.state !== 'unavailable' && this.isConnected) this._startLive();
    if (!this._els.poster.getAttribute('src')) this._showCached();
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-camera-card-editor', M3CameraCardEditor);

if (!customElements.get('m3-camera-card')) {
  customElements.define('m3-camera-card', M3CameraCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-camera-card',
    name: 'M3 Camera',
    description: t(null, 'Camera: the last image shows at once, then the live view takes over without a black screen'),
    preview: true,
  });
}
