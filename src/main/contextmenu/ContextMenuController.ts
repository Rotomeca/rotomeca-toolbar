import { buildContextMenu } from './contextMenuModel.js';
import type { ContextMenuEvent, ContextMenuItem, SavedEntry, Translate } from './contextMenuModel.js';
import type { ContextMenuHooks } from './electronContextMenu.js';

const TOOLBAR_BUTTON = 'ROTOMECA-TOOLBAR-BUTTON';

export interface ContextMenuDeps {
  /** @returns `true` si la fenêtre est celle de la barre */
  readonly isToolbarWindow: (windowId: number) => boolean;
  readonly isMuted: (url: string) => boolean;
  readonly translate: Translate;
}

/** Décide quand le menu contextuel s'affiche et ce qu'il contient, à partir des boutons enregistrés. */
export class ContextMenuController implements ContextMenuHooks {
  private saves: readonly SavedEntry[] = [];

  constructor(private readonly deps: ContextMenuDeps) {}

  /** Met à jour les boutons connus (après un chargement ou une sauvegarde) ; toute autre valeur les vide. */
  updateSaves(saves: unknown): void {
    this.saves = Array.isArray(saves) ? (saves as SavedEntry[]) : [];
  }

  /** Le menu ne s'ouvre que sur un bouton de la barre. */
  shouldShow(event: ContextMenuEvent, windowId: number): boolean {
    return this.deps.isToolbarWindow(windowId) && event.target.nodeName === TOOLBAR_BUTTON;
  }

  menu(event: ContextMenuEvent): ContextMenuItem[] {
    return buildContextMenu(event, { saves: this.saves, isMuted: this.deps.isMuted, translate: this.deps.translate });
  }
}
