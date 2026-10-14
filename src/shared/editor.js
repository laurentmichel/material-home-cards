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
      // Libellés écrits en anglais, traduits dans la langue de Home Assistant.
      this._form.computeLabel = (s) => (labels[s.name] ? t(this._hass, labels[s.name]) : s.name);
      this._form.computeHelper = (s) => (helpers[s.name] ? t(this._hass, helpers[s.name]) : undefined);
      this._form.addEventListener('value-changed', (e) => this._changed(e.detail.value));
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    // Schéma traduit une seule fois par langue : un nouveau schéma à chaque mise à jour ferait tout redessiner.
    const lang = langOf(this._hass);
    if (lang !== this._lang) {
      this._lang = lang;
      this._schema = translateSchema(this._hass, this.constructor.schema);
    }
    this._form.schema = this._schema;
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

// Titres de sections, libellés d'options et champs d'objets du schéma, traduits.
function translateSchema(hass, schema) {
  const tr = (v) => (typeof v === 'string' ? t(hass, v) : v);
  return schema.map((item) => {
    const out = { ...item };
    if (out.title) out.title = tr(out.title);
    if (out.schema) out.schema = translateSchema(hass, out.schema);
    const select = out.selector?.select;
    if (select?.options) {
      out.selector = { ...out.selector, select: { ...select, options: select.options.map((o) => (o.label ? { ...o, label: tr(o.label) } : o)) } };
    }
    const object = out.selector?.object;
    if (object?.fields) {
      const fields = Object.fromEntries(Object.entries(object.fields).map(([k, f]) => {
        const field = { ...f, label: tr(f.label) };
        const options = f.selector?.select?.options;
        if (options) field.selector = { select: { ...f.selector.select, options: options.map((o) => ({ ...o, label: tr(o.label) })) } };
        return [k, field];
      }));
      out.selector = { ...out.selector, object: { ...object, fields } };
    }
    return out;
  });
}

const defineEditor = (tag, editorClass) => {
  if (!customElements.get(tag)) customElements.define(tag, editorClass);
};
