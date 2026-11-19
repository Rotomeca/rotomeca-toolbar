/** Les parties des composants `rds-*` (design system) que les pages utilisent. */

/** `<rds-icon-button>` à bascule. */
export interface RdsIconButton extends HTMLElement {
  selected: boolean;
}

/** `<rds-button>`. */
export interface RdsButton extends HTMLElement {
  disabled: boolean;
}

declare global {
  interface HTMLElementEventMap {
    'rds-icon-button:toggle': Event;
  }
}
