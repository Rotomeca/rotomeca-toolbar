/**
 * Page du menu contextuel d'un bouton de la barre : une liste de boutons d'actions.
 *
 * Chargée par la fenêtre du menu contextuel (`src/page.contextmenu/`). Dépend du processus principal,
 * qui pose la liste des entrées sur `window.electron.menu` et exécute l'action choisie.
 */
// [ds.ts] Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages
import '../scripts/ds.js';
// [rds.d.ts] Types des composants `rds-*` du design system utilisés par les pages
import type { RdsButton } from '../types/rds.js';
// [dom.ts] Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire
import { requireElement } from '../scripts/dom.js';
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { ContextMenuItem } from '../shared/dto.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList } from '../shared/ipc/events.js';

/** Délai entre deux vérifications de la présence du menu, en millisecondes. */
const POLL_INTERVAL_MS = 10;

/** Attend que le processus principal ait posé la liste des boutons. */
async function waitForMenu(): Promise<readonly ContextMenuItem[]> {
  while (!window.electron?.menu) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return window.electron.menu;
}

/** Appelle l'action du processus principal qui correspond au bouton choisi. */
async function runAction({ action, data }: Pick<ContextMenuItem, 'action' | 'data'>): Promise<void> {
  const url = data.url ?? '';

  switch (action) {
    case 'delete':
      return window.api.invoke(appEventList.appDelete, url);
    case 'edit':
      return window.api.invoke(appEventList.appEdit, {
        url,
        ...(data.picture === undefined ? {} : { picture: data.picture }),
        ...(data.title ? { title: data.title } : {}),
      });
    case 'addseparator':
      return window.api.invoke(appEventList.requestAddSeparator, url);
    case 'goUp':
      return window.api.invoke(appEventList.requestMovement, { url, type: 'up' });
    case 'goDown':
      return window.api.invoke(appEventList.requestMovement, { url, type: 'down' });
    case 'toggleMute':
      return window.api.invoke(appEventList.toggleMute, { url });
  }
}

/**
 * Crée le bouton d'une entrée du menu.
 * @param item Entrée du menu
 * @returns Le bouton, qui lance l'action de l'entrée au clic
 */
function createButton(item: ContextMenuItem): RdsButton {
  const button = document.createElement('rds-button') as RdsButton;
  button.setAttribute('variant', 'primary');
  button.setAttribute('size', 'sm');
  button.textContent = item.text;
  button.setAttribute('title', item.title);
  button.addEventListener('click', () => {
    runAction(item).catch(console.error);
  });

  if (item.disabled) button.disabled = true;

  return button;
}

/** Conteneur dans lequel sont ajoutés les boutons du menu. */
const layout = requireElement('#layout');
for (const item of await waitForMenu()) layout.appendChild(createButton(item));
