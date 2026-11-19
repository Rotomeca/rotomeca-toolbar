/**
 * Une URL est sûre si c'est une URL http(s) valide.
 * @param url La valeur à contrôler (souvent reçue d'une page : rien n'est supposé)
 * @returns true pour une chaîne qui est une URL http ou https
 */
export function isSafeUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;

  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
