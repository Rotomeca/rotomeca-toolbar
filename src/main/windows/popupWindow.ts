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

/** Envoie un message à la page de la fenêtre, une fois sa page chargée. */
export function postWhenLoaded(window: PopupWindow, channel: string, payload: unknown): void {
  const send = (): void => window.webContents.postMessage(channel, payload);

  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send);
  else send();
}
