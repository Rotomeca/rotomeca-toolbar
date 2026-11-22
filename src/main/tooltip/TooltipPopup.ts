/**
 * Infobulle affichée à droite de la barre, au niveau du bouton survolé.
 *
 * Utilisé par `App` quand une page de la barre demande d'afficher ou de masquer une infobulle.
 * Valide la demande reçue (donnée non fiable) et délègue la fenêtre, pour rester testable.
 */
// [dockGeometry.ts] Géométrie de la barre : disposition des fenêtres, bande réservée et masquage automatique
import type { Rect } from '../dock/dockGeometry.js';
// [placement.ts] Calcul de la position verticale des fenêtres flottantes (infobulle, popup média)
import { centeredTop } from '../windows/placement.js';
// [popupWindow.ts] Contrat minimal des fenêtres flottantes et envoi d'un message une fois leur page chargée
import { postWhenLoaded } from '../windows/popupWindow.js';
import type { PopupWindow } from '../windows/popupWindow.js';

/** Espace (px) entre le bord droit de la barre et l'infobulle. */
const GAP_TO_TOOLBAR = 8;
/** Longueur maximale du texte affiché ; au-delà il est tronqué. */
const MAX_TEXT_LENGTH = 200;
/** Longueur maximale de la pastille ; au-delà elle est tronquée. */
const MAX_BADGE_LENGTH = 10;

/** Ce que montre l'infobulle. */
export interface TooltipContent {
  /** Texte principal (jamais vide). */
  readonly text: string;
  /** Pastille accolée au texte (ex. un compteur), `null` s'il n'y en a pas. */
  readonly badge: string | null;
}

/** Demande d'affichage validée : le contenu et la position du bouton survolé. */
export interface TooltipRequest {
  readonly content: TooltipContent;
  /** Milieu vertical du bouton dans la barre. */
  readonly centerY: number;
}

/**
 * @param args Donnée non fiable reçue d'une page
 * @returns Le contenu à afficher (texte et pastille tronqués), `null` si la demande est invalide
 */
export function parseTooltipRequest(args: unknown): TooltipRequest | null {
  if (typeof args !== 'object' || args === null) return null;

  const { text, badge, y } = args as Record<string, unknown>;
  if (typeof text !== 'string' || text === '' || typeof y !== 'number' || !Number.isFinite(y)) return null;

  return {
    content: {
      text: text.slice(0, MAX_TEXT_LENGTH),
      badge: typeof badge === 'string' ? badge.slice(0, MAX_BADGE_LENGTH) : null,
    },
    centerY: y,
  };
}

/** Ce dont l'infobulle dépend, fourni par le processus principal. */
export interface TooltipPopupDeps {
  /** La fenêtre de l'infobulle, créée à la demande. */
  readonly window: () => PopupWindow;
  /** La fenêtre de l'infobulle si elle existe déjà. */
  readonly existingWindow: () => PopupWindow | undefined;
  /** Limites actuelles de la fenêtre de la barre. */
  readonly toolbarBounds: () => Rect;
  /** Zone utilisable de l'écran (hors barre des tâches). */
  readonly workArea: () => Rect;
  /** Hauteur de la fenêtre de l'infobulle (px). */
  readonly height: number;
  /** Canal sur lequel la page de l'infobulle reçoit son contenu. */
  readonly stateChannel: string;
}

/** Infobulle affichée à droite de la barre, centrée sur le bouton survolé. */
export class TooltipPopup {
  /** @param deps Fenêtre, limites de la barre, zone de travail et canal d'envoi */
  constructor(private readonly deps: TooltipPopupDeps) {}

  /** Affiche l'infobulle ; une demande invalide est ignorée. */
  show(args: unknown): void {
    const request = parseTooltipRequest(args);
    if (!request) return;

    const toolbar = this.deps.toolbarBounds();
    const top = centeredTop(toolbar.y + request.centerY, this.deps.height, this.deps.workArea());

    const window = this.deps.window();
    window.setPosition(Math.round(toolbar.x + toolbar.width + GAP_TO_TOOLBAR), Math.round(top));
    postWhenLoaded(window, this.deps.stateChannel, request.content);
    window.showInactive();
  }

  /** Masque l'infobulle si elle est affichée (sans la créer sinon). */
  hide(): void {
    const window = this.deps.existingWindow();
    if (window && !window.isDestroyed() && window.isVisible()) window.hide();
  }
}
