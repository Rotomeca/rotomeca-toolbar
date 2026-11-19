import type { Settings } from './Settings.js';

/** Ce qui a changé et demande une réaction de l'application. */
export interface SettingsUpdateResult {
  /** Le mode d'affichage de la barre (bouton, ancrée, masquage automatique) a changé. */
  readonly displayModeChanged: boolean;
  /** L'écran choisi a changé. */
  readonly screenChanged: boolean;
}

/**
 * Applique les réglages reçus de la page des paramètres, puis les enregistre.
 * Les réglages valident leurs valeurs (thème en liste blanche, identifiant d'écran entier).
 * @param raw Donnée non fiable reçue d'une page
 * @returns Ce qui a changé, ou `null` si la donnée n'est pas un objet (rien n'est modifié)
 */
export function applySettingsUpdate(settings: Settings, raw: unknown): SettingsUpdateResult | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const received = raw as Record<string, unknown>;
  const isButtonModeEnabled = received.isButtonModeEnabled === true;
  const appBarEnabled = received.appBarEnabled === true;
  const appBarAutoHide = received.appBarAutoHide === true;

  const displayModeChanged =
    settings.isButtonModeEnabled !== isButtonModeEnabled ||
    settings.appBarEnabled !== appBarEnabled ||
    settings.appBarAutoHide !== appBarAutoHide;

  settings.theme = received.theme;
  settings.themeAuto = received.themeAuto === true;
  settings.effetsSaison = received.effetsSaison;
  settings.densiteEffets = received.densiteEffets;
  settings.isButtonModeEnabled = isButtonModeEnabled;
  settings.appBarEnabled = appBarEnabled;
  settings.appBarAutoHide = appBarAutoHide;

  const previousDisplayId = settings.displayId;
  settings.displayId = received.displayId;
  const screenChanged = settings.displayId !== previousDisplayId;

  settings.save();

  return { displayModeChanged, screenChanged };
}
