import type { Rect } from '../dock/dockGeometry.js';
import { centeredTop } from '../windows/placement.js';
import { postWhenLoaded } from '../windows/popupWindow.js';
import type { PopupWindow } from '../windows/popupWindow.js';
import type { MediaPayload } from './mediaState.js';

const GAP_TO_TOOLBAR = 10;

export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface MediaPopupDeps {
  /** La fenêtre du popup, créée à la demande. */
  readonly window: () => PopupWindow;
  /** La fenêtre du popup si elle existe déjà. */
  readonly existingWindow: () => PopupWindow | undefined;
  /** L'état affiché pour cette application, `null` s'il n'y a pas de morceau. */
  readonly payloadFor: (url: string) => MediaPayload | null;
  readonly toolbarBounds: () => Rect;
  readonly workArea: () => Rect;
  readonly scheduler: Scheduler;
  readonly height: number;
  readonly hideDelayMs: number;
  /** Canal sur lequel la page du popup reçoit l'état. */
  readonly stateChannel: string;
}

/** Petite fenêtre affichée au survol d'un bouton dont l'application joue un morceau. */
export class MediaPopup {
  private hoveredUrl: string | null = null;
  private hideTimer: unknown;

  constructor(private readonly deps: MediaPopupDeps) {}

  /** Application pour laquelle le popup est affiché (`null` : aucune). */
  get hoverUrl(): string | null {
    return this.hoveredUrl;
  }

  /** Le pointeur entre sur un bouton (affiche) ou en sort (masque après un court délai). */
  hover(url: unknown, hovering: boolean, centerY: unknown): void {
    this.deps.scheduler.clearTimeout(this.hideTimer);

    if (hovering) {
      if (typeof url === 'string' && typeof centerY === 'number') this.show(url, centerY);
    } else {
      this.hideTimer = this.deps.scheduler.setTimeout(() => this.hide(), this.deps.hideDelayMs);
    }
  }

  /** Met à jour le popup s'il est affiché pour cette application ; le ferme s'il n'y a plus de morceau. */
  refresh(url: string): void {
    if (this.hoveredUrl !== url) return;

    const window = this.deps.existingWindow();
    if (!window || !window.isVisible()) return;

    const payload = this.deps.payloadFor(url);
    if (payload) postWhenLoaded(this.deps.window(), this.deps.stateChannel, payload);
    else this.hide();
  }

  hide(): void {
    this.deps.scheduler.clearTimeout(this.hideTimer);
    this.hoveredUrl = null;

    const window = this.deps.existingWindow();
    if (window && window.isVisible()) window.hide();
  }

  /** @param centerY Milieu vertical du bouton dans la barre */
  private show(url: string, centerY: number): void {
    const payload = this.deps.payloadFor(url);
    if (!payload) return;

    const toolbar = this.deps.toolbarBounds();
    const top = centeredTop(toolbar.y + centerY, this.deps.height, this.deps.workArea());

    this.hoveredUrl = url;
    const window = this.deps.window();
    window.setPosition(Math.round(toolbar.x + toolbar.width + GAP_TO_TOOLBAR), Math.round(top));
    postWhenLoaded(window, this.deps.stateChannel, payload);
    window.showInactive();
  }
}
