import '../scripts/ds.js';
import { appEventList } from '../shared/ipc/events.js';
import { pageEventList } from '../shared/ipc/events.js';

/**
 * Bouton qui permet d'afficher la toolbar ou de la cacher
 * @type {HTMLElement}
 * @private
 */
let button = document.querySelector('#main');
//Lorsque l'état du bouton à changer, appeler côté back, le toggle de la toolbar
button.addEventListener('rds-icon-button:toggle', () => {
  window.api.invoke(appEventList.toggleToolbar);
});
//Lorsque l'on fait un clic droit, le bouton arrête d'être en premier temps pendant x temps
button.addEventListener('contextmenu', () => {
  window.api.invoke(appEventList.timeoutStopTop);
});
// Lorsque l'on clique sur la molette, soit le bouton arrête d'être en premier plan, sois est toujours au premier plan
button.onauxclick = (e) => {
  if (e.button === 1) {
    window.api.invoke(appEventList.toggleStopTop);
  }
};
button.setAttribute('title', window.api.t('toolbar.sendBack'));

//Simuler le click du bouton pour fermer la toolbar
window.api.on(pageEventList.toolbarClosed, () => {
  button.selected = !button.selected;
  window.api.invoke(appEventList.toggleToolbar);
});
