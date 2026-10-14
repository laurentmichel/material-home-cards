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
