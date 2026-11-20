/**
 * Script du bouton d'ouverture : affiche ou cache la barre, ou le passe sous les autres fenêtres.
 *
 * Chargé par la petite fenêtre du bouton (`src/index/`). Dépend du design system (`rds-icon-button`)
 * et du processus principal, joint par `window.api`, qui ouvre ou ferme la barre.
 */
// [ds.ts] Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages
import '../scripts/ds.js';
// [rds.d.ts] Types des composants `rds-*` du design system utilisés par les pages
import type { RdsIconButton } from '../types/rds.js';
// [dom.ts] Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire
import { requireElement } from '../scripts/dom.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList, pageEventList } from '../shared/ipc/events.js';

/** Bouton qui permet d'afficher la barre ou de la cacher. */
const button = requireElement<RdsIconButton>('#main');

/** Demande au processus principal d'ouvrir la barre si elle est fermée, de la fermer sinon. */
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
