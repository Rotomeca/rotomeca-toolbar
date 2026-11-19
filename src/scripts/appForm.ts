/** @returns Le texte avec une majuscule au début */
export function capitalizeFirstLetter(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** @returns L'adresse saisie, avec `http://` si elle n'a pas de protocole (une saisie vide reste vide) */
export function withProtocol(typed: string): string {
  return typed !== '' && !typed.includes('://') ? `http://${typed}` : typed;
}

/**
 * @param url Adresse complète
 * @returns Le nom proposé pour le site : le premier élément de son domaine, sans `www.`, en majuscule
 * (chaîne vide si l'adresse n'a pas de domaine)
 */
export function suggestedName(url: string): string {
  const host = url.replaceAll('www.', '').split('://')[1] ?? '';
  return capitalizeFirstLetter(host.split('.')[0] ?? '');
}

/** @returns Le nom à enregistrer : celui saisi, sinon celui proposé, sinon l'adresse */
export function chosenName(typedName: string, url: string): string {
  return typedName || suggestedName(url) || url;
}

/** @returns La forme comparable d'une adresse (sans barre finale ni ancre) */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
  } catch {
    // Pas une adresse : elle ne se compare qu'à elle-même
    return String(url);
  }
}
