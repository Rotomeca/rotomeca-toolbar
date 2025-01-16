import { HTMLCustomElement } from '../abstract/HTMLCustomElement.js';
import { HTMLCustomInternalsElement } from '../abstract/HTMLCustomInternalsElement.js';
import { TabSwitchedEvent } from '../events/TabSwitchedEvent.js';
import { TAG_PREFIX } from '../libs/config.js';
import { EMPTY_STRING } from '../libs/constants.js';
import { JsEvent } from '../libs/events.js';
import { StyleComponent } from '../libs/StyleComponent.js';
import { HTMLScreenReaderOnly } from './HTMLScreenReaderOnly.js';
import { HTMLTabButton } from './HTMLTabButton.js';

export { HTMLTabElement };

/**
 * @callback TabSwitchedCallback
 * @param {string} nav Id qui se trouvant dans data-nav
 * @returns {void}
 */

/**
 * @class
 * @classdesc Représente et gère un système d'onglet accessible
 * @extends HTMLCustomElement
 */
class HTMLTabElement extends HTMLCustomInternalsElement {
  /**
   * Utilisation :
   *
   * Définissez data-nav qui contient les onglets, séparé par des virgules ainsi que data-voice qui correspond à la description de l'élément.
   *
   * Les divs enfants doivent contenir le data data-owner qui correspond à une des données du data-nav.
   *
   * Evènements :
   *
   * - event:custom:tab.switched => Lorsqu'un onglet est changé. L'id de l'onglet, l'onglet ainsi que l'instance est envoyer en argument.
   *
   * Liste des états (pour les custom-states css) :
   *
   * - not-loaded => Quand l'élément n'a pas été afficher une première fois
   *
   * - loaded => Une fois que l'élément a été afficher une première fois
   *
   * - tab-%element% => %element% par un des id de data-nav, état en cours
   *
   * Data :
   *
   * - data-nav, id des onglets, séparé par une virgule. Si le texte match avec la fonction de localisation, un texte lisuble sera affiché
   *
   * - data-template-id, template qui sera utiliser pour afficher l'intérieur des données (optionnel)
   *
   * - data-shadow, si false, le shadow-dom ne sera pas utilisé (optionnel)
   *
   *@example <{config}-tabs-element data-nav="tab1,tab2,tab3" data-template-id="tab-template"></<{config}-tabs-element>
   */
  constructor() {
    super();

    /**
     * Est appelé à chaque fois qu'un onglet change
     * @type {JsEvent<TabSwitchedCallback}
     */
    this.ontabswitched = new JsEvent();
    this.ontabswitched.add('default', (nav) => {
      this.dispatchEvent(
        new TabSwitchedEvent(
          nav,
          this.root.querySelector(`#${nav}-${this.internalId}`),
          this,
        ),
      );
    });
    this.internals.states.add('not-loaded');
  }

  /**
   * Les ids qui se trouves dans la data-nav qui correspondent aux onglets
   * @type {string[]}
   * @readonly
   */
  get navs() {
    return (this._p_get_data('nav') ?? EMPTY_STRING)
      .replaceAll(' ', EMPTY_STRING)
      .split(',');
  }

  /**
   * Texte du label qui décrit la liste d'onglet
   * @type {string}
   * @default `Regroupe une liste d'onglet comprenant ${this.navs.join(', ')}`
   * @readonly
   */
  get voice() {
    return (
      this._p_get_data('voice') ||
      `Regroupe une liste d'onglet comprenant ${this.navs.join(', ')}`
    );
  }

  /**
   * Id interne de l'élément. Utilise l'id si il a été défini.
   * @type {string}
   * @readonly
   */
  get internalId() {
    let id = this.getAttribute('id') || this._p_get_data('id');

    if (!(id || false)) {
      id = this._p_generate_id({ namespace: 'tab-element' });
      this._p_save_data('id', id);
    }

    return id;
  }

  /**
   * Id de la div qui continet les onglets
   * @type {string}
   * @default `${this.internalId}-tab-container`
   * @readonly
   */
  get tabContainerId() {
    return `${this.internalId}-tab-container`;
  }

  /**
   * Id de la div qui continet les panneaux
   * @type {string}
   * @default `${this.internalId}-content-container`
   * @readonly
   */
  get contentContainerId() {
    return `${this.internalId}-content-container`;
  }

  //#region Main
  /**
   * Est appelé à l'affichage
   * @protected
   * @override
   */
  _p_main() {
    super._p_main();

    //#region TabList
    //Génération de la div qui contient les tabs
    let tabs = document.createElement('div');
    tabs.setAttribute('id', this.tabContainerId);
    tabs.setAttribute('empty', true);
    tabs.setAttribute('role', 'tablist');

    let tab;
    for (const element of this.navs) {
      tab = HTMLTabButton.CreateNode(this.internalId, {
        text: this.gettext(element),
        selected: tabs.hasAttribute('empty'),
      });

      tab.setAttribute(
        'aria-controls',
        `${element}-${this.internalId}-content`,
      );
      tab.setAttribute('id', `${element}-${this.internalId}`);

      tab.onpressed.push((nav) => {
        this.ontabswitched.call(nav);
      }, element);

      if (tabs.hasAttribute('empty')) tabs.removeAttribute('empty');

      tabs.appendChild(tab);

      if (tab.hasAttribute('aria-selected')) {
        tab.press();
        this.internals.states.add(`tab-${element}`);
      }

      tab = null;
    }
    //#endregion tablist

    //#region PaneList
    //Génération de la div qui contient les panneaux
    let contents = document.createElement('div');
    contents.classList.add('panelist');
    contents.setAttribute('id', this.contentContainerId);
    let nodes = [...this.root.querySelectorAll('[data-owner]')];
    for (let index = 0, len = nodes.length, own = null; index < len; ++index) {
      own = nodes[index].getAttribute('data-owner');

      if (own) {
        nodes[index].setAttribute(
          'aria-labelledBy',
          `${own}-${this.internalId}`,
        );
        nodes[index].removeAttribute('data-owner');
      }

      own = nodes[index].getAttribute('aria-labelledBy');

      if (own) {
        if (!own.includes(this.internalId))
          nodes[index].setAttribute(
            'aria-labelledBy',
            `${own}-${this.internalId}`,
          );

        tab = null;
        tabs.querySelectorAll(HTMLTabButton.TAG).forEach((value) => {
          if (!tab) {
            tab = own;
            if (value.internalId === own) own = value;
          }
        });

        if (own?.isSelected) nodes[index].classList.add('selected-content');
        else nodes[index].classList.add('not-selected-content');

        nodes[index].setAttribute('tabindex', own?.isSelected ? 0 : -1);
        nodes[index].classList.add('custom-html-tab-content');
        nodes[index].setAttribute('id', `${tab}-${this.internalId}-content`);
        nodes[index].setAttribute('role', 'tabpanel');
      }

      contents.appendChild(nodes[index]);

      nodes[index] = null;
    }
    //#endregion PaneList

    //#region Listeners
    //Ajout des listeners
    this.ontabswitched.add('default-actions', (id) => {
      for (const key of this.internals.states.keys()) {
        if (key.includes('tab-')) this.internals.states.delete(key);
      }

      this.root
        .querySelectorAll('.custom-html-tab-content')
        .forEach((value) => {
          value.classList.add('not-selected-content');
          value.classList.remove('selected-content');
          value.setAttribute('tabindex', -1);
        });

      let selected = this.root.querySelector(
        `.custom-html-tab-content[aria-labelledBy="${id}-${this.internalId}"]`,
      );

      selected.classList.add('selected-content');
      selected.classList.remove('not-selected-content');
      selected.setAttribute('tabindex', 0);

      this.internals.states.add(`tab-${id}`);

      selected = null;
    });
    //#endregion listeners

    //#region Label
    //Creation du label
    const labelID = `${this.internalId}-label`;
    let label = HTMLScreenReaderOnly.CreateNode({
      text: this.voice,
      label: true,
    });

    label.querySelector('label').setAttribute('id', labelID);

    this.setAttribute('aria-labelledBy', labelID);
    //#endregion label

    //#region DomLoad
    //Ajout au dom
    this.root.append(label, tabs, contents);

    this.startingStyle.addSomeCss(HTMLTabElement.CSSRule);

    this.internals.states.add('loaded');
    this.internals.states.delete('not-loaded');
    //#endregion domload

    //#region FreeVariables
    tabs = null;
    contents = null;
    nodes = null;
    label = null;
    //#endregion freevariables
  }
  //#endregion main

  //#region Static
  /**
   * Liste des règles css qui sera afficher dans le shadow-dom
   * @type {Rule[]}
   * @static
   * @readonly
   */
  static get CSSRule() {
    return StyleComponent.RuleClass.Write({
      ':host': {
        display: 'var(--ce-html-tab-element-display, block)',
      },
      ':host .panelist': {
        'margin-left': 'var(--ce-html-tab-element-panelist-margin-left, 0)',
      },
      ':host [role="tablist"] :first-child': {
        'margin-left':
          'var(--ce-html-tab-element-tablist-margin-left-first, var(--ce-html-tab-element-panelist-margin-left, 0))',
      },
      ':host .not-selected-content': {
        display: 'var(--ce-html-tab-element-content-hidden, none)',
      },
      ':host [role="tablist"]': {
        'margin-bottom':
          'var(--ce-html-tab-element-tablist-margin-bottom, 15px)',
        'text-align': 'var(--ce-html-tab-element-tablist-text-align, left)',
      },
    });
  }

  /**
   * Balise de l'élément
   * @type {string}
   * @default `${TAG_PREFIX}-tabs-element
   * @readonly
   */
  static get TAG() {
    return `${TAG_PREFIX}-tabs-element`;
  }
  //#endregion
}

HTMLCustomElement.TryDefine(HTMLTabElement.TAG, HTMLTabElement);
