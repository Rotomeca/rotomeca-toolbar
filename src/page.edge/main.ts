/**
 * Zone sensible du bord gauche de l'écran : l'entrée de la souris demande l'ouverture de la barre.
 *
 * Chargé par la fenêtre du bord (`src/page.edge/`), invisible et fine. Dépend du processus principal,
 * qui ouvre la barre et masque cette fenêtre tant que la barre est ouverte.
 */
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList } from '../shared/ipc/events.js';

// L'entrée de la souris dans la zone du bord gauche ouvre la barre. Le
// processus principal cache cette fenêtre dès que la barre est ouverte.
let notified = false;

document.documentElement.addEventListener('mouseenter', () => {
  if (notified) return;
  notified = true;
  window.api.invoke(appEventList.edgeEnter).catch(console.error);
});

// La fenêtre est réaffichée à chaque fermeture de la barre
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') notified = false;
});
// Si la fenêtre n'a pas changé de visibilité (ré-affichage immédiat)
window.addEventListener('mouseleave', () => {
  notified = false;
});
