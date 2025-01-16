import { HTMLCustomInternalsElement } from '../../../lib/RotomecaWebComponents/abstract/HTMLCustomInternalsElement.js';
import { TAG_PREFIX } from '../../../lib/RotomecaWebComponents/libs/config.js';
import { StyleComponent } from '../../../lib/RotomecaWebComponents/libs/StyleComponent.js';

export class HTMLSeparator extends HTMLCustomInternalsElement {
  constructor() {
    super();
  }

  _p_main() {
    super._p_main();

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLSeparator.CssRule);
    }
  }

  static get CssRule() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        display: 'block',
        width: 'calc(100% - 30px)',
        margin: '0 15px',
        height: '1px',
        'background-color':
          'var(--ce-html-separator-bg,rgba(253, 253, 253, 0.6))',
      },
    });
  }

  static CreateNode() {
    return document.createElement(this.TAG);
  }

  /**
   * @type {string}
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-separator`;
  }
}

HTMLSeparator.TryDefine(HTMLSeparator.TAG, HTMLSeparator);
