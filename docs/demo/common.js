// Doublures minimales des éléments de Home Assistant utilisés par les cartes, pour les pages de démo.
customElements.define('ha-icon', class extends HTMLElement {
  static get observedAttributes() { return ['icon']; }
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  set icon(v) { this._icon = v; this.draw(); }
  get icon() { return this._icon ?? this.getAttribute('icon'); }
  connectedCallback() { this.draw(); }
  attributeChangedCallback() { this.draw(); }
  // Styles par défaut dans le shadow root, comme HA : les cartes peuvent les surcharger (display: none…).
  draw() {
    const path = window.MDI[this.icon] ?? '';
    this.shadowRoot.innerHTML = `<style>:host{display:inline-flex;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}</style>
      <svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" d="${path}"/></svg>`;
  }
});
customElements.define('ha-state-icon', class extends customElements.get('ha-icon') {});
customElements.define('ha-card', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:block}</style><slot></slot>';
  }
});

// Faux hass : états fournis par la page, aucun appel réel.
window.fakeHass = (states) => ({ states, locale: { language: 'en' }, callService() {} });

// Hauteur du contenu, lue par render.mjs pour cadrer la capture.
window.addEventListener('load', () => setTimeout(() => {
  document.body.setAttribute('data-h', Math.ceil(document.body.getBoundingClientRect().height));
}, 500));
