/**
 * Fonctions pures d'affichage du lecteur multimédia : durée et avancement.
 *
 * Utilisé par la page du lecteur (`src/page.media/`). Ne dépend de rien.
 */

/**
 * Formate une durée pour l'affichage.
 * @param seconds Durée en secondes
 * @returns La durée au format m:ss
 */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Calcule l'avancement de la lecture.
 * @param position Position en secondes
 * @param duration Durée en secondes
 * @returns L'avancement du morceau en pourcentage entier (0 à 100)
 */
export function progressPercent(position: number | null, duration: number): number {
  return Math.round(((position ?? 0) / duration) * 100);
}
