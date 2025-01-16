import { SpecialKeyCode } from '../libs/KeyCode.js';
import { StyleComponent } from '../libs/StyleComponent.js';
import { HTMLCustomInternalsElement } from './HTMLCustomInternalsElement.js';

export { HTMLCustomButton };

/**
 * @class
 * @classdesc Classe de base pour les bouton custom
 * @abstract
 * @extends HTMLCustomInternalsElement
 */
class HTMLCustomButton extends HTMLCustomInternalsElement {
  /**
   * Classe abstraite, ne pas instancier.
   */
  constructor() {
    super();
  }

  /**
   * Est appelé quand l'élément est affiché
   * @override
   * @protected
   */
  _p_main() {
    super._p_main();

    HTMLCustomButton.ToButton(this);
    this.internals.states.add('htmlcustombutton');

    if (this._p_get_data('form') === 'secondary') this.set_secondary_form();

    if (this.shadowEnabled()) {
      this.startingStyle.addCss(
        ':host(:disabled), :host([aria-disabled="true"])',
        {
          css_properties: { opacity: '0.6' },
        },
      );
      this.startingStyle.addSomeCss(HTMLCustomButton.CssRules);
    }
  }

  /**
   * Change la forme du bouton en sa forme secondaire.
   * @returns {this} Chaînage
   */
  set_secondary_form() {
    this.internals.states.add('secondary');

    return this;
  }

  /**
   * Change la forme du bouton en sa forme originelle
   * @returns {this} Chaînage
   */
  remove_secondary_form() {
    this.internals.states.delete('secondary');

    return this;
  }

  /**
   * Ajoute des attributes et des comportements à une node pour qu'elle se comporte en bouton.
   * @param {HTMLElement} node Node qui obtiendra les attributs pour qu'il se comporte comme un bouton
   * @param {Object} [options={}]
   * @param {boolean} [options.stylise=false] Si on ajoute les classes et styles pour qu'il ressemble à un bouton visuellement
   * @returns {HTMLElement} Du même type que node
   * @static
   */
  static ToButton(node, { stylise = false } = {}) {
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', 0);

    node.addEventListener(
      'keydown',
      function (caller, event) {
        switch (event.key) {
          case SpecialKeyCode.enter:
          case SpecialKeyCode.space:
            caller.click();
            break;
          default:
            break;
        }
      }.bind(null, node),
    );

    if (stylise) {
      node.classList.add('html-custom-button');
      node.style.cursor = 'pointer';
    }

    return node;
  }

  /**
   * Règles css si le shadow_dom est actif
   * @static
   * @type {Rule[]}
   */
  static get CssRules() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        '-webkit-user-select': 'none',
        '-ms-user-select': 'none',
        'user-select': 'none',
        'border-radius': 'var(--ce-html-button-border-radius, 100px)',
        transition: 'var(--ce-html-button-transition, all 0.1s ease-in)',
        padding: 'var(--ce-html-button-padding, 5px 10px)',
        cursor: 'pointer',
        display: 'var(--ce-html-button-display, inline-block)',
      },
      ':host(:focus)': {
        'box-shadow':
          'var(--ce-html-button-box-shadox-focus, 0 0 0 0.2rem #484D7A69)',
      },
      ':host(:state(secondary))': {
        '--ce-html-button-border-radius':
          'var(--ce-html-button-border-radius-secondary, 5px)',
      },
    });
  }
}

/**
 * @enum {string}
 * @static
 */
HTMLCustomButton.Forms = Object.freeze({
  default: 'default',
  secondary: 'secondary',
});
