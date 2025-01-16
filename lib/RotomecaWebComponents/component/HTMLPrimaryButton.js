import { HTMLCustomButton } from '../abstract/HTMLCustomButton.js';
import { HTMLCustomElement } from '../abstract/HTMLCustomElement.js';
import { TAG_PREFIX } from '../libs/config.js';
import { StyleComponent } from '../libs/StyleComponent.js';

export { HTMLPrimaryButton };

/**
 * @class
 * @classdesc Représente un bouton primaire en HTML
 * @extends HTMLCustomButton
 */
class HTMLPrimaryButton extends HTMLCustomButton {
  /**
   * Constructeur de la classe.
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

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLPrimaryButton.CssRules);
    }
  }

  /**
   * Créer une node HTMLPrimaryButton
   * @param {Object} [options={}]
   * @param {HTMLCustomButton.Forms} [options.form=HTMLCustomButton.Forms.default] Forme de l'élément
   * @param {string | HTMLElement | null} [options.content=null] Contenu du bouton. Si string, le contenu sera remplacé par le contenu.
   * @param {Document} [options.context=window.document] Context du document. /!\L'élément doit être défini dans le context si différent de window.
   * @returns {HTMLPrimaryButton}
   * @static
   */
  static CreateNode({
    form = HTMLCustomButton.Forms.default,
    content = null,
    context = window.document,
  } = {}) {
    /**
     * @type {HTMLPrimaryButton}
     */
    let node = context.createElement(this.TAG);

    if (content) {
      if (typeof content === 'string') node.root.innerHTML = content;
      else node.root.appendChild(content);
    }

    switch (form) {
      case HTMLCustomButton.Forms.secondary:
        node.set_secondary_form();
        break;

      default:
        break;
    }

    return node;
  }

  /**
   * Tag de la balise
   * @type {string}
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-primary-button`;
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
        'background-color': 'var(--ce-html-button-background-color, #363a5b)',
        color: 'var(--ce-html-button-text-color, #ffffff)',
        border: 'var(--ce-html-button-border, solid thin #363a5b)',
      },
      ':host(:hover)': {
        'background-color':
          'var(--ce-html-button-background-color-hover, #484d7a)',
        color: 'var(--ce-html-button-text-color-hover, #ffffff)',
        border: 'var(--ce-html-button-border-hover, solid thin #484d7a)',
      },
      ':host(:active)': {
        'background-color':
          'var(--ce-html-button-background-color-active, #6d74b5)',
        color: 'var(--ce-html-button-text-color-active, #ffffff)',
        border: 'var(--ce-html-button-border-active, solid thin #6d74b5)',
      },
    });
  }
}

HTMLCustomElement.TryDefine(HTMLPrimaryButton.TAG, HTMLPrimaryButton);
