/**
 * Limiteur de débit : n'accepte qu'une demande par intervalle (et par clé), les autres sont ignorées.
 *
 * Partagé par la page d'ajout (demandes de l'iframe de recherche, qui exécute du code distant) et le
 * processus principal (états média envoyés par les sites) : dans les deux cas l'émetteur n'est pas fiable
 * et ne doit pas pouvoir inonder son destinataire.
 */

/**
 * Crée un limiteur : chaque appel dit si la demande peut passer.
 *
 * @param minIntervalMs Délai minimal entre deux demandes acceptées pour une même clé, en millisecondes
 * @param now Horloge (injectée pour les tests)
 * @returns Une fonction qui renvoie `true` si la demande est acceptée ; la clé distingue les émetteurs
 */
export function createRequestThrottle(
  minIntervalMs: number,
  now: () => number = Date.now,
): (key?: string | number) => boolean {
  const lastAccepted = new Map<string | number, number>();

  return (key: string | number = ''): boolean => {
    const current = now();
    if (current - (lastAccepted.get(key) ?? Number.NEGATIVE_INFINITY) < minIntervalMs) return false;

    lastAccepted.set(key, current);
    return true;
  };
}
