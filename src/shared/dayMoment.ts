/**
 * Moment de la journée (aube, journée, crépuscule, nuit) d'après l'heure locale de la machine.
 *
 * Fonctions pures utilisées par `ThemeService` pour poser `data-moment` et armer le minuteur sur la
 * prochaine frontière (sans sondage régulier), et par la page des paramètres pour sa pastille.
 */

/** Moment de la journée, tel qu'écrit dans `data-moment`. */
export type DayMoment = 'aube' | 'jour' | 'crepuscule' | 'nuit';

/** Heures locales où le moment change, dans l'ordre : aube, journée, crépuscule, nuit. */
const BOUNDARY_HOURS = [6, 9, 17, 19] as const;

/**
 * @param date Instant à évaluer
 * @returns Le moment de la journée à l'heure locale : aube 6 h–9 h, journée 9 h–17 h, crépuscule 17 h–19 h, nuit 19 h–6 h
 */
export function momentFor(date: Date): DayMoment {
  const hour = date.getHours();

  if (hour >= 19 || hour < 6) return 'nuit';
  if (hour < 9) return 'aube';
  if (hour < 17) return 'jour';
  return 'crepuscule';
}

/**
 * @param date Instant de départ
 * @returns L'instant (heure locale) de la prochaine frontière strictement postérieure à `date` : 6 h, 9 h, 17 h ou 19 h
 */
export function nextMomentBoundary(date: Date): Date {
  for (const hour of BOUNDARY_HOURS) {
    const boundary = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour);
    if (boundary.getTime() > date.getTime()) return boundary;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, BOUNDARY_HOURS[0]);
}
