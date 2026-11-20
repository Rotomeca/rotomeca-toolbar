import { HTMLCustomElement } from './HTMLCustomElement.js';

/** Bouton qui reste enfoncé (bascule). */
export class HTMLCustomPressedButton extends HTMLCustomElement {
  readonly isPressed: boolean;

  press(options?: { enableEvent?: boolean }): this;
  unpress(options?: { enableEvent?: boolean }): this;
  toggleState(): this;
}
