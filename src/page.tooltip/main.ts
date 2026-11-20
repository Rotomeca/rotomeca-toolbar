/**
 * Infobulle de la barre : texte et badge facultatif affichés à côté d'un bouton.
 *
 * Chargé par la fenêtre d'infobulle (`src/page.tooltip/`). Dépend du processus principal,
 * qui envoie le contenu à afficher.
 */
// [ds.ts] Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages
import '../scripts/ds.js';
// [dom.ts] Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire
import { requireElement } from '../scripts/dom.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { pageEventList } from '../shared/ipc/events.js';

// Infobulle de la barre : affiche le texte (et un badge facultatif) reçu du processus principal
window.api.on(pageEventList.tooltipState, (_, { text, badge }) => {
  requireElement('#text').textContent = text;

  const badgeNode = requireElement('#badge');
  badgeNode.hidden = !badge;
  badgeNode.textContent = badge ?? '';
});
