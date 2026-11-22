/**
 * Choix du mode de mise à jour (simulé, Squirrel, AppImage, manuel) et de l'adresse du serveur interrogé.
 *
 * Utilisé par `createUpdateManager.ts`. Pur, sans Electron : testable avec n'importe quelle plateforme.
 */
// [UpdateManager.ts] Gestionnaire de mises à jour : Squirrel, AppImage, GitHub (Linux) et canal de pré-versions
import type { UpdateChannel } from '../../scripts/UpdateManager.js';

/** Ce qui détermine comment l'application se met à jour. */
export interface UpdateEnvironment {
  /** Lancée en mode développement (`--dev`). */
  readonly isDev: boolean;
  /** Application empaquetée (pas lancée depuis les sources). */
  readonly isPackaged: boolean;
  /** Plateforme d'exécution. */
  readonly platform: NodeJS.Platform;
  /** Lancée depuis une AppImage (variable `APPIMAGE` renseignée par son lanceur). */
  readonly appImage?: boolean;
  /** La simulation d'un cycle de mise à jour est demandée (développement seulement). */
  readonly simulateRequested: boolean;
}

/** Façon dont l'application se met à jour dans un environnement donné. */
export interface UpdateMode {
  /** Simule un cycle complet, sans réseau (développement). */
  readonly simulate: boolean;
  /** Squirrel télécharge et installe les mises à jour. */
  readonly squirrel: boolean;
  /** electron-updater télécharge et remplace l'AppImage (Linux). */
  readonly appImage: boolean;
  /** Pas d'installation automatique : on compare avec GitHub et on ouvre la page de la release. */
  readonly manual: boolean;
}

/**
 * @param environment Contexte de lancement (développement, paquet, plateforme).
 * @returns Le mode de mise à jour de cet environnement
 */
export function resolveUpdateMode({
  isDev,
  isPackaged,
  platform,
  appImage = false,
  simulateRequested,
}: UpdateEnvironment): UpdateMode {
  const packaged = !isDev && isPackaged;
  const linux = packaged && platform === 'linux';

  return {
    simulate: isDev && simulateRequested,
    squirrel: packaged && platform === 'win32',
    appImage: linux && appImage,
    manual: linux && !appImage,
  };
}

/** Paramètres de `createFeedSwitcher`. */
export interface FeedSwitcherOptions {
  /** Serveur des versions publiées. */
  readonly stableUrl: string;
  /** Serveur des pré-versions, `null` s'il n'existe pas. */
  readonly testUrl: string | null;
  /** Plateforme, incluse dans l'adresse interrogée. */
  readonly platform: NodeJS.Platform;
  /** Version actuelle de l'application, incluse dans l'adresse interrogée. */
  readonly version: string;
  /** Donne à Squirrel l'adresse à interroger. */
  readonly apply: (url: string) => void;
}

/**
 * @param baseUrl Adresse du serveur.
 * @param platform Plateforme de l'application.
 * @param version Version actuelle de l'application.
 * @returns L'adresse interrogée par Squirrel : `<serveur>/update/<plateforme>/<version>` */
export function feedUrlFor(baseUrl: string, platform: NodeJS.Platform, version: string): string {
  return `${baseUrl}/update/${platform}/${version}`;
}

/**
 * Crée la fonction qui oriente Squirrel vers le serveur des versions publiées ou celui des
 * pré-versions.
 *
 * @param options Adresses des serveurs, plateforme, version et fonction qui transmet l'adresse à Squirrel.
 * @returns Une fonction qui change de serveur ; elle ne fait rien pour `test` sans serveur de test
 */
export function createFeedSwitcher({
  stableUrl,
  testUrl,
  platform,
  version,
  apply,
}: FeedSwitcherOptions): (channel: UpdateChannel) => void {
  return (channel) => {
    const baseUrl = channel === 'test' ? testUrl : stableUrl;
    if (baseUrl) apply(feedUrlFor(baseUrl, platform, version));
  };
}
