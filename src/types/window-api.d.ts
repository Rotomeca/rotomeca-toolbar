/**
 * `window.api` : l'API exposée aux pages par le preload (`contextBridge`).
 * Les canaux sont filtrés par une liste blanche côté preload.
 */
interface RotomecaApi {
  /** Langue de l'interface (`fr`, `en`). */
  readonly locale: string;

  /** Traduit une clé pour les textes générés par les scripts de la page. */
  t(key: string, variables?: Readonly<Record<string, string | number>>): string;

  /**
   * Appelle un canal du processus principal.
   * @returns `undefined` (et non une promesse) si le canal n'est pas autorisé
   */
  invoke(channel: string, ...data: unknown[]): Promise<unknown> | undefined;

  /**
   * Écoute un canal envoyé par le processus principal. L'évènement IPC n'est
   * jamais transmis : le premier argument du rappel vaut toujours `null`.
   * @returns La fonction de désabonnement
   */
  on(channel: string, callback: (event: null, ...args: unknown[]) => void): () => void;
}

interface Window {
  readonly api: RotomecaApi;
}
