// Couleurs nommées de HA (amber, blue...) → variables du thème ; le reste (hex, rgb) tel quel.
const HA_COLORS = new Set([
  'primary', 'accent', 'red', 'pink', 'purple', 'deep-purple', 'indigo', 'blue', 'light-blue', 'cyan', 'teal',
  'green', 'light-green', 'lime', 'yellow', 'amber', 'orange', 'deep-orange', 'brown', 'light-grey', 'grey',
  'dark-grey', 'blue-grey', 'black', 'white', 'disabled',
]);
const cssColor = (c) => (HA_COLORS.has(c) ? `var(--${c}-color)` : c);
