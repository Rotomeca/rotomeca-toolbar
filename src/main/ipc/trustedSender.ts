/**
 * Contrôle de l'origine d'un appel IPC : seule la page principale d'une page locale de l'application est de confiance.
 *
 * Utilisé par `IpcRouter` ; garde les sites tiers, les sous-cadres et les fichiers étrangers à l'application hors de l'IPC.
 */
// [localPageGuard.ts] Garde des pages locales de l'application : seules les pages du paquet sont de confiance
import { isLocalPageUrl } from '../security/localPageGuard.js';

/** Ce que le contrôle lit d'un évènement IPC (un sous-ensemble de `IpcMainInvokeEvent`). */
export interface IpcOrigin {
  readonly senderFrame: { readonly url: string } | null;
  readonly sender: { readonly mainFrame: unknown; readonly id: number };
}

/**
 * Seule la page principale d'une page de l'application peut appeler l'IPC :
 * ni un sous-cadre (iframe), ni un site distant, ni un autre fichier `file:` du disque.
 *
 * @param event Évènement IPC reçu
 * @param appRoot Racine de l'application construite
 */
export function isTrustedSender(event: IpcOrigin, appRoot: string): boolean {
  const frame = event.senderFrame;
  return !!frame && frame === event.sender.mainFrame && isLocalPageUrl(frame.url, appRoot);
}
