/**
 * Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire.
 *
 * Utilisé par tous les scripts des pages (`src/page.*`, `src/index/`). Ne dépend de rien.
 */

/** Un élément attendu par un script de page est absent de son HTML. */
export class MissingElementError extends Error {
  /** @param selector Sélecteur de l'élément qui manque */
  constructor(selector: string) {
    super(`Élément introuvable : ${selector}`);
    this.name = 'MissingElementError';
  }
}

/**
 * Cherche un élément qui doit exister.
 * @param selector Sélecteur CSS
 * @param root Racine de la recherche
 * @returns L'élément, jamais `null`
 * @throws {MissingElementError} Si aucun élément ne correspond : le HTML de la page est incohérent avec son script
 */
export function requireElement<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new MissingElementError(selector);

  return element;
}
