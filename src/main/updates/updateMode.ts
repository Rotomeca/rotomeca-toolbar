import type { UpdateChannel } from '../../scripts/UpdateManager.js';

/** Ce qui détermine comment l'application se met à jour. */
export interface UpdateEnvironment {
  /** Lancée en mode développement (`--dev`). */
  readonly isDev: boolean;
  /** Application empaquetée (pas lancée depuis les sources). */
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
  /** La simulation d'un cycle de mise à jour est demandée (développement seulement). */
  readonly simulateRequested: boolean;
}

export interface UpdateMode {
  /** Simule un cycle complet, sans réseau (développement). */
  readonly simulate: boolean;
  /** Squirrel télécharge et installe les mises à jour. */
  readonly squirrel: boolean;
  /** Pas d'installation automatique : on compare avec GitHub et on ouvre la page de la release. */
  readonly manual: boolean;
}

/** Plateformes où Squirrel installe les mises à jour. */
const SQUIRREL_PLATFORMS: readonly NodeJS.Platform[] = ['win32', 'darwin'];

/** @returns Le mode de mise à jour de cet environnement */
export function resolveUpdateMode({ isDev, isPackaged, platform, simulateRequested }: UpdateEnvironment): UpdateMode {
  const packaged = !isDev && isPackaged;

  return {
    simulate: isDev && simulateRequested,
    squirrel: packaged && SQUIRREL_PLATFORMS.includes(platform),
    manual: packaged && platform === 'linux',
  };
}

export interface FeedSwitcherOptions {
  /** Serveur des versions publiées. */
  readonly stableUrl: string;
  /** Serveur des pré-versions, `null` s'il n'existe pas. */
  readonly testUrl: string | null;
  readonly platform: NodeJS.Platform;
  readonly version: string;
  /** Donne à Squirrel l'adresse à interroger. */
  readonly apply: (url: string) => void;
}

/** @returns L'adresse interrogée par Squirrel : `<serveur>/update/<plateforme>/<version>` */
export function feedUrlFor(baseUrl: string, platform: NodeJS.Platform, version: string): string {
  return `${baseUrl}/update/${platform}/${version}`;
}

/**
 * Crée la fonction qui oriente Squirrel vers le serveur des versions publiées ou celui des
 * pré-versions.
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
