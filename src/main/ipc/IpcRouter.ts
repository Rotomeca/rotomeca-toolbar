/**
 * Routeur des appels IPC des pages vers le processus principal, avec contrôle de l'origine et de la page.
 *
 * Utilisé par `App` pour enregistrer tous ses canaux : aucun traitement n'est atteint sans passer
 * par `isTrustedSender`, puis par la table des pages autorisées (`channelAccess`). Dépend d'un port minimal plutôt que d'`ipcMain`, pour les tests.
 */
// [trustedSender.ts] Contrôle de l'origine d'un appel IPC : seule la page principale d'une fenêtre locale est de confiance
import { isTrustedSender } from './trustedSender.js';
import type { IpcOrigin } from './trustedSender.js';
// [channelAccess.ts] Qui peut appeler quoi : pour chaque canal IPC des pages, les seules fenêtres autorisées à l'appeler
import { isChannelAllowed } from './channelAccess.js';
import type { PageName } from './channelAccess.js';

/** Ce que le routeur demande à `ipcMain`. */
export interface IpcMainPort<E extends IpcOrigin> {
  handle(channel: string, listener: (event: E, ...args: unknown[]) => unknown): void;
}

/** Traitement d'un appel IPC : reçoit l'évènement puis les arguments, et peut retourner une valeur. */
export type IpcHandler<E> = (event: E, ...args: unknown[]) => unknown;

/**
 * Point d'entrée unique des appels des pages vers le processus principal : un appel ne
 * parvient à son traitement que s'il vient de la page principale d'une page de l'application.
 */
export class IpcRouter<E extends IpcOrigin> {
  /**
   * @param ipc Port `ipcMain` sur lequel enregistrer les canaux
   * @param appRoot Racine de l'application construite : seules ses pages peuvent appeler l'IPC
   * @param pageOf Fenêtre d'où vient un appel, d'après l'identifiant de son contenu web (`undefined` si inconnue)
   * @param warn Journalise un appel refusé (message et origine de l'appelant)
   */
  constructor(
    private readonly ipc: IpcMainPort<E>,
    private readonly appRoot: string,
    private readonly pageOf: (webContentsId: number) => PageName | undefined,
    private readonly warn: (message: string, origin: string | undefined) => void = console.warn,
  ) {}

  /** Traite les appels sur ce canal ; un appel refusé reçoit `undefined`. */
  handle(channel: string, handler: IpcHandler<E>): this {
    this.ipc.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event, this.appRoot)) {
        this.warn(`IPC '${channel}' refusé depuis`, event.senderFrame?.url);
        return undefined;
      }

      const page = this.pageOf(event.sender.id);
      if (!isChannelAllowed(channel, page)) {
        this.warn(`IPC '${channel}' refusé à la page '${page ?? 'inconnue'}'`, event.senderFrame?.url);
        return undefined;
      }

      return handler(event, ...args);
    });

    return this;
  }
}
