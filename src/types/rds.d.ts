/**
 * Types des composants `rds-*` du design system utilisés par les pages.
 *
 * Importé par les scripts des pages ; ne décrit que les propriétés réellement utilisées.
 */

/** `<rds-icon-button>` : bouton d'icône, à bascule s'il est sélectionnable. */
export interface RdsIconButton extends HTMLElement {
  /** État de bascule : `true` quand le bouton est enfoncé. */
  selected: boolean;
  /** Bloque les interactions. */
  disabled: boolean;
}

/** `<rds-button>`. */
export interface RdsButton extends HTMLElement {
  /** Bloque les interactions. */
  disabled: boolean;
}

/** Évènement du bouton d'icône ajouté à la carte des évènements du DOM. */
declare global {
  interface HTMLElementEventMap {
    'rds-icon-button:toggle': CustomEvent<{ selected: boolean }>;
  }
}

/** Champ de saisie (`<rds-input>`). */
export interface RdsInput extends HTMLElement {
  /** Texte saisi. */
  value: string;
}

/** Champ de choix de fichier (`<rds-file-input>`). */
export interface RdsFileInput extends HTMLElement {
  /** Copie de la liste des fichiers choisis. */
  readonly files: readonly File[];
  /** Vide la liste des fichiers. */
  clear(): void;
}

/** `<rds-select>` : liste déroulante. */
export interface RdsSelect extends HTMLElement {
  /** Valeur de l'option choisie. */
  value: string;
}

/** `<rds-segmented-control>` : choix parmi quelques options visibles. */
export interface RdsSegmentedControl extends HTMLElement {
  /** Valeur de l'option choisie. */
  value: string;
}

/** `<rds-switch>` : interrupteur. */
export interface RdsSwitch extends HTMLElement {
  /** `true` quand l'interrupteur est activé. */
  checked: boolean;
}

/** `<rds-progress>` : barre de progression (indéterminée sans valeur). */
export interface RdsProgress extends HTMLElement {
  /** Avancement en pourcentage. */
  value: number;
  /** Texte affiché avec la barre. */
  label: string;
}

/** `<rds-loading-button>` : bouton avec indicateur de chargement. */
export interface RdsLoadingButton extends HTMLElement {
  /** Affiche l'indicateur de chargement. */
  loading: boolean;
  /** Bloque les interactions. */
  disabled: boolean;
}

/** Évènements de changement des champs ajoutés à la carte des évènements du DOM. */
declare global {
  interface HTMLElementEventMap {
    'rds-select:change': CustomEvent<{ value: string }>;
    'rds-segmented-control:change': CustomEvent<{ value: string }>;
    'rds-switch:change': CustomEvent<{ checked: boolean }>;
  }
}
