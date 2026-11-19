/**
 * Géométrie de la barre : disposition des fenêtres, bande réservée et masquage automatique.
 *
 * Calculs purs (rectangles, délais), sans Electron : `App` fournit l'écran et l'heure, et applique
 * les résultats. Tous les rectangles sont en pixels indépendants de la densité.
 */

/** Rectangle en pixels indépendants de la densité (comme toute l'API de fenêtres d'Electron). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Position d'un point à l'écran, en pixels indépendants de la densité. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Dimensions fixes de l'interface. */
export interface LayoutSizes {
  /** Largeur de la barre dépliée. */
  readonly toolbarWidth: number;
  /** Largeur de la fenêtre d'ajout d'une application. */
  readonly addDialogWidth: number;
  /** Hauteur de la fenêtre d'ajout d'une application. */
  readonly addDialogHeight: number;
  /** Largeur de la zone sensible du bord (mode souris). */
  readonly edgeWidth: number;
}

/** Données nécessaires au calcul de la disposition des fenêtres. */
export interface LayoutInput {
  /** Zone de travail de l'écran choisi (hors barre des tâches). */
  readonly workArea: Rect;
  /** Limites complètes de l'écran choisi. */
  /** Limites complètes de l'écran choisi. */
  readonly bounds: Rect;
  readonly sizes: LayoutSizes;
  /** Barre ancrée au bord (AppBar). */
  readonly docked: boolean;
  /** Largeur actuelle de la barre ancrée (rail replié ou barre dépliée). */
  readonly dockedWidth: number;
  /** Zone accordée par le système à la barre ancrée, si elle est déjà réservée. */
  readonly grantedArea: Rect | null;
  /** Mode bouton : le bouton principal occupe le bas de la barre. */
  readonly buttonMode: boolean;
}

/** Position de chaque fenêtre de l'interface sur l'écran. */
export interface Layout {
  /** Petite fenêtre du bouton principal, en bas à gauche. */
  readonly main: Rect;
  /** Fenêtre de la barre (rail ou barre dépliée). */
  readonly toolbar: Rect;
  /** Fenêtre qui porte les sites ouverts, à côté de la barre. */
  readonly apps: Rect;
  /** Fenêtre d'ajout d'une application. */
  readonly addDialog: Rect;
  /** Zone sensible du bord gauche (mode souris). */
  readonly edge: Rect;
}

/** Marge entre les fenêtres et les bords de la zone de travail, en pixels. */
const MARGIN = 10;
/** Largeur de la fenêtre du bouton principal. */
const MAIN_WIDTH = 64;
/** Hauteur de la fenêtre du bouton principal. */
const MAIN_HEIGHT = 32;
/** Espace laissé en bas de la barre flottante en mode bouton, pour le bouton principal. */
const BUTTON_ROW_HEIGHT = 52;
/** Espace laissé en bas de la barre flottante hors mode bouton. */
const FREE_BOTTOM_MARGIN = 20;

/**
 * Zone de la barre : ancrée, elle reprend la zone accordée par le système (ou le bord de l'écran
 * en attendant) ; flottante, elle est posée dans la zone de travail avec une marge.
 */
function toolbarArea({ workArea, bounds, sizes, docked, dockedWidth, grantedArea, buttonMode }: LayoutInput): Rect {
  if (docked) {
    const base = grantedArea ?? { x: bounds.x, y: workArea.y, width: dockedWidth, height: workArea.height };
    return { ...base, width: dockedWidth };
  }

  return {
    x: workArea.x + MARGIN,
    y: workArea.y + MARGIN,
    width: sizes.toolbarWidth,
    height: workArea.height - (buttonMode ? BUTTON_ROW_HEIGHT : FREE_BOTTOM_MARGIN),
  };
}

/**
 * Calcule la place de chaque fenêtre à partir de la zone de travail et du mode (ancré ou flottant).
 * @returns La disposition des fenêtres sur l'écran choisi
 */
export function computeLayout(input: LayoutInput): Layout {
  const { workArea, bounds, sizes, docked } = input;
  const toolbar = toolbarArea(input);

  return {
    main: { x: workArea.x + MARGIN, y: workArea.y + workArea.height - MAIN_HEIGHT, width: MAIN_WIDTH, height: MAIN_HEIGHT },
    toolbar,
    apps: {
      x: docked ? toolbar.x + toolbar.width + MARGIN : workArea.x + MAIN_WIDTH + 2 * MARGIN,
      y: docked ? toolbar.y + MARGIN : workArea.y + MARGIN,
      width: Math.round(workArea.width / 4),
      height: docked ? toolbar.height - 2 * MARGIN : toolbar.height,
    },
    addDialog: {
      x: toolbar.x + toolbar.width + MARGIN,
      y: toolbar.y,
      width: Math.min(sizes.addDialogWidth, workArea.width),
      height: Math.min(sizes.addDialogHeight, workArea.height),
    },
    edge: { x: bounds.x, y: bounds.y, width: sizes.edgeWidth, height: bounds.height },
  };
}

/** Données nécessaires au calcul de la bande à réserver. */
export interface DockRequestInput {
  /** Limites complètes de l'écran choisi. */
  readonly bounds: Rect;
  /** Masquage automatique : la barre se replie en rail quand la souris la quitte. */
  readonly autoHide: boolean;
  /** Largeur de la barre ancrée dépliée. */
  readonly dockedWidth: number;
  /** Largeur du rail replié. */
  readonly railWidth: number;
}

/**
 * @returns La bande à réserver au bord gauche. En masquage automatique, seul le rail réserve
 * de la place : la barre dépliée flotte par-dessus les fenêtres sans les déplacer.
 */
export function dockRequest({ bounds, autoHide, dockedWidth, railWidth }: DockRequestInput): Rect {
  return { x: bounds.x, y: bounds.y, width: autoHide ? railWidth : dockedWidth, height: bounds.height };
}

/**
 * Résume une demande de bande en une chaîne comparable.
 * @returns Une clé qui change quand la bande demandée change (évite de redemander la même zone en boucle)
 */
export function dockRequestKey(request: Rect): string {
  return JSON.stringify(request);
}

/**
 * Teste si le point est dans l'interface.
 * @returns `true` si le point est dans l'un des rectangles (bords haut/gauche inclus, bas/droite exclus)
 */
export function isPointInside(point: Point, rects: readonly Rect[]): boolean {
  return rects.some(
    (rect) =>
      point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height,
  );
}

/** État du masquage automatique après un pas de calcul. */
export interface AutoHideState {
  /** Instant où la souris est sortie de l'interface, `null` tant qu'elle est dedans. */
  readonly outsideSince: number | null;
  /** La barre doit se replier maintenant. */
  readonly collapse: boolean;
}

/**
 * Un pas du masquage automatique : la barre se replie quand la souris reste hors de
 * l'interface plus longtemps que `delay`.
 */
export function stepAutoHide(previousOutsideSince: number | null, inside: boolean, now: number, delay: number): AutoHideState {
  if (inside) return { outsideSince: null, collapse: false };
  if (previousOutsideSince === null) return { outsideSince: now, collapse: false };
  if (now - previousOutsideSince >= delay) return { outsideSince: null, collapse: true };

  return { outsideSince: previousOutsideSince, collapse: false };
}
