/*! Material Home Cards v1.17.1 — https://github.com/laurentmichel/material-home-cards */
console.info('%c MATERIAL-HOME-CARDS %c v1.17.1 ', 'color:#fff;background:#6750a4;font-weight:700', 'color:#6750a4;background:#eaddff');

// ---- shared/color.js ----
// Couleurs nommées de HA (amber, blue...) → variables du thème ; le reste (hex, rgb) tel quel.
const HA_COLORS = new Set([
  'primary', 'accent', 'red', 'pink', 'purple', 'deep-purple', 'indigo', 'blue', 'light-blue', 'cyan', 'teal',
  'green', 'light-green', 'lime', 'yellow', 'amber', 'orange', 'deep-orange', 'brown', 'light-grey', 'grey',
  'dark-grey', 'blue-grey', 'black', 'white', 'disabled',
]);
const cssColor = (c) => (HA_COLORS.has(c) ? `var(--${c}-color)` : c);

// ---- shared/editor.js ----
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

// ---- shared/entity.js ----
// Entités : états « actifs » et action par défaut d'un appui, communs au bouton, à la liste et au badge.

// États considérés comme « actifs » : la carte prend alors la teinte primary-container.
const ACTIVE_STATES = new Set([
  'on', 'open', 'opening', 'closing', 'playing', 'unlocked', 'unlocking', 'home',
  'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'cleaning', 'active',
  'armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'armed_custom_bypass', 'triggered',
]);

const TOGGLE_DOMAINS = new Set([
  'light', 'switch', 'input_boolean', 'fan', 'cover', 'humidifier', 'siren', 'valve', 'group', 'remote',
]);

// Action par défaut d'un appui, selon le domaine ; null = fenêtre de détails.
function defaultTapService(stateObj) {
  const [domain] = stateObj.entity_id.split('.');
  const s = stateObj.state;
  if (TOGGLE_DOMAINS.has(domain)) return ['homeassistant', 'toggle'];
  switch (domain) {
    case 'scene': return ['scene', 'turn_on'];
    case 'script': return ['script', 'turn_on'];
    case 'automation': return ['automation', 'trigger'];
    case 'button': return ['button', 'press'];
    case 'input_button': return ['input_button', 'press'];
    case 'lock': return ['lock', s === 'locked' ? 'unlock' : 'lock'];
    case 'media_player': return ['media_player', 'media_play_pause'];
    case 'vacuum': return ['vacuum', s === 'cleaning' ? 'return_to_base' : 'start'];
    default: return null;
  }
}

// Un thermostat est actif dès qu'il n'est pas éteint, quel que soit son mode.
function isActive(stateObj) {
  if (!stateObj) return false;
  return stateObj.entity_id.startsWith('climate.') ? !['off', 'unavailable', 'unknown'].includes(stateObj.state) : ACTIVE_STATES.has(stateObj.state);
}

// ---- shared/graph.js ----
// Courbes d'historique : lissage et regroupement par tranches, communs aux cartes graphiques.

const GRAPH_BUCKETS = 60;

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
  const size = (end - start) / GRAPH_BUCKETS;
  const sums = new Array(GRAPH_BUCKETS).fill(0), counts = new Array(GRAPH_BUCKETS).fill(0);
  let before;
  for (const { t, v } of samples) {
    if (t < start) { before = v; continue; }
    const i = Math.min(GRAPH_BUCKETS - 1, Math.floor((t - start) / size));
    sums[i] += v; counts[i]++;
  }
  const out = [];
  let last = before;
  for (let i = 0; i < GRAPH_BUCKETS; i++) {
    if (counts[i]) last = sums[i] / counts[i];
    out.push(last);
  }
  return out;
}

// ---- shared/i18n.js ----
// Traductions : les textes sont écrits en anglais dans le code et traduits ici selon la langue de Home Assistant.
// Une langue absente de TRANSLATIONS affiche l'anglais. Pour en ajouter une : une table { 'texte anglais': 'traduction' }.

const FR = {
  "\"At home\" dot": "Pastille « à la maison »",
  "\"Turn off\" button": "Bouton « Éteindre »",
  "0 or empty: never closes automatically": "0 ou vide : pas de fermeture automatique",
  "A sensor value with its smoothed history curve in the background": "Valeur d’un capteur avec sa courbe d’historique lissée en fond",
  "Active when (template)": "Actif si (template)",
  "Alert below": "Alerte sous",
  "Alert below (value)": "Alerte sous (valeur)",
  "Alert colors when the value drops below this threshold (e.g. 15 for a battery)": "Couleurs d’alerte quand la valeur passe sous ce seuil (ex. 15 pour une batterie)",
  "App / source": "Application / source",
  "Appearance": "Apparence",
  "Artwork colors": "Couleurs de la pochette",
  "At home": "À la maison",
  "Auto close": "Fermeture automatique",
  "Automatic": "Automatique",
  "Away": "Hors de la maison",
  "Backdrop blur": "Flou du fond",
  "Battery": "Batterie",
  "Behavior": "Comportement",
  "Button group": "Groupe de boutons",
  "Card background": "Fond de carte",
  "Carousel": "Carrousel",
  "Chevron": "Flèche",
  "Chip on the right (text or template)": "Pastille à droite (texte ou template)",
  "Close": "Fermer",
  "Close when tapping outside": "Fermer en appuyant à côté",
  "Color": "Couleur",
  "Color (CSS or HA color)": "Couleur (CSS ou couleur HA)",
  "Color when active": "Couleur quand c’est actif",
  "Content (template)": "Contenu (template)",
  "Corner radius": "Arrondi",
  "Corners": "Coins",
  "CSS color (#3b82f6, var(--...)). Empty: theme colors": "Couleur CSS (#3b82f6, var(--...)). Vide : couleurs du thème",
  "CSS color, empty: green": "Couleur CSS, vide : vert",
  "Curve color": "Couleur de la courbe",
  "Curve height": "Hauteur de la courbe",
  "Curves height": "Hauteur des courbes",
  "Daily": "Jour par jour",
  "Displayed attribute": "Attribut affiché",
  "Double tap": "Double appui",
  "E.g. #living-room: open it with a \"Navigate\" action to #living-room. The popup's cards are edited in YAML (cards:)": "Ex. #salon : ouvrir avec une action « Naviguer » vers #salon. Les cartes de la popup se modifient en YAML (cards:)",
  "Empty: \"Good morning\" or \"Good evening\" followed by the first name": "Vide : « Bonjour » ou « Bonsoir » suivi du prénom",
  "Empty: action suited to the entity (turn on, run the scene, press…)": "Vide : action adaptée à l’entité (allumer, lancer la scène, appuyer…)",
  "Empty: based on the entity state. E.g. {{ is_state('vacuum.robot', 'cleaning') }}": "Vide : selon l’état de l’entité. Ex. {{ is_state('vacuum.robot', 'cleaning') }}",
  "Empty: disabled, a single tap stays instant": "Vide : désactivé, l’appui simple reste instantané",
  "Empty: everyone except you": "Vide : toutes les personnes sauf vous",
  "Empty: more-info dialog": "Vide : fenêtre de détails",
  "Empty: state color, like native badges": "Vide : couleur de l’état, comme les badges natifs",
  "Empty: theme primary color": "Vide : couleur primaire du thème",
  "Empty: turn the light on / off": "Vide : allumer / éteindre la lumière",
  "End time": "Heure de fin",
  "Ends at {time}": "Fin à {time}",
  "Ends {day} at {time}": "Fin {day} à {time}",
  "Entity": "Entité",
  "Feels like {temp}": "Ressenti {temp}",
  "For example \"Navigate\" to #living-room to open a popup. Empty: more-info dialog": "Par exemple « Naviguer » vers #salon pour ouvrir une popup. Vide : fenêtre de détails",
  "Forecast": "Prévisions",
  "Good afternoon, {name}!": "Bonjour {name} !",
  "Good evening, {name}!": "Bonsoir {name} !",
  "Good morning, {name}!": "Bonjour {name} !",
  "Header": "En-tête",
  "Hourly": "Heure par heure",
  "Humidity": "Humidité",
  "Icon": "Icône",
  "Icon when off": "Icône éteint",
  "Icon when on": "Icône allumé",
  "Label (two lines)": "Libellé (deux lignes)",
  "Large": "Grands",
  "Lawn color": "Couleur de la pelouse",
  "Leave empty so the icon follows the mode": "Laisser vide pour que l’icône suive le mode",
  "Light": "Lumière",
  "Living room": "Salon",
  "Loading the map…": "Chargement de la carte…",
  "Long press": "Appui long",
  "Lower the target": "Baisser la consigne",
  "Map camera": "Caméra de la carte",
  "Map unavailable": "Carte indisponible",
  "Material 3 badge: tonal chip, pill with a dot or two lines": "Badge Material 3 : chip tonal, pilule avec pastille ou deux lignes",
  "Material 3 brightness slider tinted with the light color": "Slider de luminosité Material 3 teinté avec la couleur de la lumière",
  "Material 3 button for any entity, with an action suited to the entity type": "Bouton Material 3 pour n’importe quelle entité, action adaptée au type d’entité",
  "Material 3 Expressive list: stacked rows with a switch, state or chevron on the right": "Liste Material 3 Expressive : lignes empilées avec interrupteur, état ou flèche à droite",
  "Material 3 greeting: \"Good morning\" with your avatar, and the other people in the house": "Accueil Material 3 : « Bonjour » avec votre avatar, et les autres personnes de la maison",
  "Material 3 media player: artwork, progress, controls, volume and artwork colors": "Lecteur multimédia Material 3 : pochette, progression, commandes, volume et couleurs de la pochette",
  "Material 3 popup opened by a #hash, holding any cards": "Popup Material 3 ouverte par un #hash, contenant n’importe quelles cartes",
  "Material 3 room: temperature, humidity, light color and heating": "Pièce Material 3 : température, humidité, couleur de la lumière et chauffage en cours",
  "Material 3 scene selector: button group, tiles or carousel, with the active scene highlighted": "Sélecteur de scènes Material 3 : groupe de boutons, tuiles ou carrousel, scène active mise en avant",
  "Material 3 thermostat with an adjustable target and instant feedback": "Thermostat Material 3 avec consigne réglable et affichage immédiat",
  "Material 3 weather: current conditions tinted by the weather, with an hourly or daily forecast": "Météo Material 3 : conditions actuelles teintées selon le temps et prévisions heure par heure ou jour par jour",
  "Max height": "Hauteur max.",
  "Medium": "Moyens",
  "Mode set by the on button (default: heat)": "Mode activé par le bouton Marche (par défaut : chauffage)",
  "Mode when turned on": "Mode au démarrage",
  "Mute": "Muet",
  "Name": "Nom",
  "Name and state": "Nom et état",
  "Name only": "Nom seulement",
  "Name, state and switch": "Nom, état et interrupteur",
  "Next": "Suivant",
  "None": "Aucune",
  "Not found": "Introuvable",
  "Nothing": "Rien",
  "Number of forecasts": "Nombre de prévisions",
  "Off": "Arrêt",
  "Offline": "Hors ligne",
  "On": "Marche",
  "On / off": "Allumé / éteint",
  "On the right": "À droite",
  "On the right, \"Automatic\": a switch for things that turn on, a chevron for navigation": "À droite, « Automatique » : interrupteur pour ce qui s’allume, flèche pour une navigation",
  "Open": "Ouvrir",
  "Opening hash": "Hash d’ouverture",
  "Optional: adds a button that turns this entity off; when it is off, no scene is active": "Facultatif : ajoute un bouton qui éteint cette entité ; éteinte, aucune scène n’est active",
  "Optional: its state is shown in a chip on the map": "Facultatif : son état s’affiche dans une pastille sur la carte",
  "Other people": "Autres personnes",
  "Otherwise: duration sensor (min, h or s)": "Sinon : capteur de durée (min, h ou s)",
  "Optional: estimated from the task start and the end time": "Facultatif : estimé depuis le début de la tâche et l’heure de fin",
  "Period": "Période",
  "Pill": "Pilule",
  "Play / pause": "Lecture / pause",
  "Player": "Lecteur",
  "Previous": "Précédent",
  "Progress": "Progression",
  "Progress (%)": "Progression (%)",
  "Raise the target": "Monter la consigne",
  "Repeat": "Répéter",
  "Replaces the state; icon, color and label also accept a template": "Remplace l’état ; icône, couleur et libellé acceptent aussi un template",
  "Robot map (Dreame mower...) redrawn in Material 3 colors, with its state": "Carte d’un robot (tondeuse Dreame...) redessinée aux couleurs Material 3, avec son état",
  "Rows": "Lignes",
  "Running": "En cours",
  "Scene": "Scène",
  "Scenes": "Scènes",
  "Sensor": "Capteur",
  "Sensors": "Capteurs",
  "Settings": "Réglages",
  "Several sensors on one graph (e.g. indoor / outdoor temperature), with an optional difference or min / max": "Plusieurs capteurs sur un même graphique (ex. température dedans / dehors), écart ou min / max en option",
  "Show the chevron": "Afficher le chevron",
  "Show the header": "Afficher l’en-tête",
  "Show the state": "Afficher l’état",
  "Shuffle": "Aléatoire",
  "Small": "Petits",
  "State": "État",
  "Step of the − / + buttons": "Pas des boutons − / +",
  "Subtitle (empty: entity state)": "Sous-titre (vide : état de l’entité)",
  "Subtitle when active": "Sous-titre quand c’est actif",
  "Subtitle when inactive": "Sous-titre quand c’est inactif",
  "Swipe distance": "Distance de glissement",
  "Switch": "Interrupteur",
  "Tap": "Appui",
  "Task in progress (3D print, washing machine...): percentage, progress bar, time left and end time": "Tâche en cours (impression 3D, lave-linge...) : pourcentage, barre de progression, temps restant et heure de fin",
  "Task state": "État de la tâche",
  "Temperature": "Température",
  "Text when off": "Texte éteint",
  "Text when on": "Texte allumé",
  "The background takes its color when it is on": "Le fond prend sa couleur quand elle est allumée",
  "The difference compares the first two sensors": "L’écart compare les deux premiers capteurs",
  "The icon becomes a flame while the heating is on; its temperature is used when no sensor is set": "L’icône devient une flamme quand le chauffage est en marche ; sa température sert si aucun capteur n’est choisi",
  "Tiles": "Tuiles",
  "Time left": "Temps restant",
  "Timestamp sensor: the time left is derived from it": "Capteur horodatage : le temps restant en est déduit",
  "Tint active rows": "Teinter les lignes actives",
  "Title": "Titre",
  "Tonal chip": "Chip tonal",
  "Turn off": "Éteindre",
  "Turn on / off": "Allumer / éteindre",
  "Two lines": "Deux lignes",
  "Unavailable": "Indisponible",
  "Weather": "Météo",
  "Weather not found": "Météo introuvable",
  "Width (desktop)": "Largeur (ordinateur)",
  "Width (mobile)": "Largeur (mobile)",
  "With min / max": "Avec min / max",
  "With the difference": "Avec l’écart",
  "{count} card": "{count} carte",
  "{count} cards": "{count} cartes",
  "{time} left": "Reste {time}",
};

const TRANSLATIONS = { fr: FR };

// Langue de l'utilisateur : celle de Home Assistant, sinon celle de la page ou du navigateur.
const langOf = (hass) => String(
  hass?.locale?.language || hass?.language || document.documentElement.lang || navigator.language || 'en',
).split('-')[0].toLowerCase();

// Texte traduit ; les {variables} sont remplacées par `vars`.
function t(hass, text, vars) {
  let out = TRANSLATIONS[langOf(hass)]?.[text] ?? text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, value);
  return out;
}

// ---- shared/template.js ----
// Templates Jinja rendus par Home Assistant et mis à jour en direct (abonnement render_template).
const isTemplate = (v) => typeof v === 'string' && /\{[{%]/.test(v);

// Renvoie la promesse de la fonction de désabonnement ; `callback` reçoit le résultat à chaque changement.
function subscribeTemplate(hass, template, variables, callback) {
  return hass.connection.subscribeMessage(
    (msg) => { if ('result' in msg) callback(String(msg.result ?? '').trim()); },
    { type: 'render_template', template, variables, strict: false },
  ).catch(() => null);
}

const unsubscribeAll = (unsubs) => {
  for (const unsub of unsubs ?? []) unsub.then((fn) => fn?.()).catch(() => {});
};

// Résultat d'un template interprété comme un booléen (« True », « on », « 1 »...).
const isTruthy = (v) => v === true || ['true', 'on', 'yes', '1'].includes(String(v).trim().toLowerCase());

// ---- shared/typography.js ----
// Typographie commune aux cartes : titre (nom de l'entité) et état / sous-titre.
const TITLE_FONT = 'font-size: 15px; font-weight: 550;';
const STATE_FONT = 'font-size: 13px; font-weight: 500; opacity: 0.8;';

// ---- m3-badge.js ----
{
// m3-badge — badge Material 3 pour le haut des vues : icône, valeur et couleur, en trois styles
// (chip tonal, pilule avec pastille, deux lignes). Contenu, icône et couleur acceptent les templates.
const SURFACE_HIGH = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';

const STYLE = `
:host { display: inline-block; --m3-color: var(--md-sys-color-primary, var(--primary-color)); }
.badge {
  display: flex; align-items: center; box-sizing: border-box; max-width: 100%;
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, transform 120ms ease;
}
.badge:active { transform: scale(0.96); }
.dot { flex: none; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 300ms ease, color 300ms ease; }
.text { min-width: 0; display: flex; flex-direction: column; }
.value, .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label { display: none; }

/* Chip tonal : l'« assist chip » de Material 3, fond teinté de la couleur du badge. */
:host([variant='chip']) .badge {
  height: 32px; gap: 8px; padding: 0 12px 0 8px; border-radius: 8px;
  background: color-mix(in srgb, var(--m3-color) 18%, ${SURFACE_HIGH});
}
:host([variant='chip']) .dot { color: var(--m3-color); --mdc-icon-size: 18px; }
:host([variant='chip']) .value { font-size: 13px; font-weight: 500; }

/* Pilule : l'icône dans une pastille pleine de la couleur du badge. */
:host([variant='pill']) .badge {
  height: 40px; gap: 10px; padding: 0 16px 0 6px; border-radius: 20px; background: ${SURFACE_HIGH};
}
:host([variant='pill']) .dot { width: 28px; height: 28px; background: var(--m3-color); color: #fff; --mdc-icon-size: 16px; }
:host([variant='pill']) .value { font-size: 14px; font-weight: 550; }

/* Deux lignes : valeur et libellé, même typographie que les cartes. */
:host([variant='two-line']) .badge {
  height: 52px; gap: 10px; padding: 0 18px 0 8px; border-radius: 26px; background: ${SURFACE_HIGH};
}
:host([variant='two-line']) .dot {
  width: 36px; height: 36px; color: var(--m3-color); --mdc-icon-size: 20px;
  background: color-mix(in srgb, var(--m3-color) 20%, transparent);
}
:host([variant='two-line']) .value { ${TITLE_FONT} line-height: 1.2; }
:host([variant='two-line']) .label { display: block; ${STATE_FONT} line-height: 1.2; }
`;

const VARIANTS = ['chip', 'pill', 'two-line'];
// Clés acceptant un template Jinja (rendu par Home Assistant, mis à jour en direct).
const TEMPLATE_KEYS = ['content', 'icon', 'color', 'label'];

class M3BadgeEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', selector: { entity: {} } },
    {
      name: 'variant', selector: {
        select: {
          mode: 'box', options: [
            { value: 'chip', label: 'Tonal chip' },
            { value: 'pill', label: 'Pill' },
            { value: 'two-line', label: 'Two lines' },
          ],
        },
      },
    },
    {
      type: 'grid', name: '', schema: [
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        { name: 'color', selector: { ui_color: { include_state: true } } },
        { name: 'label', selector: { text: {} } },
        { name: 'attribute', selector: { attribute: {} }, context: { filter_entity: 'entity' } },
      ],
    },
    { name: 'content', selector: { template: {} } },
    { name: 'tap_action', selector: { ui_action: {} } },
  ];

  static labels = {
    entity: 'Entity', variant: 'Style', icon: 'Icon', color: 'Color', label: 'Label (two lines)',
    attribute: 'Displayed attribute', content: 'Content (template)', tap_action: 'Tap',
  };

  static helpers = {
    color: 'Empty: state color, like native badges',
    content: 'Replaces the state; icon, color and label also accept a template',
    tap_action: 'Empty: more-info dialog',
  };
}

class M3Badge extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-badge-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    return { entity: entities.find((e) => e.startsWith('light.')) ?? entities[0], variant: 'pill' };
  }

  setConfig(config) {
    if (!config) throw new Error('m3-badge: invalid configuration');
    if (config.variant && !VARIANTS.includes(config.variant)) {
      throw new Error(`m3-badge: "variant" must be one of ${VARIANTS.join(', ')}`);
    }
    this._config = { variant: 'chip', ...config };
    this._tpl = {};
    this.setAttribute('variant', this._config.variant);
    if (!this.shadowRoot) this._build();
    this._resubscribe();
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._resubscribe();
    const stateObj = this._config.entity ? hass.states[this._config.entity] : undefined;
    if (!first && stateObj === this._stateObj) return;
    this._stateObj = stateObj;
    this._render();
  }

  connectedCallback() { this._resubscribe(); }

  disconnectedCallback() { this._unsubscribe(); }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="badge" role="button" tabindex="0">
        <div class="dot"><ha-state-icon></ha-state-icon></div>
        <div class="text"><span class="value"></span><span class="label"></span></div>
      </div>`;
    this._els = {
      badge: root.querySelector('.badge'),
      icon: root.querySelector('ha-state-icon'),
      value: root.querySelector('.value'),
      label: root.querySelector('.label'),
    };
    this._els.badge.addEventListener('click', () => this._tap());
    this._els.badge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this._tap(); });
  }

  // Un abonnement render_template par clé templatée ; HA renvoie le résultat à chaque changement.
  _resubscribe() {
    this._unsubscribe();
    if (!this._hass?.connection || !this._config || !this.isConnected) return;
    const variables = { config: this._config, user: this._hass.user?.name, entity: this._config.entity };
    this._unsubs = TEMPLATE_KEYS.filter((key) => isTemplate(this._config[key])).map((key) =>
      subscribeTemplate(this._hass, this._config[key], variables, (result) => {
        this._tpl[key] = result;
        this._render();
      }));
  }

  _unsubscribe() {
    unsubscribeAll(this._unsubs);
    this._unsubs = [];
  }

  // Valeur d'une clé : résultat du template si c'en est un, sinon la valeur brute.
  _get(key) {
    const v = this._config[key];
    return isTemplate(v) ? this._tpl[key] : v;
  }

  _render() {
    if (!this._els || !this._config) return;
    const c = this._config;
    const s = this._stateObj;
    const hass = this._hass;

    let value = this._get('content');
    if (value == null && !isTemplate(c.content)) {
      if (!s) value = c.entity ? t(this._hass, 'Not found') : '';
      else if (c.attribute) value = hass?.formatEntityAttributeValue?.(s, c.attribute) ?? s.attributes[c.attribute];
      else value = hass?.formatEntityState?.(s) ?? s.state;
    }
    this._els.value.textContent = value ?? '';
    this._els.label.textContent = this._get('label') ?? s?.attributes.friendly_name ?? '';

    const icon = this._get('icon');
    Object.assign(this._els.icon, { hass, stateObj: s, icon: icon || undefined });

    let color = this._get('color');
    if (!color || color === 'state') {
      const [domain] = (c.entity ?? '').split('.');
      color = isActive(s)
        ? `var(--state-${domain}-${s.state}-color, var(--state-${domain}-active-color, var(--state-active-color)))`
        : 'var(--state-inactive-color, var(--disabled-color))';
    }
    this.style.setProperty('--m3-color', cssColor(color));
  }

  _tap() {
    const c = this._config;
    this.dispatchEvent(new CustomEvent('haptic', { detail: 'light', bubbles: true, composed: true }));
    if (c.tap_action) {
      this.dispatchEvent(new CustomEvent('hass-action', {
        detail: { config: { entity: c.entity, tap_action: c.tap_action }, action: 'tap' }, bubbles: true, composed: true,
      }));
    } else if (c.entity) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: c.entity }, bubbles: true, composed: true }));
    }
  }
}

defineEditor('m3-badge-editor', M3BadgeEditor);

if (!customElements.get('m3-badge')) {
  customElements.define('m3-badge', M3Badge);
  window.customBadges = window.customBadges || [];
  window.customBadges.push({
    type: 'm3-badge',
    name: 'M3 Badge',
    description: t(null, 'Material 3 badge: tonal chip, pill with a dot or two lines'),
    preview: true,
  });
}
}

// ---- m3-button-card.js ----
{
// m3-button-card — bouton Material 3 pour n'importe quelle entité : icône, nom, état,
// action par défaut adaptée au domaine (allumer, lancer une scène, appuyer...) et teinte quand c'est actif.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; align-items: center; gap: 14px; padding: 0 20px;
  cursor: pointer; touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, color 300ms ease, transform 120ms ease;
}
ha-card:active { transform: scale(0.98); }
.icon { flex: none; display: flex; color: var(--m3-icon-fg); transition: color 300ms ease; }
.icon > * { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
:host([no-state]) .state { display: none; }
.badge { flex: none; --mdc-icon-size: 20px; }
/* Pastille à droite (numéro d'ordre, compteur...) : inversée par rapport à la carte. */
.chip {
  flex: none; min-width: 28px; height: 28px; box-sizing: border-box; padding: 0 8px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  background: var(--m3-fg); color: var(--m3-chip-fg, var(--md-sys-color-surface, #fff)); font-size: 13px; font-weight: 700;
}
.chip:empty { display: none; }
:host(:not([offline])) .badge { display: none; }
:host([offline]) ha-card { opacity: 0.6; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;
// Délai pour attendre un second appui, seulement si un double appui est configuré.
const DOUBLE_TAP_MS = 250;

class M3ButtonCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: {} } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
      ],
    },
    {
      type: 'expandable', name: '', title: 'On / off', icon: 'mdi:toggle-switch-outline', schema: [
        {
          type: 'grid', name: '', schema: [
            { name: 'icon_on', selector: { icon: {} }, context: { icon_entity: 'entity' } },
            { name: 'icon_off', selector: { icon: {} }, context: { icon_entity: 'entity' } },
            { name: 'text_on', selector: { text: {} } },
            { name: 'text_off', selector: { text: {} } },
          ],
        },
        { name: 'show_state', selector: { boolean: {} } },
        { name: 'color', selector: { ui_color: {} } },
        { name: 'active', selector: { template: {} } },
        { name: 'chip', selector: { template: {} } },
      ],
    },
    {
      type: 'expandable', name: '', title: 'Actions', icon: 'mdi:gesture-tap', schema: [
        { name: 'tap_action', selector: { ui_action: {} } },
        { name: 'hold_action', selector: { ui_action: {} } },
        { name: 'double_tap_action', selector: { ui_action: {} } },
      ],
    },
  ];

  static labels = {
    entity: 'Entity', name: 'Name', icon: 'Icon', icon_on: 'Icon when on', icon_off: 'Icon when off',
    text_on: 'Text when on', text_off: 'Text when off', show_state: 'Show the state',
    tap_action: 'Tap', hold_action: 'Long press', double_tap_action: 'Double tap',
    color: 'Color when active', active: 'Active when (template)', chip: 'Chip on the right (text or template)',
  };

  static helpers = {
    tap_action: 'Empty: action suited to the entity (turn on, run the scene, press…)',
    hold_action: 'Empty: more-info dialog',
    double_tap_action: 'Empty: disabled, a single tap stays instant',
    color: 'Empty: theme primary color',
    active: 'Empty: based on the entity state. E.g. {{ is_state(\'vacuum.robot\', \'cleaning\') }}',
  };
}

class M3ButtonCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-button-card-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    return { entity: entities.find((e) => e.startsWith('light.')) ?? entities.find((e) => e.startsWith('switch.')) ?? entities[0] };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-button-card: "entity" is required');
    this._config = { show_state: true, ...config };
    this._tpl = {};
    if (!this.shadowRoot) this._build();
    this._resubscribe();
    if (this._hass) this._render();
  }

  connectedCallback() { this._resubscribe(); }

  disconnectedCallback() { unsubscribeAll(this._unsubs); this._unsubs = []; }

  // `active` et `chip` peuvent être des templates : Home Assistant renvoie leur résultat à chaque changement.
  _resubscribe() {
    unsubscribeAll(this._unsubs);
    this._unsubs = [];
    const c = this._config;
    if (!this._hass?.connection || !c || !this.isConnected) return;
    const variables = { config: c, user: this._hass.user?.name, entity: c.entity };
    this._unsubs = ['active', 'chip'].filter((key) => isTemplate(c[key])).map((key) =>
      subscribeTemplate(this._hass, c[key], variables, (result) => {
        this._tpl[key] = result;
        this._render();
      }));
  }

  getCardSize() { return 2; }

  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 }; }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._resubscribe();
    const stateObj = hass.states[this._config.entity];
    if (stateObj === this._stateObj) return;
    this._stateObj = stateObj;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="icon"><ha-state-icon></ha-state-icon></div>
        <div class="text"><div class="name"></div><div class="state"></div></div>
        <span class="chip"></span>
        <ha-icon class="badge" icon="mdi:alert-circle-outline" title="${t(this._hass, 'Offline')}"></ha-icon>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      icon: root.querySelector('ha-state-icon'),
      name: root.querySelector('.name'),
      state: root.querySelector('.state'),
      chip: root.querySelector('.chip'),
    };
    this._card.addEventListener('pointerdown', (e) => this._onDown(e));
    this._card.addEventListener('pointerup', () => this._onUp());
    this._card.addEventListener('pointerleave', () => this._cancel());
    this._card.addEventListener('pointercancel', () => this._cancel());
    this._card.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _render() {
    if (!this._card) return;
    const c = this._config;
    const s = this._stateObj;
    const offline = !s || s.state === 'unavailable' || s.state === 'unknown';
    // `active` : template, booléen, ou à défaut l'état de l'entité.
    const forced = isTemplate(c.active) ? isTruthy(this._tpl.active) : c.active != null ? isTruthy(c.active) : null;
    const active = !offline && (forced ?? isActive(s));

    this.toggleAttribute('offline', offline);
    const text = this._stateText(s, active, offline);
    this.toggleAttribute('no-state', c.show_state === false || !text);
    this._els.name.textContent = c.name ?? s?.attributes.friendly_name ?? c.entity;
    Object.assign(this._els.icon, {
      hass: this._hass,
      stateObj: s,
      icon: (active ? c.icon_on : c.icon_off) ?? c.icon,
    });
    this._els.state.textContent = text ?? '';
    this._els.chip.textContent = (isTemplate(c.chip) ? this._tpl.chip : c.chip) ?? '';

    const st = this._card.style;
    if (active && c.color) {
      // Couleur choisie : ton pastel, texte sombre.
      st.setProperty('--m3-bg', `color-mix(in srgb, ${cssColor(c.color)} 62%, white)`);
      st.setProperty('--m3-fg', '#1c1b1f');
      st.setProperty('--m3-icon-fg', '#1c1b1f');
      st.setProperty('--m3-chip-fg', '#ffffff');
      return;
    }
    st.setProperty('--m3-bg', active ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', active ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-icon-fg', active ? 'var(--md-sys-color-primary, var(--primary-color))' : ON_SURFACE);
  }

  _stateText(s, active, offline) {
    if (offline) return t(this._hass, 'Offline');
    const c = this._config;
    if (active && c.text_on) return c.text_on;
    if (!active && c.text_off) return c.text_off;
    const format = (obj, attr) => this._hass?.formatEntityAttributeValue?.(obj, attr) ?? obj.attributes[attr];
    const state = this._hass?.formatEntityState?.(s) ?? s.state;
    const [domain] = s.entity_id.split('.');
    // L'état d'une scène ou d'un bouton est la date du dernier déclenchement : rien à afficher.
    if (['scene', 'button', 'input_button'].includes(domain)) return null;
    if (domain === 'script') return s.state === 'on' ? t(this._hass, 'Running') : null;
    if (domain === 'climate' && s.attributes.current_temperature != null) {
      return `${state} • ${format(s, 'current_temperature')}`;
    }
    if (domain === 'light' && active && s.attributes.brightness != null) {
      return `${state} • ${Math.round((s.attributes.brightness / 255) * 100)} %`;
    }
    if (domain === 'media_player' && active && s.attributes.media_title) {
      return [s.attributes.media_title, s.attributes.media_artist].filter(Boolean).join(' • ');
    }
    return state;
  }

  _onDown(e) {
    if (e.button !== 0) return;
    this._down = true;
    this._held = false;
    this._holdTimer = setTimeout(() => {
      this._held = true;
      this._run('hold');
    }, HOLD_MS);
  }

  _onUp() {
    clearTimeout(this._holdTimer);
    if (this._down && !this._held) this._tap();
    this._down = false;
  }

  // Sans double appui configuré, l'appui part tout de suite ; sinon on attend un éventuel second appui.
  _tap() {
    if (!this._config.double_tap_action) {
      this._run('tap');
    } else if (this._tapTimer) {
      clearTimeout(this._tapTimer);
      this._tapTimer = null;
      this._run('double_tap');
    } else {
      this._tapTimer = setTimeout(() => {
        this._tapTimer = null;
        this._run('tap');
      }, DOUBLE_TAP_MS);
    }
  }

  // Glissement hors de la carte ou défilement : ni appui ni appui long.
  _cancel() {
    clearTimeout(this._holdTimer);
    this._down = false;
  }

  // Action configurée → gestion native de HA (hass-action) ; sinon action par défaut du domaine.
  _run(kind) {
    const c = this._config;
    const configured = c[`${kind}_action`];
    this._fire('haptic', kind === 'hold' ? 'medium' : 'light');
    if (configured) {
      this._fire('hass-action', { config: { entity: c.entity, [`${kind}_action`]: configured }, action: kind });
      return;
    }
    const offline = this.hasAttribute('offline');
    const service = kind === 'tap' && !offline && this._stateObj ? defaultTapService(this._stateObj) : null;
    if (service) {
      this._hass.callService(service[0], service[1], { entity_id: c.entity });
    } else {
      this._fire('hass-more-info', { entityId: c.entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-button-card-editor', M3ButtonCardEditor);

if (!customElements.get('m3-button-card')) {
  customElements.define('m3-button-card', M3ButtonCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-button-card',
    name: 'M3 Button',
    description: t(null, 'Material 3 button for any entity, with an action suited to the entity type'),
    preview: true,
  });
}
}

// ---- m3-graph-card.js ----
{
// m3-graph-card — carte capteur Material 3 : valeur actuelle avec une courbe d'historique lissée
// dessinée en fond, couleurs d'alerte sous un seuil (batterie faible...).
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
  /* Centrage par la carte : fonctionne en grille (hauteur imposée) comme en popup (hauteur libre). */
  display: flex; align-items: center;
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
  width: 100%; padding: 0 20px; box-sizing: border-box;
}
.icon { flex: none; display: flex; color: var(--m3-icon-fg, inherit); }
.icon ha-state-icon { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.value { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chevron { --mdc-icon-size: 22px; flex: none; opacity: 0.9; }
:host(:not([chevron])) .chevron { display: none; }
:host([unavailable]) ha-card { opacity: 0.5; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const REFRESH_MS = 5 * 60 * 1000;

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
    entity: 'Entity', name: 'Name', icon: 'Icon', hours_to_show: 'Period',
    graph_height: 'Curve height', color: 'Curve color',
    alert_below: 'Alert below', show_chevron: 'Show the chevron',
  };

  static helpers = {
    color: 'CSS color (#3b82f6, var(--...)). Empty: theme colors',
    alert_below: 'Alert colors when the value drops below this threshold (e.g. 15 for a battery)',
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
    if (!config || !config.entity) throw new Error('m3-graph-card: "entity" is required');
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
    const points = defined.map((v, i) => [((first + i) / (GRAPH_BUCKETS - 1)) * 100, y(v)]);
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
      ? t(this._hass, 'Unavailable')
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
    description: t(null, 'A sensor value with its smoothed history curve in the background'),
    preview: true,
  });
}
}

// ---- m3-light-slider-card.js ----
{
// m3-light-slider-card — carte lumière Material 3 : toute la carte est un slider,
// teintée avec la couleur actuelle de la lumière.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 100px; box-sizing: border-box;
  /* Centrage par la carte : fonctionne en grille (hauteur imposée) comme en popup (hauteur libre). */
  display: flex; align-items: center;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  touch-action: pan-y; user-select: none; -webkit-user-select: none; cursor: pointer;
  transition: background 300ms ease, color 300ms ease;
}
.fill {
  position: absolute; top: 0; bottom: 0; left: 0; width: var(--m3-pct, 0%);
  background: var(--m3-fill); transition: width 200ms ease, background 300ms ease;
}
:host([dragging]) .fill { transition: background 300ms ease; }
.content {
  position: relative; display: flex; align-items: center; gap: 14px;
  width: 100%; padding: 0 20px; box-sizing: border-box;
}
.icon { flex: none; display: flex; color: var(--m3-icon-fg); transition: color 300ms ease; }
.icon ha-icon { --mdc-icon-size: 24px; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} }
.pct { color: var(--m3-pct-fg); transition: color 300ms ease; font-size: 1.5rem; font-weight: 400; font-variant-numeric: tabular-nums; }
:host([unavailable]) ha-card { opacity: 0.5; cursor: default; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const SEND_INTERVAL = 300;
const PASTEL = 0.45;
const PENDING_TTL = 5000;

class M3LightSliderCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { filter: { domain: 'light' } } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
      ],
    },
  ];

  static labels = { entity: 'Entity', name: 'Name', icon: 'Icon' };
}

class M3LightSliderCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-light-slider-card-editor');
  }


  setConfig(config) {
    if (!config || !config.entity || !config.entity.startsWith('light.')) {
      throw new Error('m3-light-slider-card: "entity" must be a light.* entity');
    }
    this._config = config;
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('light.')) || 'light.example' };
  }

  getCardSize() { return 2; }

  // Hauteur auto : la carte fait 100 px (entre 1 rangée de 56 px et 2 rangées de 120 px).
  getGridOptions() { return { columns: 12, rows: 'auto', min_rows: 1 }; }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (stateObj === this._stateObj) return;
    this._stateObj = stateObj;
    if (!this._dragging) this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="fill"></div>
        <div class="content">
          <div class="icon"><ha-icon></ha-icon></div>
          <div class="text"><div class="name"></div><div class="state"></div></div>
          <div class="pct"></div>
        </div>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      icon: root.querySelector('ha-icon'),
      name: root.querySelector('.name'),
      state: root.querySelector('.state'),
      pct: root.querySelector('.pct'),
    };
    this._card.addEventListener('pointerdown', (e) => this._onDown(e));
    this._card.addEventListener('pointermove', (e) => this._onMove(e));
    this._card.addEventListener('pointerup', (e) => this._onUp(e));
    this._card.addEventListener('pointercancel', () => this._reset());
    this._card.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // État réel de la lumière, remplacé par la valeur en attente tant que HA n'a pas confirmé.
  _effective() {
    const s = this._stateObj;
    const realOn = s?.state === 'on';
    const realPct = realOn ? Math.round(((s.attributes.brightness ?? 255) / 255) * 100) : 0;
    const p = this._pending;
    if (p) {
      const confirmed = p.on === realOn && (!p.on || p.anyPct || Math.abs(p.pct - realPct) <= 1);
      if (confirmed || Date.now() > p.until) this._pending = null;
      else return { on: p.on, pct: p.pct };
    }
    return { on: realOn, pct: realPct };
  }

  _render() {
    const s = this._stateObj;
    if (!s || !this._card) return;
    const unavailable = s.state === 'unavailable' || s.state === 'unknown';
    this.toggleAttribute('unavailable', unavailable);
    const { on, pct } = this._effective();
    const a = s.attributes;

    this._els.name.textContent = this._config.name ?? a.friendly_name ?? this._config.entity;
    this._els.icon.icon = this._config.icon ?? a.icon ?? (on ? 'mdi:lightbulb' : 'mdi:lightbulb-outline');
    this._els.state.textContent = unavailable ? t(this._hass, 'Unavailable') : (this._hass.formatEntityState?.(s) ?? t(this._hass, on ? 'On' : 'Off'));
    this._els.pct.textContent = on ? `${pct} %` : '';

    const st = this._card.style;
    if (on) {
      // Ton pastel : la couleur de la lumière mélangée à 45 % de blanc.
      const [r, g, b] = (a.rgb_color ?? [255, 183, 77]).map((c) => Math.round(c + (255 - c) * PASTEL));
      const lightFill = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
      const overFill = pct >= 45;
      st.setProperty('--m3-fill', `rgb(${r}, ${g}, ${b})`);
      st.setProperty('--m3-bg', `linear-gradient(rgba(${r}, ${g}, ${b}, 0.22), rgba(${r}, ${g}, ${b}, 0.22)), ${SURFACE}`);
      st.setProperty('--m3-pct', `${Math.max(pct, 4)}%`);
      const onFill = lightFill ? '#1c1b1f' : '#ffffff';
      st.setProperty('--m3-fg', overFill ? onFill : ON_SURFACE);
      // Le pourcentage est collé au bord droit : il n'est sur la partie remplie qu'au-delà de ~85 %.
      st.setProperty('--m3-pct-fg', pct >= 85 ? onFill : ON_SURFACE);
      // Sans fond, l'icône (à gauche) est sur la partie remplie dès ~12 % : même contraste que le texte.
      st.setProperty('--m3-icon-fg', pct >= 12 ? onFill : ON_SURFACE);
    } else {
      st.setProperty('--m3-fill', 'transparent');
      st.setProperty('--m3-bg', SURFACE);
      st.setProperty('--m3-pct', '0%');
      st.setProperty('--m3-fg', ON_SURFACE);
      st.setProperty('--m3-pct-fg', ON_SURFACE);
      st.setProperty('--m3-icon-fg', ON_SURFACE);
    }
  }

  _onDown(e) {
    if (e.button !== 0 || this.hasAttribute('unavailable')) return;
    this._down = {
      x: e.clientX, y: e.clientY, id: e.pointerId,
      pct: this._effective().pct, width: this._card.getBoundingClientRect().width,
    };
    this._holdTimer = setTimeout(() => {
      if (!this._down || this._dragging) return;
      this._reset();
      this._fire('hass-more-info', { entityId: this._config.entity });
    }, 500);
  }

  _onMove(e) {
    const d = this._down;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!this._dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return this._reset();
      if (Math.abs(dx) < 6) return;
      this._dragging = true;
      clearTimeout(this._holdTimer);
      this._card.setPointerCapture(d.id);
      this.setAttribute('dragging', '');
    }
    const pct = Math.max(1, Math.min(100, Math.round(d.pct + (dx / d.width) * 100)));
    this._setPending(true, pct);
    this._throttledSend(pct);
  }

  _onUp() {
    clearTimeout(this._holdTimer);
    if (!this._down) return;
    if (this._dragging) {
      clearTimeout(this._sendTimer);
      this._sendTimer = null;
      this._send(this._pending?.pct ?? this._effective().pct);
    } else {
      const { on, pct } = this._effective();
      this._setPending(!on, on ? 0 : pct || 100, true);
      this._fire('haptic', 'light');
      this._hass.callService('light', 'toggle', { entity_id: this._config.entity });
    }
    this._reset();
  }

  _reset() {
    clearTimeout(this._holdTimer);
    this._down = null;
    this._dragging = false;
    this.removeAttribute('dragging');
  }

  _setPending(on, pct, anyPct = false) {
    this._pending = { on, pct, anyPct, until: Date.now() + PENDING_TTL };
    this._render();
  }

  // Pendant le glissement, au plus un appel toutes les 300 ms ; la valeur finale part au relâchement.
  _throttledSend(pct) {
    this._lastPct = pct;
    if (this._sendTimer) return;
    this._send(pct);
    this._sendTimer = setTimeout(() => {
      this._sendTimer = null;
      if (this._dragging && this._lastPct !== pct) this._throttledSend(this._lastPct);
    }, SEND_INTERVAL);
  }

  _send(pct) {
    this._hass.callService('light', 'turn_on', { entity_id: this._config.entity, brightness_pct: pct });
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-light-slider-card-editor', M3LightSliderCardEditor);

if (!customElements.get('m3-light-slider-card')) {
  customElements.define('m3-light-slider-card', M3LightSliderCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-light-slider-card',
    name: 'M3 Light Slider',
    description: t(null, 'Material 3 brightness slider tinted with the light color'),
    preview: true,
  });
}
}

// ---- m3-list-card.js ----
{
// m3-list-card — liste Material 3 Expressive : des lignes empilées (icône, titre, sous-titre, élément à droite)
// qui forment un bloc aux grands coins arrondis, comme les réglages Android. Une ligne active se teinte.
const STYLE = `
:host { display: block; }
ha-card { background: none; border: none; box-shadow: none; }
.title { ${TITLE_FONT} padding: 4px 4px 10px; color: var(--md-sys-color-on-surface, var(--primary-text-color)); }
:host(:not([titled])) .title { display: none; }
.rows { display: flex; flex-direction: column; gap: 2px; }
.row {
  display: flex; align-items: center; gap: 16px; min-height: 64px; box-sizing: border-box; padding: 10px 16px 10px 20px;
  border-radius: 4px; background: var(--m3-bg); color: var(--m3-fg);
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, color 300ms ease, border-radius 200ms ease;
}
.row:first-child { border-top-left-radius: var(--m3-radius); border-top-right-radius: var(--m3-radius); }
.row:last-child { border-bottom-left-radius: var(--m3-radius); border-bottom-right-radius: var(--m3-radius); }
.row:active { border-radius: calc(var(--m3-radius) / 2); }
.icon { flex: none; display: flex; color: var(--m3-icon-fg); --mdc-icon-size: 24px; transition: color 300ms ease; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label:empty { display: none; }
.trailing { flex: none; display: flex; align-items: center; }
.state { ${STATE_FONT} }
.chevron { --mdc-icon-size: 24px; opacity: 0.7; }
.row[offline] { opacity: 0.6; }

/* Interrupteur Material 3 : rail 52 × 32, pastille qui grossit quand il est activé. */
.switch {
  position: relative; width: 52px; height: 32px; box-sizing: border-box; border-radius: 16px;
  border: 2px solid var(--md-sys-color-outline, var(--secondary-text-color));
  background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.2));
  transition: background 200ms ease, border-color 200ms ease;
}
.switch::after {
  content: ''; position: absolute; top: 50%; left: 6px; width: 16px; height: 16px; border-radius: 50%;
  transform: translateY(-50%); background: var(--md-sys-color-outline, var(--secondary-text-color));
  transition: all 200ms cubic-bezier(0.2, 0, 0, 1);
}
.switch[on] { background: var(--md-sys-color-primary, var(--primary-color)); border-color: transparent; }
.switch[on]::after { left: 22px; width: 24px; height: 24px; background: var(--md-sys-color-on-primary, #fff); }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;
const RADIUS = { small: 12, medium: 20, large: 28 };
const TRAILING = ['auto', 'state', 'switch', 'chevron', 'none'];

class M3ListCardEditor extends M3CardEditor {
  static schema = [
    {
      type: 'grid', name: '', schema: [
        { name: 'title', selector: { text: {} } },
        {
          name: 'radius', selector: {
            select: { mode: 'dropdown', options: [
              { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' },
            ] },
          },
        },
      ],
    },
    { name: 'dynamic', selector: { boolean: {} } },
    {
      name: 'rows', selector: {
        object: {
          multiple: true, label_field: 'name', description_field: 'entity',
          fields: {
            entity: { label: 'Entity', selector: { entity: {} } },
            name: { label: 'Name', selector: { text: {} } },
            label: { label: 'Subtitle (empty: entity state)', selector: { text: {} } },
            label_on: { label: 'Subtitle when active', selector: { text: {} } },
            label_off: { label: 'Subtitle when inactive', selector: { text: {} } },
            alert_below: { label: 'Alert below (value)', selector: { number: { mode: 'box', step: 'any' } } },
            icon: { label: 'Icon', selector: { icon: {} } },
            trailing: {
              label: 'On the right', selector: {
                select: { mode: 'dropdown', options: [
                  { value: 'auto', label: 'Automatic' }, { value: 'switch', label: 'Switch' },
                  { value: 'state', label: 'State' }, { value: 'chevron', label: 'Chevron' }, { value: 'none', label: 'Nothing' },
                ] },
              },
            },
            tap_action: { label: 'Tap', selector: { ui_action: {} } },
            hold_action: { label: 'Long press', selector: { ui_action: {} } },
          },
        },
      },
    },
  ];

  static labels = { title: 'Title', radius: 'Corners', dynamic: 'Tint active rows', rows: 'Rows' };

  static helpers = {
    rows: 'On the right, "Automatic": a switch for things that turn on, a chevron for navigation',
  };
}

class M3ListCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-list-card-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    const pick = (domain) => entities.find((e) => e.startsWith(`${domain}.`));
    return {
      title: t(hass, 'Settings'),
      rows: [pick('light'), pick('switch'), pick('scene')].filter(Boolean).map((entity) => ({ entity })),
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rows) || !config.rows.length) {
      throw new Error('m3-list-card: "rows" must contain at least one row');
    }
    for (const row of config.rows) {
      if (!row.entity && !row.name) throw new Error('m3-list-card: every row needs an "entity" or a "name"');
      if (row.trailing && !TRAILING.includes(row.trailing)) {
        throw new Error(`m3-list-card: "trailing" must be one of ${TRAILING.join(', ')}`);
      }
    }
    this._config = { dynamic: true, radius: 'large', ...config };
    this._build();
    if (this._hass) this._render();
  }

  getCardSize() { return this._config.rows.length + (this._config.title ? 1 : 0); }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    const watched = this._config.rows.map((row) => row.entity && hass.states[row.entity]);
    if (this._watched && watched.every((s, i) => s === this._watched[i])) return;
    this._watched = watched;
    this._render();
  }

  // La structure dépend du nombre de lignes : reconstruite à chaque setConfig.
  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const c = this._config;
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card><div class="title"></div><div class="rows"></div></ha-card>`;
    root.querySelector('.title').textContent = c.title ?? '';
    this.toggleAttribute('titled', !!c.title);
    this.style.setProperty('--m3-radius', `${RADIUS[c.radius] ?? (Number(c.radius) || RADIUS.large)}px`);
    const list = root.querySelector('.rows');
    this._rows = c.rows.map((row) => {
      const el = document.createElement('div');
      el.className = 'row';
      el.innerHTML = `<div class="icon"><ha-state-icon></ha-state-icon></div>
        <div class="text"><div class="name"></div><div class="label"></div></div>
        <div class="trailing"></div>`;
      list.appendChild(el);
      const r = {
        row, el,
        icon: el.querySelector('ha-state-icon'),
        name: el.querySelector('.name'),
        label: el.querySelector('.label'),
        trailing: el.querySelector('.trailing'),
      };
      this._bindPress(r);
      return r;
    });
    this._watched = null;
  }

  _render() {
    if (!this._rows || !this._hass) return;
    for (const r of this._rows) this._renderRow(r);
  }

  _renderRow(r) {
    const { row } = r;
    const s = row.entity ? this._hass.states[row.entity] : undefined;
    const offline = !!row.entity && (!s || ['unavailable', 'unknown'].includes(s.state));
    const active = !offline && isActive(s);
    const trailing = this._trailing(row, s);

    r.el.toggleAttribute('offline', offline);
    r.name.textContent = row.name ?? s?.attributes.friendly_name ?? row.entity;
    Object.assign(r.icon, { hass: this._hass, stateObj: s, icon: row.icon });
    // Sous-titre : celui de la config, sinon l'état (sauf s'il est déjà affiché à droite).
    const custom = (active ? row.label_on : offline ? null : row.label_off) ?? row.label;
    r.label.textContent = custom ?? (trailing === 'state' ? '' : this._stateText(s, offline) ?? '');

    if (r.kind !== trailing) {
      r.kind = trailing;
      r.trailing.innerHTML = {
        switch: '<div class="switch" role="switch"></div>',
        state: '<span class="state"></span>',
        chevron: '<ha-icon class="chevron" icon="mdi:chevron-right"></ha-icon>',
        none: '',
      }[trailing];
      r.switch = r.trailing.querySelector('.switch');
      if (r.switch) {
        // L'interrupteur bascule l'entité sans déclencher l'action de la ligne.
        r.switch.addEventListener('pointerdown', (e) => e.stopPropagation());
        r.switch.addEventListener('pointerup', (e) => e.stopPropagation());
        r.switch.addEventListener('click', (e) => {
          e.stopPropagation();
          if (r.el.hasAttribute('offline')) return;
          this._fire('haptic', 'light');
          r.switch.toggleAttribute('on');
          this._hass.callService('homeassistant', 'toggle', { entity_id: row.entity });
        });
      }
    }
    if (r.switch) {
      r.switch.toggleAttribute('on', active);
      r.switch.setAttribute('aria-checked', String(active));
    }
    const stateEl = r.trailing.querySelector('.state');
    if (stateEl) stateEl.textContent = this._stateText(s, offline) ?? '';

    const tinted = active && this._config.dynamic !== false;
    const st = r.el.style;
    // Valeur sous le seuil d'alerte (batterie faible...) : couleurs d'erreur.
    const value = parseFloat(s?.state);
    if (row.alert_below != null && !isNaN(value) && value < Number(row.alert_below)) {
      st.setProperty('--m3-bg', 'var(--md-sys-color-error-container, rgba(var(--rgb-error-color, 219, 68, 55), 0.2))');
      st.setProperty('--m3-fg', 'var(--md-sys-color-on-error-container, var(--primary-text-color))');
      st.setProperty('--m3-icon-fg', 'var(--md-sys-color-error, var(--error-color))');
      return;
    }
    st.setProperty('--m3-bg', tinted ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', tinted ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-icon-fg', tinted ? 'var(--md-sys-color-primary, var(--primary-color))' : ON_SURFACE);
  }

  // « auto » : interrupteur pour ce qui s'allume (sauf action configurée), flèche pour une navigation.
  _trailing(row, s) {
    if (row.trailing && row.trailing !== 'auto') return row.trailing;
    const action = row.tap_action?.action;
    if (action === 'navigate' || action === 'url') return 'chevron';
    const domain = row.entity?.split('.')[0];
    if (s && TOGGLE_DOMAINS.has(domain) && domain !== 'cover' && (!action || action === 'toggle')) return 'switch';
    return 'none';
  }

  _stateText(s, offline) {
    if (!s) return null;
    if (offline) return t(this._hass, 'Offline');
    const [domain] = s.entity_id.split('.');
    // L'état d'une scène ou d'un bouton est la date du dernier déclenchement : rien à afficher.
    if (['scene', 'button', 'input_button'].includes(domain)) return null;
    if (domain === 'script') return s.state === 'on' ? t(this._hass, 'Running') : null;
    const state = this._hass.formatEntityState?.(s) ?? s.state;
    if (domain === 'light' && s.state === 'on' && s.attributes.brightness != null) {
      return `${state} • ${Math.round((s.attributes.brightness / 255) * 100)} %`;
    }
    return state;
  }

  _bindPress(r) {
    let timer;
    let down = false;
    let held = false;
    r.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      down = true;
      held = false;
      timer = setTimeout(() => {
        held = true;
        this._run(r, 'hold');
      }, HOLD_MS);
    });
    r.el.addEventListener('pointerup', () => {
      clearTimeout(timer);
      if (down && !held) this._run(r, 'tap');
      down = false;
    });
    const cancel = () => {
      clearTimeout(timer);
      down = false;
    };
    r.el.addEventListener('pointerleave', cancel);
    r.el.addEventListener('pointercancel', cancel);
    r.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Action configurée → gestion native de HA ; sinon action par défaut du domaine (appui) ou détails.
  _run(r, kind) {
    const { row } = r;
    const configured = row[`${kind}_action`];
    this._fire('haptic', kind === 'hold' ? 'medium' : 'light');
    if (configured) {
      this._fire('hass-action', { config: { entity: row.entity, [`${kind}_action`]: configured }, action: kind });
      return;
    }
    if (!row.entity) return;
    const s = this._hass.states[row.entity];
    const service = kind === 'tap' && s && !r.el.hasAttribute('offline') ? defaultTapService(s) : null;
    if (service) {
      this._hass.callService(service[0], service[1], { entity_id: row.entity });
    } else {
      this._fire('hass-more-info', { entityId: row.entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-list-card-editor', M3ListCardEditor);

if (!customElements.get('m3-list-card')) {
  customElements.define('m3-list-card', M3ListCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-list-card',
    name: 'M3 List',
    description: t(null, 'Material 3 Expressive list: stacked rows with a switch, state or chevron on the right'),
    preview: true,
  });
}
}

// ---- m3-map-card.js ----
{
// m3-map-card — carte d'un robot (tondeuse Dreame...) redessinée en Material 3 : la caméra « carte » fournit
// un SVG, dont on retire le fond, le titre et la légende, puis qu'on recolore et recadre sur le terrain.
const STYLE = `
:host { display: block; }
ha-card {
  position: relative; overflow: hidden; box-sizing: border-box; padding: 16px;
  border-radius: 28px; border: none; box-shadow: none; cursor: pointer;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  --m3-lawn: var(--m3-map-lawn, #6abf69);
  --m3-path: var(--m3-map-path, #a5d6a7);
  --m3-obstacle: var(--md-sys-color-on-surface, var(--primary-text-color));
  --m3-mower: var(--md-sys-color-primary, var(--primary-color));
}
.map { display: flex; align-items: center; justify-content: center; min-height: 120px; }
.map svg { width: 100%; height: auto; max-height: var(--m3-map-height, 360px); display: block; overflow: visible; }
.map img { width: 100%; max-height: var(--m3-map-height, 360px); object-fit: contain; border-radius: 16px; }
.boundary { fill: color-mix(in srgb, var(--m3-lawn) 22%, transparent); stroke: var(--m3-lawn); stroke-width: 3; stroke-linejoin: round; }
.mowed { stroke: var(--m3-path); stroke-opacity: 0.55; fill: none; }
.obstacle { fill: color-mix(in srgb, var(--m3-obstacle) 18%, transparent); stroke: color-mix(in srgb, var(--m3-obstacle) 45%, transparent); stroke-width: 1.5; }
.mower { fill: var(--m3-mower); stroke: var(--md-sys-color-on-primary, #fff); stroke-width: 3; }
.mower-halo { fill: var(--m3-mower); opacity: 0.25; }
.chip {
  position: absolute; top: 14px; left: 14px; display: flex; align-items: center; gap: 6px; padding: 6px 12px 6px 8px;
  border-radius: 16px; font-size: 13px; font-weight: 500; --mdc-icon-size: 18px;
  background: color-mix(in srgb, var(--md-sys-color-surface-container-highest, #444) 85%, transparent);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.chip:empty, :host(:not([has-chip])) .chip { display: none; }
.empty { ${STATE_FONT} padding: 40px 0; }
`;

// Couleurs du rendu Dreame Mower → rôle de chaque élément.
const ROLES = [
  { role: 'boundary', match: (el) => el.getAttribute('stroke') === '#006400' },
  { role: 'mowed', match: (el) => el.getAttribute('stroke') === '#ffa500' },
  { role: 'obstacle', match: (el) => el.getAttribute('stroke') === '#ff4d00' },
  { role: 'mower', match: (el) => el.tagName === 'circle' && el.getAttribute('fill') === '#ff0000' },
];
const MIN_RELOAD_MS = 10 * 1000;

class M3MapCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { domain: 'camera' } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'mower', selector: { entity: { domain: ['lawn_mower', 'vacuum'] } } },
        { name: 'battery', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
        { name: 'lawn_color', selector: { text: {} } },
        { name: 'height', selector: { number: { min: 150, max: 800, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
      ],
    },
  ];

  static labels = {
    entity: 'Map camera', mower: 'Robot', battery: 'Battery', lawn_color: 'Lawn color', height: 'Max height',
  };

  static helpers = {
    mower: 'Optional: its state is shown in a chip on the map',
    lawn_color: 'CSS color, empty: green',
  };
}

class M3MapCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-map-card-editor');
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('camera.') && /map|carte/.test(e)) ?? 'camera.example' };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error('m3-map-card: "entity" (camera) is required');
    this._config = config;
    if (!this.shadowRoot) this._build();
    const st = this._card.style;
    st.setProperty('--m3-map-height', `${Number(config.height) || 360}px`);
    if (config.lawn_color) st.setProperty('--m3-map-lawn', config.lawn_color);
    else st.removeProperty('--m3-map-lawn');
    this.toggleAttribute('has-chip', !!(config.mower || config.battery));
    this._url = null;
    if (this._hass) this._update();
  }

  getCardSize() { return 6; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card><div class="map"><div class="empty">${t(this._hass, 'Loading the map…')}</div></div><div class="chip"></div></ha-card>`;
    this._card = root.querySelector('ha-card');
    this._map = root.querySelector('.map');
    this._chip = root.querySelector('.chip');
    this._card.addEventListener('click', () => {
      this._fire('hass-more-info', { entityId: this._config.mower ?? this._config.entity });
    });
  }

  _update() {
    if (!this._card || !this._hass) return;
    this._renderChip();
    const cam = this._hass.states[this._config.entity];
    const picture = cam?.attributes.entity_picture;
    if (!picture) {
      this._map.innerHTML = `<div class="empty">${t(this._hass, 'Map unavailable')}</div>`;
      this._url = null;
      return;
    }
    // L'URL change à chaque nouveau jeton de la caméra : on recharge, au plus toutes les 10 s.
    const url = this._hass.hassUrl?.(picture) ?? picture;
    if (url === this._url) return;
    clearTimeout(this._reloadTimer);
    const wait = (this._loadedAt ?? 0) + MIN_RELOAD_MS - Date.now();
    if (this._url && wait > 0) {
      this._reloadTimer = setTimeout(() => this._update(), wait);
      return;
    }
    this._url = url;
    this._load(url);
  }

  async _load(url) {
    this._loadedAt = Date.now();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (url !== this._url) return;
      if (type.includes('svg')) {
        this._showSvg(await res.text());
      } else {
        // Image classique (PNG, JPEG) : affichée telle quelle, coins arrondis.
        const img = document.createElement('img');
        img.alt = '';
        img.src = url;
        this._map.replaceChildren(img);
      }
    } catch (err) {
      console.warn('m3-map-card : carte indisponible', err);
      this._map.innerHTML = `<div class="empty">${t(this._hass, 'Map unavailable')}</div>`;
    }
  }

  _showSvg(text) {
    // Analyse par le parseur HTML (SVG en ligne) : plus tolérant que le parseur XML.
    const tpl = document.createElement('template');
    tpl.innerHTML = text.replace(/<\?xml[^>]*\?>/, '');
    const svg = tpl.content.querySelector('svg');
    if (!svg) throw new Error('SVG invalide');
    const [, , width, height] = (svg.getAttribute('viewBox') ?? `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`)
      .split(/[\s,]+/).map(Number);

    // Fond, titre, légende et horodatage : tout ce qui n'est pas le terrain disparaît.
    for (const el of [...svg.querySelectorAll('rect, text, g')]) {
      const full = el.tagName === 'rect' && (el.getAttribute('width') === '100%' || Number(el.getAttribute('width')) >= width);
      if (el.tagName === 'text' || full || (el.tagName === 'rect' && el.getAttribute('stroke'))) el.remove();
      else if (el.tagName === 'g' && el.querySelector('text') && !el.querySelector('path, polygon, circle')) el.remove();
    }
    for (const el of svg.querySelectorAll('rect')) {
      // Petits carrés de couleur de la légende.
      if (Number(el.getAttribute('width')) < 40 && Number(el.getAttribute('height')) < 40) el.remove();
    }

    // Recoloration par rôle : les attributs d'origine cèdent la place aux classes du thème.
    const boxes = [];
    for (const el of svg.querySelectorAll('path, polygon, polyline, circle')) {
      const found = ROLES.find((r) => r.match(el));
      if (!found) continue;
      el.removeAttribute('fill');
      el.removeAttribute('stroke');
      el.setAttribute('class', found.role);
      if (found.role === 'mower') {
        const halo = el.cloneNode();
        halo.setAttribute('class', 'mower-halo');
        halo.setAttribute('r', String(Number(el.getAttribute('r') || 6) * 2.6));
        el.before(halo);
        el.setAttribute('r', String(Math.max(Number(el.getAttribute('r') || 6), 9)));
      }
      if (found.role === 'boundary') boxes.push(el);
    }

    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const node = svg;
    this._map.replaceChildren(node);

    // Recadrage sur le terrain (limite + tracé), avec une petite marge.
    try {
      const targets = [...node.querySelectorAll('.boundary, .mowed, .obstacle, .mower')];
      const rects = targets.map((el) => el.getBBox()).filter((b) => b.width || b.height);
      if (rects.length) {
        const x1 = Math.min(...rects.map((b) => b.x)), y1 = Math.min(...rects.map((b) => b.y));
        const x2 = Math.max(...rects.map((b) => b.x + b.width)), y2 = Math.max(...rects.map((b) => b.y + b.height));
        const pad = Math.max(x2 - x1, y2 - y1) * 0.03;
        node.setAttribute('viewBox', `${x1 - pad} ${y1 - pad} ${x2 - x1 + pad * 2} ${y2 - y1 + pad * 2}`);
      }
    } catch {
      // getBBox indisponible (carte masquée) : on garde le cadrage d'origine.
    }
  }

  _renderChip() {
    const c = this._config;
    if (!c.mower && !c.battery) return;
    const mower = c.mower && this._hass.states[c.mower];
    const battery = c.battery && this._hass.states[c.battery];
    const parts = [];
    if (mower) parts.push(this._hass.formatEntityState?.(mower) ?? mower.state);
    if (battery && !isNaN(parseFloat(battery.state))) parts.push(`${Math.round(parseFloat(battery.state))} %`);
    const key = parts.join(' • ');
    if (key === this._chipKey) return;
    this._chipKey = key;
    this._chip.innerHTML = '';
    if (!parts.length) return;
    const icon = document.createElement('ha-state-icon');
    Object.assign(icon, { hass: this._hass, stateObj: mower ?? battery });
    const text = document.createElement('span');
    text.textContent = key;
    this._chip.append(icon, text);
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-map-card-editor', M3MapCardEditor);

if (!customElements.get('m3-map-card')) {
  customElements.define('m3-map-card', M3MapCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-map-card',
    name: 'M3 Map',
    description: t(null, 'Robot map (Dreame mower...) redrawn in Material 3 colors, with its state'),
    preview: true,
  });
}
}

// ---- m3-media-card.js ----
{
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
}

// ---- m3-multi-graph-card.js ----
{
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
}

// ---- m3-person-card.js ----
{
// m3-person-card — accueil Material 3 : avatar et « Bonjour Laurent ! » pour l'utilisateur connecté,
// avatars des autres personnes à droite (en gris quand elles sont absentes).
const STYLE = `
:host { display: block; }
ha-card {
  display: flex; align-items: center; gap: 14px; box-sizing: border-box; padding: 4px 4px;
  background: none; border: none; box-shadow: none; color: var(--md-sys-color-on-surface, var(--primary-text-color));
}
:host([background]) ha-card {
  padding: 14px 16px; border-radius: 28px;
  background: var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)));
}
.avatar {
  position: relative; flex: none; width: 44px; height: 44px; border-radius: 14px; overflow: visible;
  display: flex; align-items: center; justify-content: center; cursor: pointer; -webkit-tap-highlight-color: transparent;
  background: var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.2));
  color: var(--md-sys-color-on-primary-container, var(--primary-text-color));
  font-size: 16px; font-weight: 600; transition: filter 300ms ease, opacity 300ms ease, transform 120ms ease;
}
.avatar:active { transform: scale(0.94); }
.avatar img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
.avatar[away] { filter: grayscale(100%); opacity: 0.55; }
/* Pastille d'état : verte à la maison, absente sinon. */
.avatar::after {
  content: ''; position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--md-sys-color-tertiary, #4caf50); border: 2px solid var(--md-sys-color-surface, var(--primary-background-color));
}
.avatar[away]::after { display: none; }
:host(:not([show-dot])) .avatar::after { display: none; }
.text { flex: 1; min-width: 0; }
.greeting { font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
:host(:not([show-state])) .state { display: none; }
.others { flex: none; display: flex; gap: 8px; }
.others .avatar { width: 40px; height: 40px; border-radius: 12px; font-size: 14px; }
`;

// Bonjour le jour, bonsoir à partir de 18 h.
// Matin, après-midi ou soir selon l'heure.
const greetingKey = (date = new Date()) => {
  const h = date.getHours();
  if (h >= 18 || h < 4) return 'Good evening, {name}!';
  return h < 12 ? 'Good morning, {name}!' : 'Good afternoon, {name}!';
};

class M3PersonCardEditor extends M3CardEditor {
  static schema = [
    { name: 'persons', selector: { entity: { domain: 'person', multiple: true } } },
    { name: 'greeting', selector: { text: {} } },
    {
      type: 'grid', name: '', schema: [
        { name: 'show_state', selector: { boolean: {} } },
        { name: 'show_dot', selector: { boolean: {} } },
        { name: 'background', selector: { boolean: {} } },
      ],
    },
  ];

  static labels = {
    persons: 'Other people', greeting: 'Message', show_state: 'Show the state',
    show_dot: '"At home" dot', background: 'Card background',
  };

  static helpers = {
    persons: 'Empty: everyone except you',
    greeting: 'Empty: "Good morning" or "Good evening" followed by the first name',
  };
}

class M3PersonCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-person-card-editor');
  }

  static getStubConfig() { return {}; }

  setConfig(config) {
    this._config = { show_state: true, show_dot: true, background: false, ...config };
    this.toggleAttribute('show-state', this._config.show_state !== false);
    this.toggleAttribute('show-dot', this._config.show_dot !== false);
    this.toggleAttribute('background', !!this._config.background);
    if (!this.shadowRoot) this._build();
    this._key = null;
    if (this._hass) this._render();
  }

  getCardSize() { return 1; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  connectedCallback() {
    // Le message passe de « Bonjour » à « Bonsoir » sans rechargement.
    this._clock = setInterval(() => this._render(), 60 * 1000);
  }

  disconnectedCallback() { clearInterval(this._clock); }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="avatar me"></div>
        <div class="text"><div class="greeting"></div><div class="state"></div></div>
        <div class="others"></div>
      </ha-card>`;
    this._els = {
      me: root.querySelector('.me'),
      greeting: root.querySelector('.greeting'),
      state: root.querySelector('.state'),
      others: root.querySelector('.others'),
    };
    this._els.me.addEventListener('click', () => this._me && this._fire('hass-more-info', { entityId: this._me }));
  }

  // La personne de l'utilisateur connecté : celle dont le user_id correspond.
  _currentPerson() {
    const userId = this._hass.user?.id;
    return Object.keys(this._hass.states).find((e) => e.startsWith('person.') && this._hass.states[e].attributes.user_id === userId);
  }

  _render() {
    if (!this._els || !this._hass) return;
    const c = this._config;
    const states = this._hass.states;
    this._me = this._currentPerson();
    const others = (c.persons?.length ? c.persons : Object.keys(states).filter((e) => e.startsWith('person.')))
      .filter((e) => e !== this._me && states[e]);

    // Ne redessine que si une personne ou l'heure du message a changé.
    const key = [this._me, ...others].map((e) => e && states[e]?.last_updated).join() + greetingKey() + (this._hass.user?.name ?? '');
    if (key === this._key) return;
    this._key = key;

    const me = this._me && states[this._me];
    const firstName = (this._hass.user?.name ?? me?.attributes.friendly_name ?? '').split(' ')[0];
    this._els.greeting.textContent = c.greeting ?? t(this._hass, greetingKey(), { name: firstName });
    this._els.state.textContent = me ? this._stateText(me) : '';
    this._fillAvatar(this._els.me, me, firstName);

    const list = this._els.others;
    while (list.children.length > others.length) list.lastChild.remove();
    others.forEach((entityId, i) => {
      let el = list.children[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'avatar';
        el.addEventListener('click', () => this._fire('hass-more-info', { entityId: el.dataset.entity }));
        list.appendChild(el);
      }
      el.dataset.entity = entityId;
      const s = states[entityId];
      el.title = `${s.attributes.friendly_name ?? entityId} • ${this._stateText(s)}`;
      this._fillAvatar(el, s, s.attributes.friendly_name ?? entityId);
    });
  }

  _stateText(s) {
    if (s.state === 'home') return t(this._hass, 'At home');
    if (s.state === 'not_home') return t(this._hass, 'Away');
    return this._hass.formatEntityState?.(s) ?? s.state;
  }

  // Photo de la personne, sinon son initiale.
  _fillAvatar(el, s, name) {
    el.toggleAttribute('away', !!s && s.state !== 'home');
    const picture = s?.attributes.entity_picture;
    const url = picture ? (this._hass.hassUrl?.(picture) ?? picture) : null;
    if (url) {
      let img = el.querySelector('img');
      if (!img) {
        el.textContent = '';
        img = document.createElement('img');
        img.alt = '';
        el.appendChild(img);
      }
      if (img.getAttribute('src') !== url) img.src = url;
    } else {
      el.textContent = (name || '?').trim().charAt(0).toUpperCase();
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-person-card-editor', M3PersonCardEditor);

if (!customElements.get('m3-person-card')) {
  customElements.define('m3-person-card', M3PersonCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-person-card',
    name: 'M3 Person',
    description: t(null, 'Material 3 greeting: "Good morning" with your avatar, and the other people in the house'),
    preview: true,
  });
}
}

// ---- m3-popup-card.js ----
{
// m3-popup-card — popup Material 3 ouverte par un #hash dans l'URL (action « naviguer » vers #salon...).
// Panneau qui glisse depuis le bas sur mobile, fenêtre centrée sur ordinateur ; contient n'importe quelles cartes.
const PLACEHOLDER_STYLE = `
:host { display: none; }
:host([preview]) { display: block; }
ha-card {
  display: flex; align-items: center; gap: 14px; padding: 14px 20px; box-sizing: border-box;
  border-radius: 28px; border: 1px dashed var(--md-sys-color-outline, var(--divider-color));
  background: transparent; box-shadow: none; color: var(--md-sys-color-on-surface, var(--primary-text-color));
}
ha-icon { --mdc-icon-size: 24px; flex: none; }
.text { flex: 1; min-width: 0; }
.name { ${TITLE_FONT} }
.info { ${STATE_FONT} }
button {
  font: inherit; font-size: 14px; font-weight: 500; border: none; cursor: pointer;
  height: 36px; padding: 0 16px; border-radius: 18px;
  background: var(--md-sys-color-primary, var(--primary-color)); color: var(--md-sys-color-on-primary, #fff);
}
`;

// Styles de la popup elle-même : elle est rendue dans document.body, hors des conteneurs du tableau de bord.
const POPUP_STYLE = `
:host { position: fixed; inset: 0; z-index: 7; display: block; }
.backdrop {
  position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(var(--m3-blur)); -webkit-backdrop-filter: blur(var(--m3-blur));
  opacity: 0; transition: opacity 250ms ease;
}
.sheet {
  position: absolute; box-sizing: border-box; display: flex; flex-direction: column;
  max-height: 90vh; overflow: hidden;
  background: var(--md-sys-color-surface-container-low, var(--ha-card-background, var(--card-background-color)));
  color: var(--md-sys-color-on-surface, var(--primary-text-color));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: transform 300ms cubic-bezier(0.2, 0, 0, 1), opacity 250ms ease;
}
:host([mobile]) .sheet {
  left: 50%; bottom: 0; width: var(--m3-width-mobile); max-height: 92vh;
  border-radius: var(--m3-radius) var(--m3-radius) 0 0;
  transform: translate(-50%, 100%);
}
:host(:not([mobile])) .sheet {
  left: 50%; top: 50%; width: min(var(--m3-width-desktop), calc(100vw - 32px));
  border-radius: var(--m3-radius);
  transform: translate(-50%, -50%) scale(0.94); opacity: 0;
}
:host([open]) .backdrop { opacity: 1; }
:host([open][mobile]) .sheet { transform: translate(-50%, var(--m3-drag, 0px)); }
:host([open]:not([mobile])) .sheet { transform: translate(-50%, -50%); opacity: 1; }
:host([dragging]) .sheet { transition: none; }
.handle { display: none; width: 32px; height: 4px; border-radius: 2px; margin: 12px auto 0; flex: none;
  background: var(--md-sys-color-on-surface-variant, var(--secondary-text-color)); opacity: 0.4; }
:host([mobile]) .handle { display: block; }
.header { display: flex; align-items: center; gap: 12px; padding: 16px 16px 8px 24px; flex: none; touch-action: none; }
:host([no-header]) .header { display: none; }
.header .icon { --mdc-icon-size: 24px; flex: none; }
.title { flex: 1; min-width: 0; }
.name { font-size: 20px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { ${STATE_FONT} }
.state:empty { display: none; }
button {
  font: inherit; color: inherit; border: none; background: none; padding: 0; margin: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.icon-button { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; }
.icon-button:hover { background: rgba(127, 127, 127, 0.12); }
.icon-button ha-icon { --mdc-icon-size: 22px; }
.switch {
  position: relative; width: 52px; height: 32px; border-radius: 16px; flex: none; box-sizing: border-box;
  border: 2px solid var(--md-sys-color-outline, rgba(127, 127, 127, 0.6));
  background: var(--md-sys-color-surface-container-highest, rgba(127, 127, 127, 0.15));
  transition: background 200ms ease, border-color 200ms ease;
}
.switch::after {
  content: ''; position: absolute; top: 50%; left: 6px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--md-sys-color-outline, rgba(127, 127, 127, 0.8));
  transform: translateY(-50%); transition: all 200ms ease;
}
.switch[aria-checked='true'] { background: var(--md-sys-color-primary, var(--primary-color)); border-color: transparent; }
.switch[aria-checked='true']::after { left: 22px; width: 24px; height: 24px; background: var(--md-sys-color-on-primary, #fff); }
.body { overflow-y: auto; padding: 8px 16px 24px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; }
:host([mobile]) .body { padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
`;

const isMobile = () => window.matchMedia('(max-width: 600px)').matches;

// Événements des cartes imbriquées à faire remonter dans l'arbre du tableau de bord, où HA les écoute.
const FORWARDED_EVENTS = ['hass-more-info', 'hass-action', 'show-dialog', 'hass-notification', 'haptic', 'll-custom'];

class M3PopupCardEditor extends M3CardEditor {
  static schema = [
    { name: 'hash', required: true, selector: { text: {} } },
    {
      type: 'expandable', name: 'header', title: 'Header', icon: 'mdi:page-layout-header', schema: [
        {
          type: 'grid', name: '', schema: [
            { name: 'name', selector: { text: {} } },
            { name: 'icon', selector: { icon: {} } },
            { name: 'entity', selector: { entity: {} } },
            {
              name: 'button_type',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: [
                    { value: 'name', label: 'Name only' },
                    { value: 'state', label: 'Name and state' },
                    { value: 'switch', label: 'Name, state and switch' },
                  ],
                },
              },
            },
          ],
        },
        { name: 'show_header', selector: { boolean: {} } },
      ],
    },
    {
      type: 'expandable', name: 'settings', title: 'Behavior', icon: 'mdi:gesture-swipe-down', schema: [
        { name: 'close_by_clicking_outside', selector: { boolean: {} } },
        {
          type: 'grid', name: '', schema: [
            { name: 'auto_close', selector: { number: { min: 0, step: 1000, mode: 'box', unit_of_measurement: 'ms' } } },
            { name: 'slide_to_close_distance', selector: { number: { min: 20, max: 400, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
          ],
        },
      ],
    },
    {
      type: 'expandable', name: 'style', title: 'Appearance', icon: 'mdi:palette-outline', schema: [
        {
          type: 'grid', name: '', schema: [
            { name: 'width_desktop', selector: { number: { min: 280, max: 1200, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
            { name: 'width_mobile', selector: { number: { min: 50, max: 100, step: 1, mode: 'box', unit_of_measurement: '%' } } },
            { name: 'border_radius', selector: { number: { min: 0, max: 48, step: 1, mode: 'box', unit_of_measurement: 'px' } } },
            { name: 'backdrop_blur', selector: { number: { min: 0, max: 30, step: 1, mode: 'box', unit_of_measurement: 'px' } } },
          ],
        },
      ],
    },
  ];

  static labels = {
    hash: 'Opening hash', name: 'Title', icon: 'Icon', entity: 'Entity', button_type: 'Header',
    show_header: 'Show the header', close_by_clicking_outside: 'Close when tapping outside',
    auto_close: 'Auto close', slide_to_close_distance: 'Swipe distance',
    width_desktop: 'Width (desktop)', width_mobile: 'Width (mobile)',
    border_radius: 'Corner radius', backdrop_blur: 'Backdrop blur',
  };

  static helpers = {
    hash: 'E.g. #living-room: open it with a "Navigate" action to #living-room. The popup\'s cards are edited in YAML (cards:)',
    auto_close: '0 or empty: never closes automatically',
  };
}

class M3PopupCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-popup-card-editor');
  }

  static getStubConfig() {
    return { hash: '#popup', header: { name: 'Popup', icon: 'mdi:dock-window' }, cards: [] };
  }

  setConfig(config) {
    if (!config || !config.hash || !String(config.hash).startsWith('#')) {
      throw new Error('m3-popup-card: "hash" is required and must start with # (e.g. #living-room)');
    }
    this._config = config;
    this._header = { show_header: true, name: 'Popup', button_type: 'name', ...config.header };
    this._settings = { close_by_clicking_outside: true, slide_to_close_distance: 100, ...config.settings };
    this._style = { width_desktop: 540, width_mobile: 100, border_radius: 28, backdrop_blur: 6, ...config.style };
    this._cards = null;
    if (!this.shadowRoot) this._buildPlaceholder();
    this._renderPlaceholder();
    if (this._popup) { this._closeNow(); this._checkHash(); }
  }

  getCardSize() { return this._preview ? 1 : 0; }

  getGridOptions() { return { columns: 'full', rows: 'auto' }; }

  // HA passe preview = true en mode édition : on affiche alors un repère pour retrouver la carte.
  set preview(value) {
    this._preview = value;
    this.toggleAttribute('preview', !!value);
  }

  get preview() { return this._preview; }

  set hass(hass) {
    this._hass = hass;
    if (this._cards) for (const card of this._cards) card.hass = hass;
    if (this._popup) this._renderHeader();
  }

  connectedCallback() {
    this._onLocation = () => this._checkHash();
    for (const type of ['hashchange', 'location-changed', 'popstate']) window.addEventListener(type, this._onLocation);
    // Après une navigation interne, location-changed peut précéder la mise à jour de l'URL.
    setTimeout(this._onLocation, 0);
  }

  disconnectedCallback() {
    for (const type of ['hashchange', 'location-changed', 'popstate']) window.removeEventListener(type, this._onLocation);
    this._closeNow();
  }

  _buildPlaceholder() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${PLACEHOLDER_STYLE}</style>
      <ha-card>
        <ha-icon></ha-icon>
        <div class="text"><div class="name"></div><div class="info"></div></div>
        <button>${t(this._hass, 'Open')}</button>
      </ha-card>`;
    root.querySelector('button').addEventListener('click', () => this._open());
  }

  _renderPlaceholder() {
    const root = this.shadowRoot;
    const count = (this._config.cards ?? []).length;
    root.querySelector('ha-icon').icon = this._header.icon ?? 'mdi:dock-window';
    root.querySelector('.name').textContent = `Popup ${this._header.name}`;
    root.querySelector('.info').textContent = `${this._config.hash} • ${t(this._hass, count > 1 ? '{count} cards' : '{count} card', { count })}`;
  }

  _checkHash() {
    const match = window.location.hash === this._config?.hash;
    if (match && !this._popup) this._open();
    else if (!match && this._popup && !this._manual) this._close(false);
  }

  async _createCards() {
    const helpers = await window.loadCardHelpers?.();
    const configs = this._config.cards ?? [];
    this._cards = configs.map((config) => {
      const card = helpers ? helpers.createCardElement(config) : document.createElement('div');
      card.hass = this._hass;
      return card;
    });
    return this._cards;
  }

  async _open() {
    if (this._popup) return;
    this._manual = window.location.hash !== this._config.hash;
    const popup = document.createElement('m3-popup-overlay');
    this._popup = popup;
    this._openedAt = Date.now();
    this._backdropDown = false;
    const root = popup.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${POPUP_STYLE}</style>
      <div class="backdrop"></div>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="handle"></div>
        <div class="header">
          <ha-icon class="icon"></ha-icon>
          <div class="title"><div class="name"></div><div class="state"></div></div>
          <button class="switch" role="switch" aria-label="${t(this._hass, 'Turn on / off')}"></button>
          <button class="icon-button close" aria-label="${t(this._hass, 'Close')}"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <div class="body"></div>
      </div>`;
    const st = popup.style;
    // Rendue dans document.body, la popup n'hérite pas de la police du tableau de bord : on reprend celle de la carte.
    const font = getComputedStyle(this);
    st.fontFamily = font.fontFamily;
    st.setProperty('-webkit-font-smoothing', font.getPropertyValue('-webkit-font-smoothing') || 'antialiased');
    st.setProperty('--m3-blur', `${Number(this._style.backdrop_blur)}px`);
    st.setProperty('--m3-radius', `${Number(this._style.border_radius)}px`);
    st.setProperty('--m3-width-desktop', `${Number(this._style.width_desktop)}px`);
    st.setProperty('--m3-width-mobile', `${Number(this._style.width_mobile)}%`);
    popup.toggleAttribute('mobile', isMobile());
    popup.toggleAttribute('no-header', !this._header.show_header);

    // Le même clic fantôme peut tomber sur une carte de la popup (bouton du thermostat...) : on l'absorbe.
    popup.addEventListener('click', (e) => {
      if (Date.now() - this._openedAt < 350) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    for (const type of FORWARDED_EVENTS) {
      popup.addEventListener(type, (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent(type, { detail: e.detail, bubbles: true, composed: true }));
      });
    }
    // Sur écran tactile, le « click » qui suit l'appui sur le bouton d'ouverture retombe sur le fond
    // qui vient d'apparaître : on ne ferme que si l'appui a commencé sur le fond, et pas juste après l'ouverture.
    const backdrop = root.querySelector('.backdrop');
    backdrop.addEventListener('pointerdown', () => { this._backdropDown = Date.now() - this._openedAt > 300; });
    backdrop.addEventListener('click', () => {
      const fromBackdrop = this._backdropDown;
      this._backdropDown = false;
      if (fromBackdrop && this._settings.close_by_clicking_outside) this._close();
    });
    root.querySelector('.close').addEventListener('click', () => this._close());
    root.querySelector('.switch').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('haptic', { detail: 'light', bubbles: true, composed: true }));
      this._hass?.callService('homeassistant', 'toggle', { entity_id: this._header.entity });
    });
    this._setupDrag(root.querySelector('.header'), root.querySelector('.handle'));
    this._onKey = (e) => { if (e.key === 'Escape') this._close(); };
    window.addEventListener('keydown', this._onKey);

    document.body.appendChild(popup);
    this._renderHeader();
    const body = root.querySelector('.body');
    for (const card of await this._createCards()) body.appendChild(card);

    this._scrollLock = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => popup.setAttribute('open', '')));
    clearTimeout(this._autoClose);
    if (Number(this._settings.auto_close) > 0) {
      this._autoClose = setTimeout(() => this._close(), Number(this._settings.auto_close));
    }
  }

  _renderHeader() {
    const root = this._popup?.shadowRoot;
    if (!root) return;
    const h = this._header;
    const stateObj = h.entity ? this._hass?.states[h.entity] : undefined;
    const icon = root.querySelector('.header .icon');
    icon.icon = h.icon ?? stateObj?.attributes.icon ?? '';
    icon.style.display = icon.icon ? '' : 'none';
    root.querySelector('.name').textContent = h.name;
    const showState = stateObj && (h.button_type === 'state' || h.button_type === 'switch');
    root.querySelector('.state').textContent = showState ? (this._hass.formatEntityState?.(stateObj) ?? stateObj.state) : '';
    const sw = root.querySelector('.switch');
    sw.style.display = stateObj && h.button_type === 'switch' ? '' : 'none';
    sw.setAttribute('aria-checked', String(stateObj?.state === 'on'));
  }

  // Glisser l'en-tête (ou la poignée) vers le bas ferme le panneau sur mobile.
  _setupDrag(...handles) {
    for (const handle of handles) {
      handle.addEventListener('pointerdown', (e) => {
        if (!this._popup?.hasAttribute('mobile') || e.target.closest('button')) return;
        this._dragStart = e.clientY;
        handle.setPointerCapture(e.pointerId);
        this._popup.setAttribute('dragging', '');
      });
      handle.addEventListener('pointermove', (e) => {
        if (this._dragStart == null) return;
        this._dragY = Math.max(0, e.clientY - this._dragStart);
        this._popup.style.setProperty('--m3-drag', `${this._dragY}px`);
      });
      const end = () => {
        if (this._dragStart == null) return;
        this._dragStart = null;
        this._popup.removeAttribute('dragging');
        if (this._dragY > Number(this._settings.slide_to_close_distance)) this._close();
        else this._popup.style.setProperty('--m3-drag', '0px');
        this._dragY = 0;
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }
  }

  // Fermeture : animation, puis retrait du #hash de l'URL pour que la popup ne se rouvre pas.
  _close(clearHash = true) {
    const popup = this._popup;
    if (!popup || popup.closing) return;
    popup.closing = true;
    popup.removeAttribute('open');
    if (clearHash && window.location.hash === this._config.hash) {
      history.replaceState(history.state, '', window.location.href.split('#')[0]);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: true } }));
    }
    setTimeout(() => this._closeNow(), 300);
  }

  _closeNow() {
    clearTimeout(this._autoClose);
    window.removeEventListener('keydown', this._onKey);
    if (this._popup) {
      this._popup.remove();
      document.documentElement.style.overflow = this._scrollLock ?? '';
    }
    this._popup = null;
    this._cards = null;
    this._manual = false;
  }
}

if (!customElements.get('m3-popup-overlay')) customElements.define('m3-popup-overlay', class extends HTMLElement {});
defineEditor('m3-popup-card-editor', M3PopupCardEditor);

if (!customElements.get('m3-popup-card')) {
  customElements.define('m3-popup-card', M3PopupCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-popup-card',
    name: 'M3 Popup',
    description: t(null, 'Material 3 popup opened by a #hash, holding any cards'),
  });
}
}

// ---- m3-progress-card.js ----
{
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
    entity: 'Task state', name: 'Name', icon: 'Icon', progress: 'Progress (%)', end_time: 'End time',
    remaining: 'Time left', image: 'Image', color: 'Color',
  };

  static helpers = {
    end_time: 'Timestamp sensor: the time left is derived from it',
    remaining: 'Otherwise: duration sensor (min, h or s)',
    progress: 'Optional: estimated from the task start and the end time',
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
    if (!config || !config.entity) throw new Error('m3-progress-card: "entity" is required');
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
    const remaining = this._remaining();
    let progress = parseFloat(this._state(c.progress)?.state);
    // Pas de capteur de pourcentage : estimé entre le début de la tâche (dernier changement d'état) et l'heure de fin.
    if (isNaN(progress) && remaining && s && !['unavailable', 'unknown'].includes(s.state)) {
      const start = Date.parse(s.last_changed);
      const total = remaining.end.getTime() - start;
      if (total > 0) progress = ((Date.now() - start) / total) * 100;
    }
    const image = this._state(c.image);
    const key = [s, this._state(c.progress), this._state(c.end_time), this._state(c.remaining), image].map((x) => x?.last_updated).join();
    if (key === this._key) return;
    this._key = key;

    const e = this._els;
    e.name.textContent = c.name ?? s?.attributes.friendly_name ?? c.entity;
    e.state.textContent = !s ? t(this._hass, 'Not found') : (this._hass.formatEntityState?.(s) ?? s.state);
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
      e.left.textContent = t(this._hass, '{time} left', { time: left });
      const lang = this._hass.locale?.language ?? 'fr';
      const sameDay = remaining.end.toDateString() === new Date().toDateString();
      const time = remaining.end.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
      const day = remaining.end.toLocaleDateString(lang, { weekday: 'short' });
      e.end.textContent = sameDay ? t(this._hass, 'Ends at {time}', { time }) : t(this._hass, 'Ends {day} at {time}', { day, time });
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
    description: t(null, 'Task in progress (3D print, washing machine...): percentage, progress bar, time left and end time'),
    preview: true,
  });
}
}

// ---- m3-room-card.js ----
{
// m3-room-card — carte pièce Material 3 : nom, icône, température et humidité de la pièce.
// Le fond prend la couleur pastel de la lumière quand elle est allumée, l'icône devient une flamme rouge quand le chauffage est en marche.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  position: relative; overflow: hidden; height: 100%; min-height: 130px; box-sizing: border-box;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; flex-direction: column; justify-content: space-between; padding: 16px 16px 16px 20px;
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background 300ms ease, color 300ms ease, transform 120ms ease;
}
ha-card:active { transform: scale(0.98); }
.top { display: flex; align-items: center; gap: 14px; }
.name {
  ${TITLE_FONT} min-width: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.icon {
  flex: none; display: flex; --mdc-icon-size: 24px;
  color: var(--m3-icon-fg); transition: color 300ms ease;
}
.climate { display: flex; align-items: baseline; gap: 6px; }
.temp { font-size: 2.4rem; font-weight: 400; line-height: 1; letter-spacing: -0.5px; }
.hum { ${STATE_FONT} }
:host([no-climate]) .climate { display: none; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const HOLD_MS = 500;
const PASTEL = 0.45;

const isNumber = (s) => s && !isNaN(parseFloat(s.state));

class M3RoomCardEditor extends M3CardEditor {
  static schema = [
    {
      type: 'grid', name: '', schema: [
        { name: 'name', required: true, selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
      ],
    },
    { name: 'light', selector: { entity: { domain: 'light' } } },
    { name: 'climate', selector: { entity: { domain: 'climate' } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'temperature', selector: { entity: { domain: 'sensor', device_class: 'temperature' } } },
        { name: 'humidity', selector: { entity: { domain: 'sensor', device_class: 'humidity' } } },
      ],
    },
    {
      type: 'expandable', name: '', title: 'Actions', icon: 'mdi:gesture-tap', schema: [
        { name: 'tap_action', selector: { ui_action: {} } },
        { name: 'hold_action', selector: { ui_action: {} } },
      ],
    },
  ];

  static labels = {
    name: 'Name', icon: 'Icon', light: 'Light', climate: 'Thermostat',
    temperature: 'Temperature', humidity: 'Humidity', tap_action: 'Tap', hold_action: 'Long press',
  };

  static helpers = {
    light: 'The background takes its color when it is on',
    climate: 'The icon becomes a flame while the heating is on; its temperature is used when no sensor is set',
    tap_action: 'For example "Navigate" to #living-room to open a popup. Empty: more-info dialog',
    hold_action: 'Empty: turn the light on / off',
  };
}

class M3RoomCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-room-card-editor');
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states);
    const byClass = (dc) => entities.find((e) => e.startsWith('sensor.') && hass.states[e].attributes.device_class === dc);
    const config = { name: t(hass, 'Living room'), light: entities.find((e) => e.startsWith('light.')), temperature: byClass('temperature'), humidity: byClass('humidity') };
    for (const key of Object.keys(config)) if (!config[key]) delete config[key];
    return config;
  }

  setConfig(config) {
    if (!config || !config.name) throw new Error('m3-room-card: "name" is required');
    this._config = config;
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 4 }; }

  set hass(hass) {
    this._hass = hass;
    const c = this._config;
    // Ne redessine que si une des entités de la pièce a changé.
    const watched = [c.light, c.climate, c.temperature, c.humidity].map((e) => e && hass.states[e]);
    if (this._watched && watched.every((s, i) => s === this._watched[i])) return;
    this._watched = watched;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="top"><div class="icon"><ha-icon></ha-icon></div><div class="name"></div></div>
        <div class="climate"><span class="temp"></span><span class="hum"></span></div>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      name: root.querySelector('.name'),
      icon: root.querySelector('ha-icon'),
      temp: root.querySelector('.temp'),
      hum: root.querySelector('.hum'),
    };
    this._card.addEventListener('pointerdown', (e) => this._onDown(e));
    this._card.addEventListener('pointerup', () => this._onUp());
    this._card.addEventListener('pointerleave', () => this._cancel());
    this._card.addEventListener('pointercancel', () => this._cancel());
    this._card.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _number(value, decimals = 0) {
    return new Intl.NumberFormat(this._hass?.locale?.language ?? 'fr', { maximumFractionDigits: decimals }).format(value);
  }

  _render() {
    if (!this._card || !this._hass) return;
    const c = this._config;
    const states = this._hass.states;
    const light = c.light && states[c.light];
    const climate = c.climate && states[c.climate];
    const tempObj = c.temperature && states[c.temperature];
    const humObj = c.humidity && states[c.humidity];

    this._els.name.textContent = c.name;

    // Température du capteur, sinon celle mesurée par le thermostat.
    const temp = isNumber(tempObj) ? parseFloat(tempObj.state) : climate?.attributes.current_temperature;
    const hum = isNumber(humObj) ? parseFloat(humObj.state) : climate?.attributes.current_humidity;
    this._els.temp.textContent = temp != null ? `${this._number(temp)}°` : '';
    this._els.hum.textContent = hum != null ? `${this._number(hum)} %` : '';
    this.toggleAttribute('no-climate', temp == null && hum == null);

    // Chauffage en marche : le thermostat n'est pas éteint, même s'il ne chauffe pas à cet instant.
    const heating = climate && !['off', 'unavailable', 'unknown'].includes(climate.state);
    this._els.icon.icon = heating ? 'mdi:fire' : c.icon ?? 'mdi:home-outline';

    const st = this._card.style;
    let fg = ON_SURFACE;
    if (light?.state === 'on') {
      // Même ton pastel que le slider de lumière : la couleur de la lumière mélangée à 45 % de blanc.
      const [r, g, b] = (light.attributes.rgb_color ?? [255, 183, 77]).map((v) => Math.round(v + (255 - v) * PASTEL));
      fg = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? '#1c1b1f' : '#ffffff';
      st.setProperty('--m3-bg', `rgb(${r}, ${g}, ${b})`);
    } else {
      st.setProperty('--m3-bg', SURFACE);
    }
    st.setProperty('--m3-fg', fg);
    // Chauffage en marche : la flamme prend la couleur d'erreur du thème (rouge), plus foncée sur un fond clair.
    const heat = fg === '#1c1b1f' ? '#ba1a1a' : 'var(--md-sys-color-error, #ffb4ab)';
    st.setProperty('--m3-icon-fg', heating ? heat : fg);
  }

  _onDown(e) {
    if (e.button !== 0) return;
    this._down = true;
    this._held = false;
    this._holdTimer = setTimeout(() => {
      this._held = true;
      this._run('hold');
    }, HOLD_MS);
  }

  _onUp() {
    clearTimeout(this._holdTimer);
    if (this._down && !this._held) this._run('tap');
    this._down = false;
  }

  _cancel() {
    clearTimeout(this._holdTimer);
    this._down = false;
  }

  // Action configurée → gestion native de HA ; sinon appui = détails, appui long = lumière.
  _run(kind) {
    const c = this._config;
    const entity = c.light ?? c.climate ?? c.temperature;
    const configured = c[`${kind}_action`];
    this._fire('haptic', kind === 'hold' ? 'medium' : 'light');
    if (configured) {
      this._fire('hass-action', { config: { entity, [`${kind}_action`]: configured }, action: kind });
    } else if (kind === 'hold' && c.light && this._hass.states[c.light]) {
      this._hass.callService('light', 'toggle', { entity_id: c.light });
    } else if (entity) {
      this._fire('hass-more-info', { entityId: entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-room-card-editor', M3RoomCardEditor);

if (!customElements.get('m3-room-card')) {
  customElements.define('m3-room-card', M3RoomCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-room-card',
    name: 'M3 Room',
    description: t(null, 'Material 3 room: temperature, humidity, light color and heating'),
    preview: true,
  });
}
}

// ---- m3-scene-card.js ----
{
// m3-scene-card — sélecteur de scènes Material 3 : groupe de boutons, tuiles ou carrousel.
// La scène active (la dernière lancée) est mise en avant ; un bouton « Éteindre » est possible.
const STYLE = `
:host { display: block; }
ha-card { background: none; border: none; box-shadow: none; }
.items { display: flex; }
.item {
  position: relative; display: flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 0;
  background: var(--m3-bg); color: var(--m3-fg); --mdc-icon-size: 24px;
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transition: flex-grow 350ms cubic-bezier(0.2, 0, 0, 1), border-radius 350ms cubic-bezier(0.2, 0, 0, 1),
    background 300ms ease, color 300ms ease, transform 120ms ease, box-shadow 300ms ease;
}
.item:active { transform: scale(0.95); }
.name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.check { display: none; }

/* Groupe de boutons connectés (M3 Expressive) : la scène active s'élargit et affiche son nom ;
   seules les extrémités du groupe sont arrondies. */
:host([variant='group']) .items { gap: 4px; }
:host([variant='group']) .item { flex: 1 1 0; height: 64px; border-radius: 10px; gap: 8px; padding: 0 12px; }
:host([variant='group']) .item:first-child { border-radius: 32px 10px 10px 32px; }
:host([variant='group']) .item:last-child { border-radius: 10px 32px 32px 10px; }
:host([variant='group']) .item[active] { flex-grow: 2.4; }
:host([variant='group']) .name { display: none; font-size: 14px; font-weight: 550; }
:host([variant='group']) .item[active] .name { display: block; }

/* Tuiles : carrés avec le nom dessous ; la scène active a sa couleur pleine et un contour. */
:host([variant='tiles']) .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
:host([variant='tiles']) .item {
  aspect-ratio: 1; flex-direction: column; gap: 6px; border-radius: 20px; padding: 6px; --mdc-icon-size: 26px;
}
:host([variant='tiles']) .item[active] { box-shadow: 0 0 0 3px var(--md-sys-color-on-surface, var(--primary-text-color)); border-radius: 26px; }
:host([variant='tiles']) .name { font-size: 12px; font-weight: 500; max-width: 100%; }

/* Carrousel : grandes cartes en dégradé qui défilent horizontalement. */
:host([variant='carousel']) .items {
  gap: 8px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding-bottom: 2px;
}
:host([variant='carousel']) .items::-webkit-scrollbar { display: none; }
:host([variant='carousel']) .item {
  flex: none; width: 132px; height: 112px; border-radius: 28px; scroll-snap-align: start;
  flex-direction: column; align-items: flex-start; justify-content: space-between; padding: 16px;
  background: var(--m3-gradient); --mdc-icon-size: 26px;
}
:host([variant='carousel']) .name { ${TITLE_FONT} max-width: 100%; }
:host([variant='carousel']) .check { position: absolute; top: 14px; right: 14px; --mdc-icon-size: 22px; }
:host([variant='carousel']) .item[active] .check { display: flex; }
`;

const VARIANTS = ['group', 'tiles', 'carousel'];
const ON_COLOR = '#1c1b1f';
const PENDING_TTL = 5000;
const DEFAULT_COLORS = ['amber', 'purple', 'red', 'blue', 'pink', 'teal', 'green', 'deep-orange'];

class M3SceneCardEditor extends M3CardEditor {
  static schema = [
    {
      name: 'variant', selector: {
        select: {
          mode: 'box', options: [
            { value: 'group', label: 'Button group' },
            { value: 'tiles', label: 'Tiles' },
            { value: 'carousel', label: 'Carousel' },
          ],
        },
      },
    },
    {
      name: 'scenes', selector: {
        object: {
          multiple: true, label_field: 'name', description_field: 'entity',
          fields: {
            entity: { label: 'Scene', required: true, selector: { entity: { domain: ['scene', 'script'] } } },
            name: { label: 'Name', selector: { text: {} } },
            icon: { label: 'Icon', selector: { icon: {} } },
            color: { label: 'Color', selector: { ui_color: {} } },
          },
        },
      },
    },
    { name: 'off', selector: { entity: { domain: ['light', 'switch', 'group'] } } },
  ];

  static labels = { variant: 'Style', scenes: 'Scenes', off: '"Turn off" button' };

  static helpers = {
    off: 'Optional: adds a button that turns this entity off; when it is off, no scene is active',
  };
}

class M3SceneCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-scene-card-editor');
  }

  static getStubConfig(hass) {
    const scenes = Object.keys(hass.states).filter((e) => e.startsWith('scene.')).slice(0, 4);
    return { variant: 'group', scenes: scenes.map((entity) => ({ entity })) };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.scenes) || !config.scenes.length) {
      throw new Error('m3-scene-card: "scenes" must contain at least one scene');
    }
    if (config.variant && !VARIANTS.includes(config.variant)) {
      throw new Error(`m3-scene-card: "variant" must be one of ${VARIANTS.join(', ')}`);
    }
    if (config.scenes.some((s) => !s.entity)) throw new Error('m3-scene-card: every scene needs an "entity"');
    this._config = { variant: 'group', ...config };
    // `off` accepte une entité ou un objet { entity, name, icon, color }.
    this._off = typeof config.off === 'string' ? { entity: config.off } : config.off ?? null;
    this.setAttribute('variant', this._config.variant);
    this._build();
    if (this._hass) this._render();
  }

  getCardSize() { return this._config.variant === 'carousel' ? 3 : 2; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    const ids = [...this._config.scenes.map((s) => s.entity), this._off?.entity];
    const watched = ids.map((e) => e && hass.states[e]);
    if (this._watched && watched.every((s, i) => s === this._watched[i])) return;
    this._watched = watched;
    this._render();
  }

  _build() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><ha-card><div class="items"></div></ha-card>`;
    const list = root.querySelector('.items');
    const items = this._config.scenes.map((scene, i) => ({ ...scene, color: scene.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }));
    if (this._off) items.push({ icon: 'mdi:power', name: t(this._hass, 'Turn off'), color: 'disabled', ...this._off, isOff: true });
    this._items = items.map((item) => {
      const el = document.createElement('div');
      el.className = 'item';
      el.setAttribute('role', 'button');
      el.innerHTML = `<ha-state-icon></ha-state-icon><span class="name"></span>
        <ha-icon class="check" icon="mdi:check-circle"></ha-icon>`;
      el.addEventListener('click', () => this._activate(item));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._fire('hass-more-info', { entityId: item.entity });
      });
      list.appendChild(el);
      return { item, el, icon: el.querySelector('ha-state-icon'), name: el.querySelector('.name') };
    });
    this._watched = null;
  }

  // Scène active : la dernière lancée (l'état d'une scène est sa date d'activation), sauf si tout est éteint.
  _activeEntity() {
    const states = this._hass.states;
    if (this._pending && Date.now() < this._pending.until) return this._pending.entity;
    if (this._off) {
      const off = states[this._off.entity];
      if (!off || off.state === 'off') return this._off.entity;
    }
    let best = null;
    let bestTime = -Infinity;
    for (const { entity } of this._config.scenes) {
      const s = states[entity];
      const time = Date.parse(entity.startsWith('script.') ? s?.attributes.last_triggered : s?.state);
      if (time > bestTime) {
        bestTime = time;
        best = entity;
      }
    }
    return best;
  }

  _render() {
    if (!this._items || !this._hass) return;
    // L'attente se termine dès que HA confirme la scène lancée.
    if (this._pending && this._watched && this._pending.until > Date.now()) {
      const s = this._hass.states[this._pending.entity];
      const confirmed = this._pending.isOff ? s?.state === 'off' : s && s.state !== this._pending.previous;
      if (confirmed) this._pending = null;
    }
    const active = this._activeEntity();
    for (const { item, el, icon, name } of this._items) {
      const s = this._hass.states[item.entity];
      const isActive = item.entity === active;
      el.toggleAttribute('active', isActive);
      el.setAttribute('aria-pressed', String(isActive));
      el.title = item.name ?? s?.attributes.friendly_name ?? item.entity;
      name.textContent = el.title;
      Object.assign(icon, { hass: this._hass, stateObj: s, icon: item.icon });

      const color = cssColor(item.color);
      const pastel = `color-mix(in srgb, ${color} 62%, white)`;
      const st = el.style;
      if (this._config.variant === 'tiles' && !isActive) {
        // Tuiles inactives : ton atténué, l'icône garde la couleur de la scène.
        st.setProperty('--m3-bg', `color-mix(in srgb, ${color} 22%, var(--md-sys-color-surface-container-high, var(--card-background-color)))`);
        st.setProperty('--m3-fg', 'var(--md-sys-color-on-surface, var(--primary-text-color))');
      } else {
        st.setProperty('--m3-bg', pastel);
        st.setProperty('--m3-fg', ON_COLOR);
      }
      st.setProperty('--m3-gradient', `linear-gradient(135deg, ${pastel}, color-mix(in srgb, ${color} 85%, black))`);
    }
  }

  _activate(item) {
    this._fire('haptic', 'light');
    const s = this._hass.states[item.entity];
    this._pending = { entity: item.entity, isOff: !!item.isOff, previous: s?.state, until: Date.now() + PENDING_TTL };
    if (item.tap_action) {
      this._fire('hass-action', { config: { entity: item.entity, tap_action: item.tap_action }, action: 'tap' });
    } else if (item.isOff) {
      this._hass.callService('homeassistant', 'turn_off', { entity_id: item.entity });
    } else {
      const [domain] = item.entity.split('.');
      this._hass.callService(domain === 'script' ? 'script' : 'scene', 'turn_on', { entity_id: item.entity });
    }
    this._render();
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-scene-card-editor', M3SceneCardEditor);

if (!customElements.get('m3-scene-card')) {
  customElements.define('m3-scene-card', M3SceneCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-scene-card',
    name: 'M3 Scenes',
    description: t(null, 'Material 3 scene selector: button group, tiles or carousel, with the active scene highlighted'),
    preview: true,
  });
}
}

// ---- m3-thermostat-card.js ----
{
// m3-thermostat-card — carte thermostat Material 3 : consigne en grand entre deux boutons − / +
// avec affichage immédiat, mode et température actuelle en dessous, bouton marche/arrêt.
const STYLE = `
:host { display: block; height: 100%; }
ha-card {
  height: 100%; box-sizing: border-box; padding: 16px 20px 20px;
  border-radius: 28px; border: none; box-shadow: none;
  background: var(--m3-bg); color: var(--m3-fg);
  display: flex; flex-direction: column; gap: 4px;
  cursor: pointer; user-select: none; -webkit-user-select: none;
  transition: background 300ms ease, color 300ms ease;
}
button {
  font: inherit; color: inherit; border: none; background: none; padding: 0; margin: 0;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
button:focus-visible { outline: 2px solid var(--m3-primary); outline-offset: 2px; }
.header { display: flex; align-items: center; gap: 12px; min-height: 32px; }
.mode-icon { --mdc-icon-size: 20px; flex: none; }
.name { flex: 1; min-width: 0; ${TITLE_FONT} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.power {
  display: flex; align-items: center; gap: 6px; flex: none;
  height: 32px; padding: 0 14px 0 10px; border-radius: 16px;
  font-size: 0.875rem; font-weight: 500;
  border: var(--m3-chip-border); background: var(--m3-chip-bg); color: var(--m3-chip-fg);
  transition: background 300ms ease;
}
.power ha-icon { --mdc-icon-size: 18px; }
.controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.step {
  width: 80px; height: 52px; border-radius: 26px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: var(--md-sys-color-secondary-container, rgba(127, 127, 127, 0.15));
  color: var(--md-sys-color-on-secondary-container, var(--primary-text-color));
  transition: transform 100ms ease;
}
.step:active { transform: scale(0.94); }
.step ha-icon { --mdc-icon-size: 26px; }
.target {
  font-size: 4.5rem; font-weight: 400; line-height: 1.1; letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; text-align: center;
}
.status { text-align: center; ${STATE_FONT} }
:host([no-target]) .step { visibility: hidden; }
:host([off]) .target { opacity: 0.6; }
:host([unavailable]) ha-card { opacity: 0.5; pointer-events: none; }
`;

const SURFACE = 'var(--md-sys-color-surface-container-high, var(--ha-card-background, var(--card-background-color)))';
const ON_SURFACE = 'var(--md-sys-color-on-surface, var(--primary-text-color))';
const PRIMARY = 'var(--md-sys-color-primary, var(--primary-color))';
const ON_PRIMARY = 'var(--md-sys-color-on-primary, #fff)';
const SEND_DELAY = 600;
const PENDING_TTL = 8000;

const MODES = {
  heat: { icon: 'mdi:fire' },
  cool: { icon: 'mdi:snowflake' },
  heat_cool: { icon: 'mdi:sun-snowflake-variant' },
  auto: { icon: 'mdi:thermostat-auto' },
  dry: { icon: 'mdi:water-percent' },
  fan_only: { icon: 'mdi:fan' },
  off: { icon: 'mdi:power' },
};

const fmt = (n) => Number(n).toLocaleString(langOf(), { maximumFractionDigits: 1 });

class M3ThermostatCardEditor extends M3CardEditor {
  static schema = [
    { name: 'entity', required: true, selector: { entity: { filter: { domain: 'climate' } } } },
    {
      type: 'grid', name: '', schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'entity' } },
        { name: 'step', selector: { number: { min: 0.1, max: 5, step: 0.1, mode: 'box', unit_of_measurement: '°' } } },
        {
          name: 'hvac_mode',
          selector: {
            select: {
              mode: 'dropdown',
              options: Object.entries(MODES)
                .filter(([mode]) => mode !== 'off')
                .map(([value, { label }]) => ({ value, label })),
            },
          },
        },
      ],
    },
  ];

  static labels = {
    entity: 'Entity', name: 'Name', icon: 'Icon',
    step: 'Step of the − / + buttons', hvac_mode: 'Mode when turned on',
  };

  static helpers = {
    icon: 'Leave empty so the icon follows the mode',
    hvac_mode: 'Mode set by the on button (default: heat)',
  };
}

class M3ThermostatCard extends HTMLElement {
  static async getConfigElement() {
    await ensureHaForm();
    return document.createElement('m3-thermostat-card-editor');
  }


  setConfig(config) {
    if (!config || !config.entity || !config.entity.startsWith('climate.')) {
      throw new Error('m3-thermostat-card: "entity" must be a climate.* entity');
    }
    this._config = { step: 0.5, ...config };
    if (!this.shadowRoot) this._build();
    if (this._hass) this._render();
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('climate.')) || 'climate.example' };
  }

  getCardSize() { return 3; }

  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  set hass(hass) {
    this._hass = hass;
    const stateObj = hass.states[this._config.entity];
    if (stateObj === this._stateObj) return;
    this._stateObj = stateObj;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="header">
          <ha-icon class="mode-icon"></ha-icon>
          <div class="name"></div>
          <button class="power" aria-label="${t(this._hass, 'Turn on / off')}"><ha-icon icon="mdi:power"></ha-icon><span></span></button>
        </div>
        <div class="controls">
          <button class="step minus" aria-label="${t(this._hass, 'Lower the target')}"><ha-icon icon="mdi:minus"></ha-icon></button>
          <div class="target"></div>
          <button class="step plus" aria-label="${t(this._hass, 'Raise the target')}"><ha-icon icon="mdi:plus"></ha-icon></button>
        </div>
        <div class="status"></div>
      </ha-card>`;
    this._card = root.querySelector('ha-card');
    this._els = {
      power: root.querySelector('.power'),
      icon: root.querySelector('.mode-icon'),
      powerLabel: root.querySelector('.power span'),
      name: root.querySelector('.name'),
      target: root.querySelector('.target'),
      status: root.querySelector('.status'),
    };
    this._card.addEventListener('click', () => this._fire('hass-more-info', { entityId: this._config.entity }));
    this._els.power.addEventListener('click', (e) => { e.stopPropagation(); this._toggleMode(); });
    root.querySelector('.minus').addEventListener('click', (e) => { e.stopPropagation(); this._step(-1); });
    root.querySelector('.plus').addEventListener('click', (e) => { e.stopPropagation(); this._step(1); });
  }

  // Consigne réelle, remplacée par la valeur en attente tant que HA n'a pas confirmé.
  _target() {
    const real = this._stateObj?.attributes.temperature;
    const p = this._pending;
    if (p) {
      if (Date.now() < p.until && Math.abs((real ?? 0) - p.value) > 0.01) return p.value;
      if (!this._sendTimer) this._pending = null;
    }
    return real;
  }

  _render() {
    const s = this._stateObj;
    if (!s || !this._card) return;
    const a = s.attributes;
    const unavailable = s.state === 'unavailable' || s.state === 'unknown';
    const on = !unavailable && s.state !== 'off';
    const mode = MODES[s.state] ?? { icon: 'mdi:thermostat' };
    const target = this._target();

    this.toggleAttribute('unavailable', unavailable);
    this.toggleAttribute('off', !on);
    this.toggleAttribute('no-target', target == null);
    this._els.name.textContent = this._config.name ?? a.friendly_name ?? this._config.entity;
    this._els.icon.icon = this._config.icon ?? mode.icon;
    this._els.powerLabel.textContent = t(this._hass, on ? 'On' : 'Off');
    this._els.target.textContent = target == null ? '—' : fmt(target);
    // Nom du mode traduit par Home Assistant (l'état d'un thermostat est son mode).
    const parts = [unavailable ? t(this._hass, 'Unavailable') : (this._hass.formatEntityState?.(s) ?? s.state)];
    if (a.current_temperature != null) parts.push(`${fmt(a.current_temperature)} °C`);
    this._els.status.textContent = parts.join(' • ');

    const st = this._card.style;
    st.setProperty('--m3-primary', PRIMARY);
    st.setProperty('--m3-bg', on ? 'var(--md-sys-color-primary-container, rgba(var(--rgb-primary-color), 0.18))' : SURFACE);
    st.setProperty('--m3-fg', on ? 'var(--md-sys-color-on-primary-container, var(--primary-text-color))' : ON_SURFACE);
    st.setProperty('--m3-chip-bg', on ? PRIMARY : 'transparent');
    st.setProperty('--m3-chip-fg', on ? ON_PRIMARY : 'inherit');
    st.setProperty('--m3-chip-border', on ? 'none' : '1px solid var(--md-sys-color-outline, rgba(127, 127, 127, 0.5))');
  }

  // Chaque appui part de la dernière valeur affichée ; une seule commande part après le dernier appui.
  _step(direction) {
    const a = this._stateObj?.attributes;
    const current = this._target();
    if (!a || current == null) return;
    const step = Number(this._config.step);
    const raw = Math.round((current + direction * step) / step) * step;
    const value = Math.max(a.min_temp ?? -Infinity, Math.min(a.max_temp ?? Infinity, Number(raw.toFixed(2))));
    this._pending = { value, until: Date.now() + PENDING_TTL };
    this._fire('haptic', 'light');
    this._render();
    clearTimeout(this._sendTimer);
    this._sendTimer = setTimeout(() => {
      this._sendTimer = null;
      this._hass.callService('climate', 'set_temperature', { entity_id: this._config.entity, temperature: value });
    }, SEND_DELAY);
  }

  _toggleMode() {
    const s = this._stateObj;
    if (!s) return;
    const modes = s.attributes.hvac_modes ?? [];
    const onMode = this._config.hvac_mode ?? (modes.includes('heat') ? 'heat' : modes.find((m) => m !== 'off'));
    const hvacMode = s.state === 'off' ? onMode : 'off';
    if (!hvacMode) return;
    this._fire('haptic', 'light');
    this._hass.callService('climate', 'set_hvac_mode', { entity_id: this._config.entity, hvac_mode: hvacMode });
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

defineEditor('m3-thermostat-card-editor', M3ThermostatCardEditor);

if (!customElements.get('m3-thermostat-card')) {
  customElements.define('m3-thermostat-card', M3ThermostatCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'm3-thermostat-card',
    name: 'M3 Thermostat',
    description: t(null, 'Material 3 thermostat with an adjustable target and instant feedback'),
    preview: true,
  });
}
}

// ---- m3-weather-card.js ----
{
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
}
