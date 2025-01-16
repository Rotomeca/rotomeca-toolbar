import { HTMLPrimaryPressedButton } from "../../../lib/RotomecaWebComponents/component/HTMLPrimaryPressedButton.js";
import { TAG_PREFIX } from "../../../lib/RotomecaWebComponents/libs/config.js";
import { EMPTY_STRING } from "../../../lib/RotomecaWebComponents/libs/constants.js";
import { StyleComponent } from "../../../lib/RotomecaWebComponents/libs/StyleComponent.js";

export { FullScreenPressedButton };

class FullScreenPressedButton extends HTMLPrimaryPressedButton {
  constructor() {
    super();
  }

  get pictDown() {
    return       this.root.querySelector('#pictdown');
  }

  get pictUp() {
    return       this.root.querySelector('#pictup');
  }

  _p_main() {
    super._p_main();

    let div = document.createElement('div');
    div.append(...this.root.childNodes);

    this.root.appendChild(div);
    div = null;

    this.onpressed.push(() => {
      this.pictDown.style.display = EMPTY_STRING;
      this.pictUp.style.display = 'none';
    });

    this.onunpressed.push(() => {
      this.pictDown.style.display = 'none';
      this.pictUp.style.display = EMPTY_STRING;
    });


    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(FullScreenPressedButton.CssRules);
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
      ':host': {
        height: '100%',
        width: '100%',
        display: 'block',
        padding: '0',
        margin: '0',
        border: 'none !important',
        'border-radius': '5px 5px 0 0 !important',
      },
      ':host > div': {
        'height':'var(--we-html-fs-pressed-button-div-height, 100%)',
        'display':'var(--we-html-fs-pressed-button-div-display, flex)',
        'align-items': 'var(--we-html-fs-pressed-button-div-v-align, center)',
        'justify-content': 'var(--we-html-fs-pressed-button-div-h-align, center)'
      }
    });
  }

  /**
   * TAG de la balise
   * @type {string}
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-fullscreen-primary-pressed-button`;
  }
}

FullScreenPressedButton.TryDefine(
  FullScreenPressedButton.TAG,
  FullScreenPressedButton,
);
