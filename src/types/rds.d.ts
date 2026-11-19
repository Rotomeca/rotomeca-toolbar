/** Les parties des composants `rds-*` (design system) que les pages utilisent. */

/** `<rds-icon-button>` : bouton d'icône, à bascule s'il est sélectionnable. */
export interface RdsIconButton extends HTMLElement {
  selected: boolean;
  disabled: boolean;
}

/** `<rds-button>`. */
export interface RdsButton extends HTMLElement {
  disabled: boolean;
}

declare global {
  interface HTMLElementEventMap {
    'rds-icon-button:toggle': CustomEvent<{ selected: boolean }>;
  }
}

/** Champ de saisie (`<rds-input>`). */
export interface RdsInput extends HTMLElement {
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
  value: string;
}

/** `<rds-segmented-control>` : choix parmi quelques options visibles. */
export interface RdsSegmentedControl extends HTMLElement {
  value: string;
}

/** `<rds-switch>` : interrupteur. */
export interface RdsSwitch extends HTMLElement {
  checked: boolean;
}

/** `<rds-progress>` : barre de progression (indéterminée sans valeur). */
export interface RdsProgress extends HTMLElement {
  value: number;
  label: string;
}

/** Bouton avec indicateur de chargement. */
export interface RdsLoadingButton extends HTMLElement {
  loading: boolean;
  disabled: boolean;
}

declare global {
  interface HTMLElementEventMap {
    'rds-select:change': CustomEvent<{ value: string }>;
    'rds-segmented-control:change': CustomEvent<{ value: string }>;
    'rds-switch:change': CustomEvent<{ checked: boolean }>;
  }
}
