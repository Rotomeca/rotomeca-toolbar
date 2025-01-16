import { HTMLCustomElement } from '../abstract/HTMLCustomElement.js';
import { TAG_PREFIX } from '../libs/config.js';
import { EMPTY_STRING } from '../libs/constants.js';
import { StyleComponent } from '../libs/StyleComponent.js';

/**
 * @class
 * @classdesc Représente un élément qui ne pourra être lu que par lecteur d'écran
 * @extends HTMLCustomElement
 */
export class HTMLScreenReaderOnly extends HTMLCustomElement {
  /**
   * Data :
   *
   * - data-template-id, template qui sera utiliser pour afficher l'intérieur des données (optionnel)
   */
  constructor() {
    super();
  }

  /**
   * Appelé lorsque l'élément s'affiche
   * @override
   * @protected
   */
  _p_main() {
    super._p_main();

    if (this.shadowEnabled())
      this.startingStyle.addSomeCss(HTMLScreenReaderOnly.CSSRule);
    else this.classList.add('sr-only');
  }

  /**
   * Règles css
   * @type {Rule[]}
   * @static
   * @readonly
   */
  static get CSSRule() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        border: 0,
        clip: 'rect(0, 0, 0, 0)',
        height: '1px',
        margin: '-1px',
        overflow: 'hidden',
        padding: 0,
        position: 'absolute',
        width: '1px',
      },
    });
  }

  /**
   * Créer une node HTMLScreenReaderOnly
   * @param {Object} [options={}]
   * @param {?string} [options.text=null] Texte à l'intérieur de l'élément
   * @param {boolean} [options.label=false] p sinon label
   * @returns {HTMLScreenReaderOnly}
   */
  static CreateNode({ text = null, label = false } = {}) {
    /**
     * @type {HTMLScreenReaderOnly}
     */
    let node = document.createElement(this.TAG);

    if (text) {
      node.textContent = EMPTY_STRING;
      let content = document.createElement(label ? 'label' : 'p');
      content.appendChild(node.createText(text));
      node.appendChild(content);
      content = null;
    }

    return node;
  }

  /**
   * Tag de l'élément
   * @static
   * @type {string}
   * @readonly
   * @default `${TAG_PREFIX}-screen-reader-only`
   */
  static get TAG() {
    return `${TAG_PREFIX}-screen-reader-only`;
  }
}

HTMLCustomElement.TryDefine(HTMLScreenReaderOnly.TAG, HTMLScreenReaderOnly);
