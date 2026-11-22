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

/**
 * Espaces et caractères de contrôle : le parseur d'URL les ignore ou les retire, pas les autres consommateurs de la chaîne brute.
 * @returns true si la chaîne en contient un
 */
function hasBlankOrControl(text: string): boolean {
  return [...text].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x20 || code === 0x7f;
  });
}

/**
 * Une adresse « nette » est une URL http(s) sans espace ni caractère de contrôle et sans identifiants
 * (`https://google.com@evil.com` s'afficherait comme google.com alors que l'hôte réel est evil.com).
 * Exigée pour toute adresse nouvellement enregistrée ; `isSafeUrl` reste le contrôle de navigation.
 *
 * @param url La valeur à contrôler (souvent reçue d'une page : rien n'est supposé)
 * @returns true pour une chaîne qui est une URL http ou https nette
 */
export function isPlainWebUrl(url: unknown): url is string {
  if (!isSafeUrl(url) || hasBlankOrControl(url)) return false;

  const { username, password } = new URL(url);
  return username === '' && password === '';
}

/**
 * Forme normalisée d'une adresse à confier au système (`shell.openExternal`) : ce que le parseur
 * d'URL a compris, et non la chaîne brute que `ShellExecute` pourrait lire autrement.
 *
 * @param url La valeur à contrôler
 * @returns L'adresse normalisée si c'est une URL http(s), sinon `null`
 */
export function toSafeHref(url: unknown): string | null {
  return isSafeUrl(url) ? new URL(url).href : null;
}
