import { isPrerelease } from './versions.js';

export type IconBaseName = 'icon' | 'icon-rc';

/**
 * Nom (sans extension) des fichiers d'icône de `src/pictures` : une pré-version
 * (`X.Y.Z-rcN`) a sa propre icône, avec un badge « RC », pour ne pas la confondre
 * avec la version normale.
 */
export function iconBaseName(version: string): IconBaseName {
  return isPrerelease(version) ? 'icon-rc' : 'icon';
}
