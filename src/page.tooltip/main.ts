import '../scripts/ds.js';
import { requireElement } from '../scripts/dom.js';
import { pageEventList } from '../shared/ipc/events.js';

// Infobulle de la barre : affiche le texte (et un badge facultatif) reçu du processus principal
window.api.on(pageEventList.tooltipState, (_, { text, badge }) => {
  requireElement('#text').textContent = text;

  const badgeNode = requireElement('#badge');
  badgeNode.hidden = !badge;
  badgeNode.textContent = badge ?? '';
});
