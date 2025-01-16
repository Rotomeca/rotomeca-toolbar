import { TAG_PREFIX } from '../libs/config.js';
import { StyleComponent } from '../libs/StyleComponent.js';
import { HTMLPrimaryButton } from './HTMLPrimaryButton.js';

export { HTMLSecondaryButton };

class HTMLSecondaryButton extends HTMLPrimaryButton {
  constructor() {
    super();
  }

  _p_main() {
    super._p_main();

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLSecondaryButton.CssRules);
    }
  }

  /**
   * Tag de la balise
   * @type {string}
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-secondary-button`;
  }

  /**
   * Règles css si le shadow_dom est actif
   * @static
   * @type {Rule[]}
   * @readonly
   */
  static get CssRules() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        'background-color':
          'var(--ce-html-secondary-button-background-color, #ffffff)',
        color: 'var(--ce-html-secondary-button-text-color, #black)',
        border:
          'var(--ce-html-secondary-button-border, var(--ce-html-button-border, solid thin #363a5b))',
      },
      ':host(:hover)': {
        'background-color':
          'var(--ce-html-secondary-button-background-color-hover, var(--ce-html-button-background-color-hover, #484d7a))',
        color:
          'var(--ce-html-secondary-button-text-color-hover, var(--ce-html-button-text-color-hover, #ffffff))',
        border:
          'var(--ce-html-secondary-button-border-hover, var(--ce-html-button-border-hover, solid thin #484d7a))',
      },
      ':host(:active)': {
        'background-color':
          'var(--ce-html-secondary-button-background-color-active, var(--ce-html-button-background-color-active, #6d74b5))',
        color:
          'var(--ce-html-secondary-button-text-color-active, var(--ce-html-button-text-color-active, #ffffff))',
        border:
          'var(--ce-html-secondary-button-border-active, var(--ce-html-button-border-active, solid thin #6d74b5))',
      },
    });
  }
}

HTMLSecondaryButton.TryDefine(HTMLSecondaryButton.TAG, HTMLSecondaryButton);
