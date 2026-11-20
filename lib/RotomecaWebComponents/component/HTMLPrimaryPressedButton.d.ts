import { HTMLCustomPressedButton } from '../abstract/HTMLCustomPressedButton.js';
import type { Rule } from '../libs/StyleComponent.js';

/** Bouton à bascule, de forme principale. */
export class HTMLPrimaryPressedButton extends HTMLCustomPressedButton {
  static get CssRules(): Rule[];
  static get TAG(): string;
}
