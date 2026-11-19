import type { UpdateStage } from './dto.js';

/**
 * Niveau d'alerte de mise à jour : `pending` (nouvelle version disponible ou en cours de
 * téléchargement) ou `ready` (prête à installer).
 */
export type UpdateLevel = 'pending' | 'ready';

/** @returns Le niveau d'alerte correspondant à l'état des mises à jour, ou null s'il n'y en a pas */
export function updateLevelOf(stage: UpdateStage | undefined): UpdateLevel | null {
  if (stage === 'ready') return 'ready';
  return stage === 'downloading' || stage === 'available' ? 'pending' : null;
}
