/**
 * Type de `window.api`, l'API exposée aux pages par le preload.
 *
 * Utilisé par tous les scripts de page. Dépend des contrats IPC de `src/shared/ipc/`.
 */
import type { InvokeArgs, InvokeResult, PushArgs } from '../shared/ipc/contracts.js';
import type { InvokeChannel, PushChannel } from '../shared/ipc/events.js';

/**
 * `window.api` : l'API exposée aux pages par le preload (`contextBridge`).
 * Les canaux sont ceux de `src/shared/ipc/events.ts` : un autre nom est une erreur de type,
 * et le preload refuse de toute façon un canal qui n'y figure pas.
 */
export interface RotomecaApi {
  /** Langue de l'interface (`fr`, `en`). */
  readonly locale: string;

  /** Traduit une clé pour les textes générés par les scripts de la page. */
  t(key: string, variables?: Readonly<Record<string, string | number>>): string;

  /**
   * Appelle un canal du processus principal.
   * @returns La réponse du gestionnaire ; la promesse est rejetée si le canal n'est pas autorisé
   */
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>;

  /**
   * Écoute un canal envoyé par le processus principal. L'évènement IPC n'est
   * jamais transmis : le premier argument du rappel vaut toujours `null`.
   * @returns La fonction de désabonnement
   */
  on<C extends PushChannel>(channel: C, callback: (event: null, ...args: PushArgs<C>) => void): () => void;
}

/** Ajoute `api` à l'objet `window` des pages. */
declare global {
  interface Window {
    readonly api: RotomecaApi;
  }
}
