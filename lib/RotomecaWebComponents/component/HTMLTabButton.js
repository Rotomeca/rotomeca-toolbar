import { HTMLCustomElement } from '../abstract/HTMLCustomElement.js';
import { HTMLCustomPressedButton } from '../abstract/HTMLCustomPressedButton.js';
import { TAG_PREFIX } from '../libs/config.js';
import { EMPTY_STRING } from '../libs/constants.js';
import { StyleComponent } from '../libs/StyleComponent.js';

/**
 * @class
 * @classdesc Classe qui gère et représente un onglet
 * @extends HTMLCustomPressedButton
 */
export class HTMLTabButton extends HTMLCustomPressedButton {
  /**
   * Liste des data :
   *
   * - data-pressed, true si pressé par défaut. aria-selected à le même rôle. (optionnel)
   *
   * - data-id, id du bouton. Ne pas le mettre si l'attribut id existe déjà.
   *
   * - data-namespace contient le nom qui "liera" tout les onglets entre eux
   *
   * - data-template-id, template qui sera utiliser pour afficher l'intérieur des données (optionnel)
   *
   * - data-shadow, si false, le shadow-dom ne sera pas utilisé (optionnel)
   */
  constructor() {
    super();

    this.onpressed.push(() => {
      this.disable()
        .attr('tabindex', { value: 0 })
        .attr('aria-selected', { value: true });

      let others = this.rootNode.querySelectorAll(
        `${HTMLTabButton.TAG}[data-namespace="${this.namespace}"]`,
      );

      if (others.length) {
        for (const element of others) {
          if (element.internalId !== this.internalId) element.unpress();
        }
      }

      this.internals.states.add('selected');
    });

    this.onunpressed.push(() => {
      this.enable()
        .attr('tabindex', { value: -1 })
        .attr('aria-selected', { value: false });
      this.internals.states.delete('selected');
    });

    if (this.getAttribute('aria-selected')) {
      this.setAttribute('data-pressed', true);
    }
  }

  /**
   * Id interne.
   *
   * Si l'attribut id n'éxiste pas, il sera généré.
   * @type {string}
   * @readonly
   */
  get internalId() {
    let id = this.id || this._p_get_data('id');

    if (!id) {
      this.setAttribute(
        'data-id',
        this._p_generate_id({ namespace: 'internal-tab-button' }),
      );
      id = this._p_get_data('id');
    }

    return id;
  }

  /**
   * Element controlé par l'onglet
   * @type {?HTMLElement}
   * @readonly
   */
  get control() {
    let node = this.rootNode.querySelector(
      `[aria-labelledby=${this.internalId}]`,
    );

    if (node) {
      if (!node.hasAttribute('id'))
        node.setAttribute('id', `pane-${this.internalId}`);
    } else node = this.rootNode.querySelector(`#pane-${this.internalId}`);

    return (
      node ||
      this.rootNode.querySelector(`#${this.getAttribute('aria-controls')}`)
    );
  }

  /**
   * Espace de nom du bouton, si il n'éxiste pas, il sera créé
   * @type {string}
   * @readonly
   */
  get namespace() {
    let namespace = this.attr('data-namespace');
    if (!namespace) {
      namespace = this._p_generate_id({ namespace: 'tab-button' });
      this.setAttribute('data-namespace', namespace);
    }

    return namespace;
  }

  /**
   * Si l'élément est séléctionné ou non
   * @type {string}
   * @readonly
   */
  get isSelected() {
    return this.isPressed;
  }

  /**
   * Si l'élément est un HTMLTabButton
   * @type {boolean}
   * @readonly
   */
  get isHTMLTabButton() {
    return true;
  }

  /**
   * Appelé lorsque l'élément s'affiche
   * @override
   * @protected
   */
  _p_main() {
    super._p_main();

    let control = this.control;
    if (control) {
      this.setAttribute('aria-controls', control.id);
      control = null;
    } else
      console.warn('/!\\[HTMLTabButton]Le bouton n\'a pas de contenu associé');

    this.addEventListener('keydown', this._keypress_action.bind(this));

    this.setAttribute('role', 'tab');

    if (this.isSelected) {
      this.setAttribute('tabindex', '0');
    } else this.setAttribute('tabindex', -1);

    if (this.shadowEnabled()) {
      this.startingStyle.addSomeCss(HTMLTabButton.CssRules);
    }
  }

  /**
   * Action éfféctué lorsqu'une touche est appuyé.
   * @param {Event} e
   * @returns {void}
   * @event
   * @private
   */
  _keypress_action(e) {
    let item;
    switch (e.code) {
      case 'ArrowRight':
        item = e.currentTarget.nextElementSibling;
        break;

      case 'ArrowLeft':
        item = e.currentTarget.previousElementSibling;
        break;

      case 'End':
        item = e.currentTarget;
        while (
          item.nextElementSibling !== null &&
          item.nextElementSibling.isHTMLTabButton
        ) {
          item = item.nextElementSibling;
        }
        break;

      case 'Home':
        item = e.currentTarget;
        while (
          item.previousElementSibling !== null &&
          item.previousElementSibling.isHTMLTabButton
        ) {
          item = item.previousElementSibling;
        }
        break;

      default:
        return;
    }

    if (item && item.isHTMLTabButton) {
      item.click();
      item.focus();
    }
  }

  /**
   * Règles css si le shadow_dom est actif
   * @static
   * @type {Rule[]}
   */
  static get CssRules() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        padding: 'var(--ce-html-custom-tab-padding, 1rem 1.4rem)',
        display: 'var(--ce-html-custom-tag-display, inline-block)',
        margin: 'var(--ce-html-custom-tag-margin, 0 15px)',
        'border-bottom':
          'var(--ce-html-custom-tag-border-bottom, 2px solid transparent)',
        color: 'var(--ce-html-custom-tab-text-color, black)',
        'background-color':
          'var(--ce-html-custom-tab-background-color, transparent)',
        'border-radius': 'var(--ce-html-custom-tab-border-radius, 0px)',
      },
      ':host(:hover)': {
        padding:
          'var(--ce-html-custom-tab-padding-hover, var(--ce-html-custom-tab-padding, 1rem 1.4rem))',
        display:
          'var(--ce-html-custom-tag-display-hover, var(--ce-html-custom-tag-display, inline-block))',
        margin:
          'var(--ce-html-custom-tag-margin-hover, var(--ce-html-custom-tag-margin, 0 15px))',
        'border-bottom':
          'var(--ce-html-custom-tag-border-bottom-hover, 2px solid #5069bc)',
        color:
          'var(--ce-html-custom-tab-text-color-hover, var(--ce-html-custom-tab-text-color, black))',
        'background-color':
          'var(--ce-html-custom-tab-background-color-hover, var(--ce-html-custom-tab-background-color, transparent))',
      },
      ':host(:state(pressed)), :host(:state(selected))': {
        'pointer-events': 'none',
        padding:
          'var(--ce-html-custom-tab-padding-selected, var(--ce-html-custom-tab-padding, 1rem 1.4rem))',
        display:
          'var(--ce-html-custom-tag-display-selected, var(--ce-html-custom-tag-display, inline-block))',
        margin:
          'var(--ce-html-custom-tag-margin-selected, var(--ce-html-custom-tag-margin, 0 15px))',
        'border-bottom':
          'var(--ce-html-custom-tag-border-bottom-selected, 2px solid #5069bc)',
        color:
          'var(--ce-html-custom-tab-text-color-selected, var(--ce-html-custom-tab-text-color, black))',
        'background-color':
          'var(--ce-html-custom-tab-background-color-selected, var(--ce-html-custom-tab-background-color, transparent))',
      },
    });
  }

  /**
   * Créer une node HTMLTabButton
   * @param {string} namespace Espace du bouton
   * @param {Object} [options={}]
   * @param {string} [options.text=''] Contenu du bouton
   * @param {boolean} [options.selected=false] Si l'onglet est séléctionné par défaut
   * @param {Document} [options.context=window.document] Contexte par défaut
   * @returns {HTMLTabButton}
   * @static
   */
  static CreateNode(
    namespace,
    { text = EMPTY_STRING, selected = false, context = window.document } = {},
  ) {
    let node = context.createElement(this.TAG);

    node.setAttribute('data-namespace', namespace);

    if (selected) {
      node.setAttribute('aria-selected', true);
      node.setAttribute('tabindex', '0');
    } else node.setAttribute('tabindex', -1);

    if (text || false) node.textContent = text;

    return node;
  }

  /**
   * TAG de la balise
   * @type {string}
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-tab-button`;
  }
}

HTMLCustomElement.TryDefine(HTMLTabButton.TAG, HTMLTabButton);
