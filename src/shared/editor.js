// Éditeur visuel commun : un <ha-form> natif de Home Assistant décrit par un schéma de sélecteurs.
// Chaque carte déclare une sous-classe avec `schema` et `labels`, et la renvoie via getConfigElement().

// ha-form est chargé à la demande par HA : on force son chargement via l'éditeur d'une carte native.
async function ensureHaForm() {
  if (customElements.get('ha-form')) return;
  const helpers = await window.loadCardHelpers?.();
  const card = await helpers?.createCardElement({ type: 'entities', entities: [] });
  await card?.constructor?.getConfigElement?.();
  await customElements.whenDefined('ha-form');
}

class M3CardEditor extends HTMLElement {
  static schema = [];
  static labels = {};
  static helpers = {};

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      const { labels, helpers } = this.constructor;
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => labels[s.name] ?? s.name;
      this._form.computeHelper = (s) => helpers[s.name];
      this._form.addEventListener('value-changed', (e) => this._changed(e.detail.value));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this.constructor.schema;
  }

  // Les champs vidés sont retirés du YAML plutôt qu'enregistrés comme chaînes vides.
  _changed(value) {
    const config = { ...value };
    for (const key of Object.keys(config)) {
      if (config[key] === '' || config[key] == null) delete config[key];
    }
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }
}

const defineEditor = (tag, editorClass) => {
  if (!customElements.get(tag)) customElements.define(tag, editorClass);
};
