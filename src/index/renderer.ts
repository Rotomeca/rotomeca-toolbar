import '../scripts/ds.js';
import type { RdsIconButton } from '../types/rds.js';
import { requireElement } from '../scripts/dom.js';
import { appEventList, pageEventList } from '../shared/ipc/events.js';

/** Bouton qui permet d'afficher la barre ou de la cacher. */
const button = requireElement<RdsIconButton>('#main');

const toggleToolbar = (): void => {
  window.api.invoke(appEventList.toggleToolbar).catch(console.error);
};

// Lorsque l'état du bouton change, on bascule la barre côté processus principal
button.addEventListener('rds-icon-button:toggle', toggleToolbar);

// Un clic droit fait passer le bouton sous les autres fenêtres pendant un moment
button.addEventListener('contextmenu', () => {
  window.api.invoke(appEventList.timeoutStopTop).catch(console.error);
});

// La molette fait passer le bouton sous les autres fenêtres, ou le remet au premier plan
button.addEventListener('auxclick', (event) => {
  if (event.button === 1) window.api.invoke(appEventList.toggleStopTop).catch(console.error);
});

button.setAttribute('title', window.api.t('toolbar.sendBack'));

// Simule le clic du bouton pour fermer la barre
window.api.on(pageEventList.toolbarClosed, () => {
  button.selected = !button.selected;
  toggleToolbar();
});
