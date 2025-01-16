import { HTMLCustomElement } from '../abstract/HTMLCustomElement.js';
import { HTMLCustomPressedButton } from '../abstract/HTMLCustomPressedButton.js';
import { TAG_PREFIX } from '../libs/config.js';
import { StyleComponent } from '../libs/StyleComponent.js';
import { HTMLPrimaryButton } from './HTMLPrimaryButton.js';

export { HTMLPrimaryPressedButton };

/**
 * @class
 * @classdesc Classe quie gère et représente un bouton à été principal
 * @extends HTMLCustomPressedButton
 */
class HTMLPrimaryPressedButton extends HTMLCustomPressedButton {
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
      this.startingStyle.addSomeCss(HTMLPrimaryButton.CssRules);
      this.startingStyle.addSomeCss(HTMLPrimaryPressedButton.CssRules);
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
          'var(--ce-html-button-background-color-pressed, #6d74b5)',
        color: 'var(--ce-html-button-text-color-pressed, #ffffff)',
        border: 'var(--ce-html-button-border-pressed, solid thin #6d74b5)',
      },
      ':host(:state(pressed):hover)': {
        'background-color':
          'var(--ce-html-button-background-color-pressed-hover, #363a5b)',
        color: 'var(--ce-html-button-text-color-pressed-hover, #ffffff)',
        border:
          'var(--ce-html-button-border-pressed-hover, solid thin #363a5b)',
      },
      ':host(:state(pressed):active)': {
        'background-color':
          'var(--ce-html-button-background-color-pressed-active, #484d7a)',
        color: 'var(--ce-html-button-text-color-pressed-active, #ffffff)',
        border:
          'var(--ce-html-button-border-pressed-active, solid thin #484d7a)',
      },
    });
  }

  /**
   * TAG de la balise
   * @type {string}
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-primary-pressed-button`;
  }
}

HTMLCustomElement.TryDefine(
  HTMLPrimaryPressedButton.TAG,
  HTMLPrimaryPressedButton,
);
