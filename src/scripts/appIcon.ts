/**
 * Choisit l'icône de l'application selon que la version est une pré-version ou non.
 *
 * Utilisé par le processus principal pour la fenêtre, la zone de notification et
 * l'installeur ; dépend seulement de `versions`.
 */
// [versions.ts] Numéros de version : comparaison et détection des pré-versions (`X.Y.Z-rcN`)
import { isPrerelease } from './versions.js';

/** Nom (sans extension) d'un fichier d'icône de `src/pictures`. */
export type IconBaseName = 'icon' | 'icon-rc';

/**
 * Nom (sans extension) des fichiers d'icône de `src/pictures` : une pré-version
 * (`X.Y.Z-rcN`) a sa propre icône, avec un badge « RC », pour ne pas la confondre
 * avec la version normale.
 * @param version Numéro de version de l'application
 * @returns `icon-rc` pour une pré-version, `icon` sinon
 */
export function iconBaseName(version: string): IconBaseName {
  return isPrerelease(version) ? 'icon-rc' : 'icon';
}
