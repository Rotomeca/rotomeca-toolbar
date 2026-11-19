import '../scripts/ds.js';
import type { RdsButton } from '../types/rds.js';
import { requireElement } from '../scripts/dom.js';
import type { ContextMenuItem } from '../shared/dto.js';
import { appEventList } from '../shared/ipc/events.js';

declare global {
  interface Window {
    /** Posé par le processus principal juste après le chargement de la page. */
    electron?: { menu?: readonly ContextMenuItem[] };
  }
}

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
      return window.api.invoke(appEventList.appEdit, { url, picture: data.picture, title: data.title ?? undefined });
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

const layout = requireElement('#layout');
for (const item of await waitForMenu()) layout.appendChild(createButton(item));
