/** Ce que le contrôle lit d'un évènement IPC (un sous-ensemble de `IpcMainInvokeEvent`). */
export interface IpcOrigin {
  readonly senderFrame: { readonly url: string } | null;
  readonly sender: { readonly mainFrame: unknown };
}

/**
 * Seule la page principale d'une fenêtre locale (`file://`) peut appeler l'IPC :
 * ni un sous-cadre (iframe), ni un site distant.
 */
export function isTrustedSender(event: IpcOrigin): boolean {
  const frame = event.senderFrame;
  return !!frame && frame === event.sender.mainFrame && frame.url.startsWith('file://');
}
