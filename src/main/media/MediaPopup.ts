/**
 * Popup de contrôle du morceau en cours, affiché au survol d'un bouton de la barre.
 *
 * Utilisé par `App` : suit l'application survolée, rafraîchit l'affichage quand le morceau change
 * et masque le popup après un court délai. Fenêtre et minuteur sont injectés pour les tests.
 */
// [dockGeometry.ts] Géométrie de la barre : disposition des fenêtres, bande réservée et masquage automatique
import type { Rect } from '../dock/dockGeometry.js';
// [placement.ts] Calcul de la position verticale des fenêtres flottantes (infobulle, popup média)
import { centeredTop } from '../windows/placement.js';
// [popupWindow.ts] Contrat minimal des fenêtres flottantes et envoi d'un message une fois leur page chargée
import { postWhenLoaded } from '../windows/popupWindow.js';
import type { PopupWindow } from '../windows/popupWindow.js';
// [mediaState.ts] Calculs purs autour de l'état média des applications : avancée, contenu du popup, lecteurs ignorés
import type { MediaPayload } from './mediaState.js';

/** Espace (px) entre le bord droit de la barre et le popup. */
const GAP_TO_TOOLBAR = 10;

/** Minuteur injecté, pour tester sans attendre. */
export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Ce dont le popup dépend, fourni par le processus principal. */
export interface MediaPopupDeps {
  /** La fenêtre du popup, créée à la demande. */
  readonly window: () => PopupWindow;
  /** La fenêtre du popup si elle existe déjà. */
  readonly existingWindow: () => PopupWindow | undefined;
  /** L'état affiché pour cette application, `null` s'il n'y a pas de morceau. */
  readonly payloadFor: (url: string) => MediaPayload | null;
  /** Limites actuelles de la fenêtre de la barre. */
  readonly toolbarBounds: () => Rect;
  /** Zone utilisable de l'écran (hors barre des tâches). */
  readonly workArea: () => Rect;
  /** Minuteur du délai de masquage. */
  readonly scheduler: Scheduler;
  /** Hauteur de la fenêtre du popup (px). */
  readonly height: number;
  /** Délai (ms) entre la sortie du pointeur et le masquage. */
  readonly hideDelayMs: number;
  /** Canal sur lequel la page du popup reçoit l'état. */
  readonly stateChannel: string;
}

/** Petite fenêtre affichée au survol d'un bouton dont l'application joue un morceau. */
export class MediaPopup {
  /** Application pour laquelle le popup est affiché, `null` s'il est masqué. */
  private hoveredUrl: string | null = null;
  /** Minuteur du masquage différé, à annuler quand le pointeur revient. */
  private hideTimer: unknown;

  /** @param deps Fenêtre, état à afficher, placement et minuteur */
  constructor(private readonly deps: MediaPopupDeps) {}

  /** Application pour laquelle le popup est affiché (`null` : aucune). */
  get hoverUrl(): string | null {
    return this.hoveredUrl;
  }

  /**
   * Le pointeur entre sur un bouton (affiche) ou en sort (masque après un court délai) ; l'entrée sur le popup
   * lui-même (sans `centerY`) annule le masquage.
   */
  hover(url: unknown, hovering: boolean, centerY: unknown): void {
    if (hovering) {
      if (typeof url !== 'string') return;

      // Le pointeur est sur le popup lui-même (sa page n'envoie aucune position) : il garde ouvert celui déjà affiché
      if (centerY === undefined && url === this.hoveredUrl) {
        this.deps.scheduler.clearTimeout(this.hideTimer);
        return;
      }

      // Une entrée invalide est ignorée sans toucher au masquage déjà programmé
      if (typeof centerY !== 'number' || !Number.isFinite(centerY)) return;

      this.deps.scheduler.clearTimeout(this.hideTimer);
      this.show(url, centerY);
    } else {
      this.deps.scheduler.clearTimeout(this.hideTimer);
      this.hideTimer = this.deps.scheduler.setTimeout(() => this.hide(), this.deps.hideDelayMs);
    }
  }

  /** Met à jour le popup s'il est affiché pour cette application ; le ferme s'il n'y a plus de morceau. */
  refresh(url: string): void {
    if (this.hoveredUrl !== url) return;

    const window = this.deps.existingWindow();
    if (!window || window.isDestroyed() || !window.isVisible()) return;

    const payload = this.deps.payloadFor(url);
    if (payload) postWhenLoaded(this.deps.window(), this.deps.stateChannel, payload);
    else this.hide();
  }

  /** Masque le popup tout de suite et oublie l'application survolée. */
  hide(): void {
    this.deps.scheduler.clearTimeout(this.hideTimer);
    this.hoveredUrl = null;

    const window = this.deps.existingWindow();
    if (window && !window.isDestroyed() && window.isVisible()) window.hide();
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
