/**
 * Niveau d'alerte d'une mise à jour (en attente ou prête), partagé entre le processus principal et les pages.
 *
 * Sert à choisir le badge de l'icône de la zone de notification et celui de la barre.
 */
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { UpdateStage } from './dto.js';

/**
 * Niveau d'alerte de mise à jour : `pending` (nouvelle version disponible ou en cours de
 * téléchargement) ou `ready` (prête à installer).
 */
export type UpdateLevel = 'pending' | 'ready';

/**
 * @param stage Étape de la mise à jour, ou `undefined` si aucune information n'est disponible.
 * @returns Le niveau d'alerte correspondant à l'état des mises à jour, ou null s'il n'y en a pas */
export function updateLevelOf(stage: UpdateStage | undefined): UpdateLevel | null {
  if (stage === 'ready') return 'ready';
  return stage === 'downloading' || stage === 'available' ? 'pending' : null;
}
