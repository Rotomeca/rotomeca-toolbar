/**
 * Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans).
 *
 * Types seulement, sans Electron ni DOM : les deux côtés importent ce fichier, une forme change à un
 * seul endroit. Les contrats par canal qui les utilisent sont dans `ipc/contracts.ts`.
 */

/** Une application de la barre. */
export interface AppDto {
  /** Nom affiché sous le bouton et dans l'infobulle. */
  readonly name: string;
  /** Adresse du site (http ou https) ; sert aussi d'identifiant de l'application. */
  readonly url: string;
  /** Image intégrée (`data:image/...`), icône de police (`font:nom`) ou `null`. */
  readonly picture: string | null;
}

/** Un élément de la barre : une application ou un séparateur. */
export type ToolbarEntryDto = AppDto | 'separator';

// #region Médias

/** Commande de lecture qu'un site sait traiter. */
export type MediaAction = 'play' | 'pause' | 'previoustrack' | 'nexttrack';

/** État média d'un site, après validation. */
export interface MediaState {
  /** Durée en secondes, `null` si inconnue. */
  readonly duration: number | null;
  /** Position en secondes, `null` si la durée est inconnue. */
  readonly position: number | null;
  /** Titre du morceau. */
  readonly title: string;
  /** Artiste ou auteur. */
  readonly artist: string;
  /** Adresse de la pochette, `null` s'il n'y en a pas. */
  readonly artwork: string | null;
  /** Lecture en cours (et non en pause). */
  readonly playing: boolean;
  /** Commandes que le site accepte. */
  readonly actions: readonly MediaAction[];
}

/** État affiché par la fenêtre de contrôle du morceau d'une application. */
export interface MediaPayload extends MediaState {
  /** Adresse de l'application qui joue le morceau. */
  readonly url: string;
  /** Le son de l'application est coupé. */
  readonly muted: boolean;
}

/** Ce que la barre affiche sur le bouton d'une application. */
export interface IndicatorsDto {
  /** Adresse de l'application concernée. */
  readonly url: string;
  /** Nombre de messages non lus. */
  readonly badge: number;
  /** Le site émet du son. */
  readonly audible: boolean;
  /** Le son est coupé par l'utilisateur. */
  readonly muted: boolean;
  /** Pochette du morceau, `null` s'il n'y en a pas. */
  readonly cover: string | null;
  /** Avancée du morceau entre 0 et 1, `null` si inconnue. */
  readonly progress: number | null;
  /** Le site expose un morceau en cours. */
  readonly hasMedia: boolean;
  /** Joue un morceau mais ne pilote pas la barre des tâches. */
  readonly ignored: boolean;
}

// #endregion

// #region Mises à jour

/** Étape du cycle de mise à jour. */
export type UpdateStage = 'uptodate' | 'available' | 'downloading' | 'ready';

/** Serveur de mises à jour interrogé par Squirrel : les versions publiées, ou les pré-versions. */
export type UpdateChannel = 'stable' | 'test';

/** État complet de la mise à jour, envoyé aux pages et à la zone de notification. */
export interface UpdateState {
  /** Étape courante. */
  readonly etat: UpdateStage;
  /** Vérification en cours. */
  readonly verification: boolean;
  /** Version installée. */
  readonly versionActuelle: string;
  /** La version installée est une pré-version (`X.Y.Z-rcN`). */
  readonly prerelease: boolean;
  /** Version publiée plus récente, `null` s'il n'y en a pas. */
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

/** Thème lié à une saison. */
export type SeasonTheme = 'cerisier' | 'printemps' | 'ete' | 'automne' | 'hiver' | 'noel';

/** Ciel forcé par le mode debug (développement seulement) ; `null` laisse la valeur réelle. */
export interface SkyOverrideDto {
  /** Thème de saison forcé (hiver, noel, automne, printemps, cerisier, ete). */
  readonly season: string | null;
  /** Moment forcé (aube, jour, crepuscule, nuit). */
  readonly moment: string | null;
  /** Météo forcée : `pluie` ou `sec`. */
  readonly weather: 'pluie' | 'sec' | null;
}

/** Saison en cours et prochain changement de thème automatique. */
export interface SeasonInfo {
  /** Thème de saison du jour. */
  readonly theme: SeasonTheme;
  /** Thème de la saison suivante. */
  readonly nextTheme: SeasonTheme;
  /** Jour du prochain changement, au format AAAA-MM-JJ. */
  readonly nextDate: string;
}

/** Permissions qui demandent une confirmation (et donc qu'on mémorise). */
export type AskablePermission = 'media' | 'geolocation' | 'fullscreen';

/** Décision mémorisée pour un site et une permission. */
export interface PermissionDecision {
  /** Origine du site (schéma, domaine, port). */
  readonly origin: string;
  /** Permission concernée. */
  readonly permission: AskablePermission;
  /** `true` si l'utilisateur a autorisé, `false` s'il a refusé. */
  readonly allowed: boolean;
}

/** Un écran proposé dans les paramètres. */
export interface DisplayInfo {
  /** Identifiant Electron de l'écran. */
  readonly id: number;
  /** Nom lisible affiché dans la liste. */
  readonly label: string;
  /** Écran principal du système. */
  readonly isPrimary: boolean;
}

// #endregion

// #region Menu contextuel

/** Action déclenchée par un élément du menu contextuel d'un bouton. */
export type ContextMenuAction = 'delete' | 'addseparator' | 'goUp' | 'goDown' | 'toggleMute' | 'edit';

/** Un élément du menu contextuel. */
export interface ContextMenuItem {
  /** Libellé affiché. */
  readonly text: string;
  /** Texte de l'infobulle. */
  readonly title: string;
  /** Action à exécuter au clic. */
  readonly action: ContextMenuAction;
  /** Données renvoyées avec l'action (adresse de l'application visée, etc.). */
  readonly data: Readonly<Record<string, string | null | undefined>>;
  /** Élément grisé (par exemple « monter » sur le premier bouton). */
  readonly disabled?: boolean;
}

// #endregion
