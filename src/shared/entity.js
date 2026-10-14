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
