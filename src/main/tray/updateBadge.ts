import type { UpdateLevel } from '../../shared/updateLevel.js';

export { updateLevelOf } from '../../shared/updateLevel.js';
export type { UpdateLevel };

/** Coin de l'icône où se place la pastille. */
export type BadgeCorner = 'bottom-right' | 'top-right';

/** Couleur d'une pastille, dans l'ordre des octets d'un bitmap BGRA. */
const BADGE_COLORS: Readonly<Record<UpdateLevel, readonly [blue: number, green: number, red: number]>> = {
  pending: [255, 152, 0],
  ready: [76, 175, 80],
};
const WHITE = [255, 255, 255] as const;

const BADGE_RADIUS = 8;
/** Épaisseur (px) du liseré blanc autour de la pastille. */
const BADGE_OUTLINE = 1.5;
const BYTES_PER_PIXEL = 4;

/**
 * Le badge « RC » de l'icône d'une pré-version est en bas à droite : la pastille passe en haut
 * pour ne pas le cacher.
 */
export function badgeCornerFor(isPrerelease: boolean): BadgeCorner {
  return isPrerelease ? 'top-right' : 'bottom-right';
}

/**
 * Dessine une pastille de couleur, cernée de blanc pour rester lisible sur tout fond, dans un
 * coin d'une icône carrée.
 * @param bitmap Pixels BGRA de l'icône (modifiés sur place)
 * @param size Côté de l'icône en pixels
 * @returns Le même bitmap
 */
export function paintUpdateBadge(bitmap: Buffer, size: number, level: UpdateLevel, corner: BadgeCorner): Buffer {
  const [blue, green, red] = BADGE_COLORS[level];
  const centerX = size - BADGE_RADIUS - 1;
  const centerY = corner === 'top-right' ? BADGE_RADIUS + 1 : size - BADGE_RADIUS - 1;

  for (let y = 0; y < size; ++y) {
    for (let x = 0; x < size; ++x) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > BADGE_RADIUS + BADGE_OUTLINE) continue;

      const [b, g, r] = distance <= BADGE_RADIUS - 1 ? [blue, green, red] : WHITE;
      const index = (y * size + x) * BYTES_PER_PIXEL;
      bitmap[index] = b;
      bitmap[index + 1] = g;
      bitmap[index + 2] = r;
      bitmap[index + 3] = 255;
    }
  }

  return bitmap;
}
