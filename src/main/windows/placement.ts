/** Bande verticale disponible à l'écran (la zone de travail, barre des tâches exclue). */
export interface VerticalArea {
  readonly y: number;
  readonly height: number;
}

/**
 * Position haute d'une fenêtre de hauteur donnée, centrée sur une ordonnée, sans sortir de
 * la zone de travail.
 * @param anchorY Ordonnée à laquelle centrer la fenêtre (en coordonnées d'écran)
 * @param height Hauteur de la fenêtre
 */
export function centeredTop(anchorY: number, height: number, area: VerticalArea): number {
  return Math.min(Math.max(anchorY - height / 2, area.y), area.y + area.height - height);
}
