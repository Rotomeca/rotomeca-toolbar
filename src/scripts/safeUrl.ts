/**
 * Contrôle qu'une adresse est une URL http(s) avant de l'ouvrir ou de la charger.
 *
 * Utilisé partout où une adresse vient d'un site ou d'une page (ouverture externe,
 * permissions, popups). Refuse notamment `file:`, `javascript:` et `data:`.
 */

/**
 * Une URL est sûre si c'est une URL http(s) valide.
 * @param url La valeur à contrôler (souvent reçue d'une page : rien n'est supposé)
 * @returns true pour une chaîne qui est une URL http ou https
 */
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;

  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
