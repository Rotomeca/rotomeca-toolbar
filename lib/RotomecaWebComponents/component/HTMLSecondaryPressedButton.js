import { HTMLCustomElement } from '../abstract/HTMLCustomElement.js';
import { TAG_PREFIX } from '../libs/config.js';
import { StyleComponent } from '../libs/StyleComponent.js';
import { HTMLPrimaryPressedButton } from './HTMLPrimaryPressedButton.js';
import { HTMLSecondaryButton } from './HTMLSecondaryButton.js';

export { HTMLSecondaryPressedButton };

/**
 * @class
 * @classdesc Classe quie gère et représente un bouton à été principal
 * @extends HTMLCustomPressedButton
 */
class HTMLSecondaryPressedButton extends HTMLPrimaryPressedButton {
  /**
   * Liste des data :
   *
   * - data-pressed, true si le bouton est pressé par défaut
   */
  constructor() {
    super();
  }

  /**
   * Est appelé à l'affichage de l'élément
   * @protected
   * @override
   */
  _p_main() {
    super._p_main();

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLSecondaryButton.CssRules);
      this.startingStyle.addSomeCss(HTMLSecondaryPressedButton.CssRules);
    }
  }

  /**
   * Règles css si le shadow_dom est actif
   * @static
   * @type {Rule[]}
   * @readonly
   */
  static get CssRules() {
    return StyleComponent.RuleClass.Write({
      ':host(:state(pressed))': {
        'background-color':
          'var(--ce-html-secondary-button-background-color-pressed, var(--ce-html-button-background-color-pressed, #6d74b5))',
        color:
          'var(--ce-html-secondary-button-text-color-pressed, var(--ce-html-button-text-color-pressed, #ffffff))',
        border:
          'var(--ce-html-secondary-button-border-pressed, var(--ce-html-button-border-pressed, solid thin #6d74b5))',
      },
      ':host(:state(pressed):hover)': {
        'background-color':
          'var(--ce-html-secondary-button-background-color-pressed-hover, var(--ce-html-secondary-button-background-color-hover, var(--ce-html-button-background-color-hover, #484d7a)))',
        color:
          'var(--ce-html-secondary-button-text-color-pressed-hover, var(--ce-html-secondary-button-text-color-hover, var(--ce-html-button-text-color-hover, #ffffff)))',
        border:
          'var(--ce-html-secondary-button-border-pressed-hover, var(--ce-html-secondary-button-border-hover, var(--ce-html-button-border-hover, solid thin #484d7a)))',
      },
      ':host(:state(pressed):active)': {
        'background-color':
          'var(--ce-html-secondary-button-background-color-pressed-active, var(--ce-html-button-background-color-pressed-active, var(--ce-html-button-background-color, #363a5b)))',
        color:
          'var(--ce-html-secondary-button-text-color-pressed-active, var(--ce-html-button-text-color-pressed-active, var(--ce-html-button-text-color, #ffffff)))',
        border:
          'var(--ce-html-secondary-button-border-pressed-active, var(--ce-html-button-border-pressed-active, var(--ce-html-button-border, solid thin #363a5b)))',
      },
    });
  }

  /**
   * TAG de la balise
   * @type {string}
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-secondary-pressed-button`;
  }
}

HTMLCustomElement.TryDefine(
  HTMLSecondaryPressedButton.TAG,
  HTMLSecondaryPressedButton,
);
