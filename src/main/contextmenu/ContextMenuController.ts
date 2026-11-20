/**
 * Contrôleur du menu contextuel : décide où il s'ouvre et ce qu'il contient.
 *
 * Branché par `App` sur `startContextMenu` (via `ContextMenuHooks`). Il garde la liste des
 * boutons enregistrés et s'appuie sur `contextMenuModel` pour construire les entrées.
 */
// [contextMenuModel.ts] Contenu du menu contextuel des boutons de la barre (mode normal et mode édition)
import { buildContextMenu } from './contextMenuModel.js';
import type { ContextMenuEvent, ContextMenuItem, SavedEntry, Translate } from './contextMenuModel.js';
// [electronContextMenu.ts] Menu contextuel Electron : injecte le script de clic droit et ouvre la fenêtre du menu
import type { ContextMenuHooks } from './electronContextMenu.js';

/** Nom de l'élément HTML d'un bouton de la barre : seul endroit où le menu s'ouvre. */
const TOOLBAR_BUTTON = 'ROTOMECA-TOOLBAR-BUTTON';

/** Collaborateurs du contrôleur, injectés pour le garder indépendant d'Electron. */
export interface ContextMenuDeps {
  /** @returns `true` si la fenêtre est celle de la barre */
  readonly isToolbarWindow: (windowId: number) => boolean;
  /** @returns `true` si le son de l'application est coupé */
  readonly isMuted: (url: string) => boolean;
  /** Traduit les textes du menu dans la langue de l'utilisateur. */
  readonly translate: Translate;
}

/** Décide quand le menu contextuel s'affiche et ce qu'il contient, à partir des boutons enregistrés. */
export class ContextMenuController implements ContextMenuHooks {
  /** Boutons de la barre, tels que la page les a enregistrés. */
  private saves: readonly SavedEntry[] = [];

  /** @param deps Identification de la fenêtre de la barre, état du son et traduction */
  constructor(private readonly deps: ContextMenuDeps) {}

  /** Met à jour les boutons connus (après un chargement ou une sauvegarde) ; toute autre valeur les vide. */
  updateSaves(saves: unknown): void {
    this.saves = Array.isArray(saves) ? (saves as SavedEntry[]) : [];
  }

  /** Le menu ne s'ouvre que sur un bouton de la barre. */
  shouldShow(event: ContextMenuEvent, windowId: number): boolean {
    return this.deps.isToolbarWindow(windowId) && event.target.nodeName === TOOLBAR_BUTTON;
  }

  /** @returns Les boutons du menu pour l'élément cliqué, vide si rien ne doit s'afficher */
  menu(event: ContextMenuEvent): ContextMenuItem[] {
    return buildContextMenu(event, { saves: this.saves, isMuted: this.deps.isMuted, translate: this.deps.translate });
  }
}
