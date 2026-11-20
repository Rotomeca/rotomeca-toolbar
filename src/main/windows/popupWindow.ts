/**
 * Contrat minimal des fenêtres flottantes et envoi d'un message une fois leur page chargée.
 *
 * Utilisé par `TooltipPopup` et `MediaPopup`, qui dépendent de cette interface plutôt que de
 * `BrowserWindow` pour rester testables sans Electron.
 */

/** Ce que les infobulles flottantes demandent à leur fenêtre (un sous-ensemble de `BrowserWindow`). */
export interface PopupWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  hide(): void;
  showInactive(): void;
  setPosition(x: number, y: number): void;
  readonly webContents: {
    isLoading(): boolean;
    once(event: 'did-finish-load', listener: () => void): unknown;
    postMessage(channel: string, payload: unknown): void;
  };
}

/**
 * Envoie un message à la page de la fenêtre, une fois sa page chargée.
 * @param window Fenêtre destinataire
 * @param channel Canal IPC de la page
 * @param payload Données à transmettre
 */
export function postWhenLoaded(window: PopupWindow, channel: string, payload: unknown): void {
  const send = (): void => window.webContents.postMessage(channel, payload);

  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
  else send();
}
