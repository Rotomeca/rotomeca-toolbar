import '../scripts/ds.js';
import { pageEventList } from '../shared/ipc/events.js';

// Infobulle de la barre : affiche le texte (et un badge facultatif) reçu du processus principal
window.api.on(pageEventList.tooltipState, (_, { text, badge }) => {
  document.getElementById('text').textContent = text;

  const badgeNode = document.getElementById('badge');
  badgeNode.hidden = !badge;
  badgeNode.textContent = badge ?? '';
});
