/** Les réglages qui décident comment la barre s'affiche. */
export interface DisplayModeSettings {
  readonly isButtonModeEnabled: boolean;
  readonly appBarEnabled: boolean;
  readonly appBarAutoHide: boolean;
}

/** Comment la barre s'affiche, déduit des réglages et de ce que le système permet. */
export interface DisplayMode {
  /** Mode bouton (chevron flottant). Exclu quand la barre est ancrée. */
  readonly button: boolean;
  /** Barre ancrée au bord gauche (AppBar Windows), si disponible. */
  readonly appBar: boolean;
  /** Barre ancrée qui se replie seule quand la souris la quitte. */
  readonly autoHide: boolean;
  /** La barre se déplie quand la souris touche le bord gauche de l'écran (mode souris). */
  readonly usesEdge: boolean;
}

/**
 * @param settings Réglages de l'utilisateur
 * @param appBarSupported La barre ancrée est utilisable sur ce système
 * @returns Le mode d'affichage : la barre ancrée prime sur le mode bouton et le mode souris
 */
export function resolveDisplayMode(settings: DisplayModeSettings, appBarSupported: boolean): DisplayMode {
  const appBar = settings.appBarEnabled && appBarSupported;

  return {
    appBar,
    button: !appBar && settings.isButtonModeEnabled,
    autoHide: appBar && settings.appBarAutoHide,
    usesEdge: !appBar && !settings.isButtonModeEnabled,
  };
}
