import type { Rect } from '../dock/dockGeometry.js';
import { centeredTop } from '../windows/placement.js';
import { postWhenLoaded } from '../windows/popupWindow.js';
import type { PopupWindow } from '../windows/popupWindow.js';

const GAP_TO_TOOLBAR = 8;
const MAX_TEXT_LENGTH = 200;
const MAX_BADGE_LENGTH = 10;

export interface TooltipContent {
  readonly text: string;
  readonly badge: string | null;
}

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
  if (typeof text !== 'string' || text === '' || typeof y !== 'number') return null;

  return {
    content: {
      text: text.slice(0, MAX_TEXT_LENGTH),
      badge: typeof badge === 'string' ? badge.slice(0, MAX_BADGE_LENGTH) : null,
    },
    centerY: y,
  };
}

export interface TooltipPopupDeps {
  /** La fenêtre de l'infobulle, créée à la demande. */
  readonly window: () => PopupWindow;
  /** La fenêtre de l'infobulle si elle existe déjà. */
  readonly existingWindow: () => PopupWindow | undefined;
  readonly toolbarBounds: () => Rect;
  readonly workArea: () => Rect;
  readonly height: number;
  readonly stateChannel: string;
}

/** Infobulle affichée à droite de la barre, centrée sur le bouton survolé. */
export class TooltipPopup {
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

  hide(): void {
    const window = this.deps.existingWindow();
    if (window && !window.isDestroyed() && window.isVisible()) window.hide();
  }
}
