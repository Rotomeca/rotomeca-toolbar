/**
 * Fréquence de la pluie : jours de pluie par mois et saisons concernées.
 *
 * Table de configuration lue par `rainDay.ts`. Les valeurs sont des ordres de grandeur pour Paris
 * (jours avec au moins 1 mm de pluie) ; à remplacer par les normales Météo-France de la station voulue.
 */

/** Jours de pluie (≥ 1 mm) par mois, de janvier à décembre. Valeurs approximatives pour Paris. */
export const RAIN_DAYS_PER_MONTH: readonly number[] = [10, 9, 10, 9, 9, 8, 7, 7, 8, 10, 10, 10];

/** Palettes de saison qui peuvent avoir de la pluie ; les autres n'en ont jamais, même un jour tiré. */
export const RAINY_PALETTES: readonly string[] = ['ete', 'automne', 'printemps'];
