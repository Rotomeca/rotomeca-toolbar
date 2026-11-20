/**
 * Défilement d'un texte trop long pour sa place (titre et artiste du lecteur).
 *
 * Utilisé par `src/page.media/main.ts`. Les calculs sont purs (testables) ; seul `applyMarquee` touche au DOM.
 */

/** Vitesse de défilement (px par seconde) : assez lente pour lire pendant que ça bouge. */
const SPEED_PX_PER_SECOND = 35;
/** Temps de défilement minimal d'un bout à l'autre (secondes), pour un texte à peine trop long. */
const MIN_TRAVEL_SECONDS = 2;
/** Part du cycle passée à bouger : le reste est une pause à chaque extrémité (voir `@keyframes marquee`). */
const MOVING_SHARE = 0.6;
/** Marge ajoutée au décalage (px) pour que la fin du texte ne touche pas le bord. */
const END_MARGIN = 4;

/** Réglage du défilement d'un texte. */
export interface MarqueeTiming {
  /** Décalage final vers la gauche (px). */
  readonly shift: number;
  /** Durée d'un aller (secondes), pauses comprises. */
  readonly durationSeconds: number;
}

/**
 * @param contentWidth Largeur du texte entier (px)
 * @param boxWidth Largeur visible (px)
 * @returns Le réglage du défilement, `null` si le texte tient (ou si les mesures sont inutilisables)
 */
export function marqueeTiming(contentWidth: number, boxWidth: number): MarqueeTiming | null {
  if (!Number.isFinite(contentWidth) || !Number.isFinite(boxWidth) || boxWidth <= 0) return null;
  if (contentWidth <= boxWidth) return null;

  const shift = Math.ceil(contentWidth - boxWidth) + END_MARGIN;
  const travel = Math.max(MIN_TRAVEL_SECONDS, shift / SPEED_PX_PER_SECOND);

  return { shift, durationSeconds: Math.round((travel / MOVING_SHARE) * 10) / 10 };
}

/** Éléments déjà observés : un seul observateur par élément, quel que soit le nombre de mises à jour. */
const observed = new WeakSet<HTMLElement>();

/**
 * Affiche un texte et le fait défiler s'il dépasse. Le texte n'est reconstruit que s'il change : un même
 * titre ré-envoyé chaque seconde ne relance donc pas l'animation.
 *
 * @param container Élément de largeur limitée (`overflow: hidden`)
 * @param text Texte à afficher
 */
export function applyMarquee(container: HTMLElement, text: string): void {
  if (container.dataset['marqueeText'] !== text) {
    container.dataset['marqueeText'] = text;
    const inner = document.createElement('span');
    inner.className = 'marquee-text';
    inner.textContent = text;
    container.replaceChildren(inner);
  }

  const measure = (): void => {
    const timing = marqueeTiming(container.scrollWidth, container.clientWidth);
    container.classList.toggle('scrolling', timing !== null);
    if (timing) {
      container.style.setProperty('--marquee-shift', `-${timing.shift}px`);
      container.style.setProperty('--marquee-duration', `${timing.durationSeconds}s`);
    }
  };

  // La fenêtre est affichée après l'envoi de l'état : on mesure tout de suite, puis quand la place change
  measure();
  if (!observed.has(container)) {
    observed.add(container);
    new ResizeObserver(measure).observe(container);
  }
}
