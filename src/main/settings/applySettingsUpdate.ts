/**
 * Applique les réglages envoyés par la page des paramètres et dit ce qui demande une réaction.
 *
 * Appelé par `App.ts` quand la page des paramètres envoie une mise à jour. Les valeurs reçues sont
 * non fiables : les réglages les valident, et seuls les changements d'écran ou de mode d'affichage sont signalés.
 */
// [Settings.ts] Réglages de l'utilisateur : accesseurs validés au-dessus d'un fichier de réglages
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
 * @param settings Réglages de l'application, modifiés puis enregistrés.
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
  settings.momentsMeteo = received.momentsMeteo;
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
