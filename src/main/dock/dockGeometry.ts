/** Rectangle en pixels indépendants de la densité (comme toute l'API de fenêtres d'Electron). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Dimensions fixes de l'interface. */
export interface LayoutSizes {
  /** Largeur de la barre dépliée. */
  readonly toolbarWidth: number;
  readonly addDialogWidth: number;
  readonly addDialogHeight: number;
  /** Largeur de la zone sensible du bord (mode souris). */
  readonly edgeWidth: number;
}

export interface LayoutInput {
  /** Zone de travail de l'écran choisi (hors barre des tâches). */
  readonly workArea: Rect;
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

export interface Layout {
  readonly main: Rect;
  readonly toolbar: Rect;
  readonly apps: Rect;
  readonly addDialog: Rect;
  readonly edge: Rect;
}

const MARGIN = 10;
const MAIN_WIDTH = 64;
const MAIN_HEIGHT = 32;
const BUTTON_ROW_HEIGHT = 52;
const FREE_BOTTOM_MARGIN = 20;

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

/** @returns La disposition des fenêtres sur l'écran choisi */
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

export interface DockRequestInput {
  readonly bounds: Rect;
  readonly autoHide: boolean;
  readonly dockedWidth: number;
  readonly railWidth: number;
}

/**
 * @returns La bande à réserver au bord gauche. En masquage automatique, seul le rail réserve
 * de la place : la barre dépliée flotte par-dessus les fenêtres sans les déplacer.
 */
export function dockRequest({ bounds, autoHide, dockedWidth, railWidth }: DockRequestInput): Rect {
  return { x: bounds.x, y: bounds.y, width: autoHide ? railWidth : dockedWidth, height: bounds.height };
}

/** @returns Une clé qui change quand la bande demandée change (évite de redemander la même zone en boucle) */
export function dockRequestKey(request: Rect): string {
  return JSON.stringify(request);
}

/** @returns `true` si le point est dans l'un des rectangles (bords haut/gauche inclus, bas/droite exclus) */
export function isPointInside(point: Point, rects: readonly Rect[]): boolean {
  return rects.some(
    (rect) =>
      point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height,
  );
}

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
