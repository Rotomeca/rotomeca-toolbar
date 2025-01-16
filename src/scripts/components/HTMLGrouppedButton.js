import { HTMLCustomElement } from '../../../lib/RotomecaWebComponents/abstract/HTMLCustomElement.js';
import { StyleComponent } from '../../../lib/RotomecaWebComponents/libs/StyleComponent.js';

export class HTMLGrouppedButton extends HTMLCustomElement {
  constructor() {
    super();
  }

  _p_main() {
    this.startingStyle.addSomeCss(HTMLGrouppedButton.CSSRule);
  }

  shadowEnabled() {
    return true;
  }

  static CreateNode() {
    return document.createElement(this.TAG);
  }

  static get CSSRule() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        display: 'flex',
      },
      'button, [role="button"]': {
        'border-radius': 'var(--ce-html-gb-button, 0) !important',
      },
      'button:first-of-type, [role="button"]:first-of-type': {
        '--ce-html-gb-button': '5px 0 0 5px',
      },
      'button:last-child, [role="button"]:last-child': {
        '--ce-html-gb-button': '0 5px 5px 0',
      },
    });
  }

  static get TAG() {
    return 'groupper-button';
  }
}

HTMLGrouppedButton.TryDefine(HTMLGrouppedButton.TAG, HTMLGrouppedButton);
