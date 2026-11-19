import type { ContextMenuItem } from '../shared/dto.js';

/** Une application proposée par défaut dans la fenêtre d'ajout (`configs/config.json`). */
export interface PopularApp {
  readonly url: string;
  readonly title: string;
  /** Image (`data:`/URL) ou icône de police (`font:nom`). */
  readonly icon?: string | null;
}

/** Données posées sur `window.electron` par le processus principal ou par la page elle-même. */
export interface WindowElectron {
  /** Boutons du menu contextuel (page du menu). */
  menu?: readonly ContextMenuItem[];
  /** Liste des applications par défaut (fenêtre d'ajout). */
  files?: { readonly default_apps?: readonly PopularApp[] };
  /** Réglages connus au chargement (paramètres). */
  settings?: { readonly isButtonModeEnabled: boolean };
}

declare global {
  interface Window {
    electron?: WindowElectron;
  }
}
