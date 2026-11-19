/**
 * Données échangées entre le processus principal et les pages. Types seulement, sans Electron ni
 * DOM : les deux côtés importent ce fichier, une forme change à un seul endroit.
 */

/** Une application de la barre. */
export interface AppDto {
  readonly name: string;
  readonly url: string;
  /** Image intégrée (`data:image/...`), icône de police (`font:nom`) ou `null`. */
  readonly picture: string | null;
}

/** Un élément de la barre : une application ou un séparateur. */
export type ToolbarEntryDto = AppDto | 'separator';

// #region Médias

export type MediaAction = 'play' | 'pause' | 'previoustrack' | 'nexttrack';

/** État média d'un site, après validation. */
export interface MediaState {
  /** Durée en secondes, `null` si inconnue. */
  readonly duration: number | null;
  /** Position en secondes, `null` si la durée est inconnue. */
  readonly position: number | null;
  readonly title: string;
  readonly artist: string;
  readonly artwork: string | null;
  readonly playing: boolean;
  readonly actions: readonly MediaAction[];
}

/** État affiché par la fenêtre de contrôle du morceau d'une application. */
export interface MediaPayload extends MediaState {
  readonly url: string;
  readonly muted: boolean;
}

/** Ce que la barre affiche sur le bouton d'une application. */
export interface IndicatorsDto {
  readonly url: string;
  /** Nombre de messages non lus. */
  readonly badge: number;
  readonly audible: boolean;
  readonly muted: boolean;
  readonly cover: string | null;
  /** Avancée du morceau entre 0 et 1, `null` si inconnue. */
  readonly progress: number | null;
  readonly hasMedia: boolean;
  /** Joue un morceau mais ne pilote pas la barre des tâches. */
  readonly ignored: boolean;
}

// #endregion

// #region Mises à jour

export type UpdateStage = 'uptodate' | 'available' | 'downloading' | 'ready';

/** Serveur de mises à jour interrogé par Squirrel : les versions publiées, ou les pré-versions. */
export type UpdateChannel = 'stable' | 'test';

export interface UpdateState {
  readonly etat: UpdateStage;
  /** Vérification en cours. */
  readonly verification: boolean;
  readonly versionActuelle: string;
  /** La version installée est une pré-version (`X.Y.Z-rcN`). */
  readonly prerelease: boolean;
  readonly versionDisponible: string | null;
  /** `null` : progression inconnue (Squirrel). */
  readonly pourcentage: number | null;
  /** Horodatage (ms) de la dernière vérification réussie. */
  readonly derniereVerification: number | null;
  /** Clé de traduction du dernier échec. */
  readonly erreur: string | null;
  /** Recherche d'une version de test en cours. */
  readonly verificationTest: boolean;
  /** Version de test plus récente que l'actuelle. */
  readonly versionTest: string | null;
  /** Horodatage (ms) de la dernière recherche de version de test réussie. */
  readonly derniereVerificationTest: number | null;
  /** Clé de traduction du dernier échec lié à la version de test. */
  readonly erreurTest: string | null;
  /** `installTest()` installe seule (sinon, ouvre la page de la release). */
  readonly testAuto: boolean;
}

// #endregion

// #region Saisons, permissions, écrans

export type SeasonTheme = 'cerisier' | 'printemps' | 'ete' | 'automne' | 'hiver' | 'noel';

export interface SeasonInfo {
  /** Thème de saison du jour. */
  readonly theme: SeasonTheme;
  readonly nextTheme: SeasonTheme;
  /** Jour du prochain changement, au format AAAA-MM-JJ. */
  readonly nextDate: string;
}

/** Permissions qui demandent une confirmation (et donc qu'on mémorise). */
export type AskablePermission = 'media' | 'geolocation';

export interface PermissionDecision {
  readonly origin: string;
  readonly permission: AskablePermission;
  readonly allowed: boolean;
}

export interface DisplayInfo {
  readonly id: number;
  readonly label: string;
  readonly isPrimary: boolean;
}

// #endregion

// #region Menu contextuel

export type ContextMenuAction = 'delete' | 'addseparator' | 'goUp' | 'goDown' | 'toggleMute' | 'edit';

export interface ContextMenuItem {
  readonly text: string;
  readonly title: string;
  readonly action: ContextMenuAction;
  readonly data: Readonly<Record<string, string | null | undefined>>;
  readonly disabled?: boolean;
}

// #endregion
