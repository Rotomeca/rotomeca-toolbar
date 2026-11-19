/**
 * Routeur des appels IPC des pages vers le processus principal, avec contrôle de l'origine.
 *
 * Utilisé par `App` pour enregistrer tous ses canaux : aucun traitement n'est atteint sans passer
 * par `isTrustedSender`. Dépend d'un port minimal plutôt que d'`ipcMain`, pour les tests.
 */
// [trustedSender.ts] Contrôle de l'origine d'un appel IPC : seule la page principale d'une fenêtre locale est de confiance
import { isTrustedSender } from './trustedSender.js';
import type { IpcOrigin } from './trustedSender.js';

/** Ce que le routeur demande à `ipcMain`. */
export interface IpcMainPort<E extends IpcOrigin> {
  handle(channel: string, listener: (event: E, ...args: unknown[]) => unknown): void;
}

/** Traitement d'un appel IPC : reçoit l'évènement puis les arguments, et peut retourner une valeur. */
export type IpcHandler<E> = (event: E, ...args: unknown[]) => unknown;

/**
 * Point d'entrée unique des appels des pages vers le processus principal : un appel ne
 * parvient à son traitement que s'il vient de la page principale d'une fenêtre locale.
 */
export class IpcRouter<E extends IpcOrigin> {
  /**
   * @param ipc Port `ipcMain` sur lequel enregistrer les canaux
   * @param warn Journalise un appel refusé (message et origine de l'appelant)
   */
  constructor(
    private readonly ipc: IpcMainPort<E>,
    private readonly warn: (message: string, origin: string | undefined) => void = console.warn,
  ) {}

  /** Traite les appels sur ce canal ; un appel refusé reçoit `undefined`. */
  handle(channel: string, handler: IpcHandler<E>): this {
    this.ipc.handle(channel, (event, ...args) => {
      if (!isTrustedSender(event)) {
        this.warn(`IPC '${channel}' refusé depuis`, event.senderFrame?.url);
        return undefined;
      }

      return handler(event, ...args);
    });

    return this;
  }
}
