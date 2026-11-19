const { isPrerelease } = require('./versions.js');

/**
 * Nom (sans extension) des fichiers d'icône de `src/pictures` : une pré-version
 * (`X.Y.Z-rcN`) a sa propre icône, avec un badge « RC », pour ne pas la confondre
 * avec la version normale.
 * @param {string} version
 * @returns {'icon'|'icon-rc'}
 */
function iconBaseName(version) {
  return isPrerelease(version) ? 'icon-rc' : 'icon';
}

module.exports = { iconBaseName };
