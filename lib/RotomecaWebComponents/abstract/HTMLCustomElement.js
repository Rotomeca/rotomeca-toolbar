import { StateChangedEvent } from '../events/StateChangedEvent.js';
import { StyleComponent } from '../libs/StyleComponent.js';
import { EMPTY_STRING } from '../libs/constants.js';
import { JsEvent } from '../libs/events.js';
import { Random } from '../libs/random.js';

export { HTMLCustomElement };

const KEY_HIDDEN_STATE = ' �hidden state� ';

/**
 * @class
 * @classdesc Classe de base pour les composants html custom
 * @extends HTMLElement
 * @abstract
 */
class HTMLCustomElement extends HTMLElement {
  static observedAttributes = this._p_observedAttributes();
  static _p_observedAttributes() {
    return [];
  }

  #loaded = false;
  #data = {};
  /**
   * @type {?StyleComponent}
   */
  #style = null;

  /**
   * Classe abstraite, ne pas instancier.
   *
   * Les variables sont cr��es et initilis�es ici.
   *
   * Liste des data :
   *
   * - data-template-id => Id du template qui sera généré si il existe ou si la data a été définie
   *
   * - data-shadow => mettre à false si vous voulez désactiver le shadow dom
   *
   * Un HTMLCustomElement poss�de 3 �v�nements :
   *
   * - onstatechanged => lorsque l'�tat du composant change. (Vous pouvez faire un listener sur event:custom:loaded)
   *
   * - oncustomelementloaded => Lorsque l'�l�ment est affich� une premi�re fois. (Vous pouvez faire un listener sur event:custom:state.changed)
   */
  constructor() {
    super();

    this.onstatechanged = new JsEvent();
    this.oncustomelementloaded = new JsEvent();

    this.oncustomelementloaded.add('default', (caller) => {
      this.dispatchEvent(
        new CustomEvent(HTMLCustomElement.EVENTS.loaded, {
          detail: { caller },
        }),
      );
    });

    this.onstatechanged.add('default', (state, caller) => {
      this.dispatchEvent(new StateChangedEvent(state, caller));
    });

    this.#style = new StyleComponent();

    if (this.shadowEnabled()) this.attachShadow({ mode: 'open' });

    this._p_init();
  }

  /**
   * Récupère le template lié à cet élément si il existe
   * @type {?HTMLTemplateElement}
   * @readonly
   */
  get linkedTemplate() {
    const id = this._p_get_data('template-id');

    if (id || false) return document.querySelector(`template#${id}`);
    else return null;
  }

  connectedCallback() {
    if (!this.#loaded) {
      if (
        'content' in document.createElement('template') &&
        this.linkedTemplate
      ) {
        this.appendChild(this.linkedTemplate.content.cloneNode(true));
      }

      if (this.shadowEnabled()) {
        let childnodes = this.childNodes;

        if (childnodes.length) {
          this.root.append(...childnodes);
        }

        childnodes = null;
      }

      this._p_main();

      if (this.shadowEnabled()) {
        this.#style.addCss(':host(:disabled), :host([aria-disabled="true"])', {
          css_properties: { 'pointer-events': 'none' },
        });
        this.root.prepend(this.#style.build());
      }

      this.#style = null;
      this.#loaded = true;

      this.oncustomelementloaded.call(this);
    }
  }

  disconnectedCallback() {
    this._p_disconnected();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    this._p_onAttributeChanged(name, oldValue, newValue);
  }

  /**
   * Appel� pendent le constructeur
   * @protected
   */
  _p_init() {}
  /**
   * Appel� lorsque l'�l�ment est affich�
   * @protected
   */
  _p_main() {}
  _p_disconnected() {}
  _p_onAttributeChanged(name, oldValue, newValue) {}

  /**
   * Noeud o� l'on doit ajouter d'autres noeux.
   * @type {ShadowRoot | this}
   * @readonly
   */
  get root() {
    return this.shadowEnabled() ? this.shadowRoot : this;
  }

  /**
   * @type {ShadowRoot | Document}
   * @readonly
   */
  get rootNode() {
    return this.getRootNode();
  }

  /**
   * Permet de build un �l�ment de style pour le shadow dom.
   *
   * N'�xiste seulement si l'�l�ment n'a pa �t� charg� une premi�re fois.
   * @type {?StyleComponent}
   * @readonly
   */
  get startingStyle() {
    return this.#style;
  }

  /**
   * Si l'�l�ment � d�j� �t� charg� une premi�re fois ou non.
   * @type {boolean}
   * @readonly
   */
  get isLoaded() {
    return this.#loaded;
  }

  /**
   * Etat de cet �l�ment.
   *
   * Celui-ci est visible via l'attribut 'custom-element-state'.
   * @type {?string}
   */
  get state() {
    return (
      this.attr(HTMLCustomElement.ATTRIBUTE_STATE) ??
      this.#data[KEY_HIDDEN_STATE]
    );
  }

  set state(value) {
    this.setState(value);
  }

  /**
   * R�cup�re l'�tat en m�moire de cet �l�ment
   * @type {?string}
   */
  get hiddenState() {
    return this.#data[KEY_HIDDEN_STATE];
  }

  set hiddenState(state) {
    this.setHiddenState(state);
  }

  /**
   * V�rifie si le shadow dom est activ� ou non
   *
   * @returns {boolean}
   */
  shadowEnabled() {
    return this._p_get_data('shadow') !== 'false';
  }

  /**
   * Modifie ou r�cup�re un attribut.
   *
   * Si "value" est d�finie, l'attribut sera modifi�.
   *
   * @param {!string} key Attribut � r�cup�rer ou modifier
   * @param {Object} [options={}] Param�tre destructur� pour am�liorer la lisibilit�e du code
   * @param {?value} [options.value=null] Nouvelle valeur de l'attribut
   * @returns {this | string} Cha�ne si modification, valeur si r�cup�ration
   */
  attr(key, { value = null } = {}) {
    let rtn;

    if (value !== null && value !== undefined) {
      if (value === EMPTY_STRING) this.removeAttr(key);
      else this.setAttribute(key, value);

      rtn = this;
    } else rtn = this.getAttribute(key);

    return rtn;
  }

  /**
   * Supprime un attribut
   *
   * @param {!string} key Attribut � supprimer
   * @returns {this} Cha�nage
   */
  removeAttr(key) {
    this.removeAttribute(key);
    return this;
  }

  /**
   * R�cup�re une donn�e du dataset ou d'une donn�e mise en m�moire.
   *
   * @param {!string} key Cl� de la donn�e, sans "data-"
   * @returns {*} G�n�ralement un string, mais une donn�es mise en m�moire sans toucher au DOM peut �tre de n'importe quel type.
   */
  getData(key) {
    return (
      this.dataset[key] ?? this.getAttribute(`data-${key}`) ?? this.#data[key]
    );
  }

  /**
   * Ajoute une donn�e dans le dom et/ou en m�moire.
   *
   * @param {!string} key Donn�e (sans data-) que l'on souhaite modifier
   * @param {?any} value Nouvelle valeur. Si la valeur est "null", "undefined" ou une cha�ne vide, la donn�e sera supprim�e.
   * @param {Object} [options={}]
   * @param {!boolean} [options.modifyDom=true] Si faux, la donn�e sera seulement mise en m�moire, sans changer le dom.
   * @returns {this} Cha�nage
   */
  setData(key, value, { modifyDom = true } = {}) {
    if (value === null || value === undefined || value === EMPTY_STRING)
      this.removeData();
    else if (modifyDom) this.setAttribute(`data-${key}`, value);
    else this.#data = value;

    return this;
  }

  /**
   * Change l'�tat de cet �l�ment.
   *
   * Celui-ci est visible via l'attribut 'custom-element-state'
   *
   * @param {string} state Nouvel �tat
   * @returns {this} Cha�nage
   */
  setState(state) {
    return this.attr(HTMLCustomElement.ATTRIBUTE_STATE, {
      value: state,
    }).setHiddenState(state);
  }

  /**
   * V�rifie si l'�l�ment est dans un certain �tat
   *
   * @param {string} value
   *
   * @return {boolean}
   */
  isState(value) {
    return (
      this.attr(HTMLCustomElement.ATTRIBUTE_STATE) === value ||
      this.isHiddenState(value)
    );
  }

  /**
   * Supprime l'�tat de cet �l�ment
   *
   * @returns {this} Cha�nage
   */
  removeState() {
    return this.removeHiddenState().removeAttr(
      HTMLCustomElement.ATTRIBUTE_STATE,
    );
  }

  /**
   * Change l'�tat de cet �l�ment en m�moire.
   *
   * /!\ Celui-ci NE sera PAS visible via l'attribut 'custom-element-state'
   *
   * @param {string} state
   * @returns {this} Cha�nage
   */
  setHiddenState(state) {
    this.#data[KEY_HIDDEN_STATE] = state;

    this.onstatechanged.call(state, this);

    return this;
  }

  /**
   * V�rifie si l'�l�ment est dans un certain �tat en m�moire.
   *
   * @param {string} value
   *
   * @return {boolean}
   */
  isHiddenState(state) {
    return this.#data[KEY_HIDDEN_STATE] === state;
  }

  /**
   * Supprime l'�tat de cet �l�ment en m�moire.
   *
   * /!\ Ne supprime pas l'attribut 'custom-element-state'
   *
   * @returns {this} Cha�nage
   */
  removeHiddenState() {
    this.#data[KEY_HIDDEN_STATE] = null;

    return this;
  }

  /**
   * Supprime une donn�e
   *
   * @param {!string} key Cl� (sans data-) de la donn�e � supprimer
   * @returns {this} Cha�nage
   */
  removeData(key) {
    this.#data[key] = null;
    return this.removeAttr(`data-${key}`);
  }

  /**
   * V�rifie si une donn�e existe belle et bien
   *
   * @param {string} key Cl� sans "data-"
   * @returns {boolean}
   */
  hasData(key) {
    return ![null, undefined].includes(this.getData(key));
  }

  /**
   * Ajoute une ou plusieurs classes.
   *
   * @param {...string} classes Classes � ajouter
   * @returns {this} Cha�nage
   */
  addClass(...classes) {
    this.classList.add(...this.#_formatClasses(classes));

    return this;
  }

  /**
   * Supprime une ou plusieurs classes
   *
   * @param {...string} classes
   * @returns {this} Cha�nage
   */
  removeClass(...classes) {
    this.classList.remove(...this.#_formatClasses(classes));
    return this;
  }

  /**
   * V�rifie si une classe existe
   *
   * @param {!string} prop Classe � checker
   * @returns {boolean}
   */
  hasClass(prop) {
    return this.classList.contains(prop);
  }

  /**
   * Modifie ou r�cup�re le html enfant.
   *
   * /!\ L'ancien contenu sera supprim� !
   *
   * @param {string | HTMLElement | null} [html=null] Nouveau Html ou node. Si null, r�cup�re juste le html.
   * @returns {this | string} Cha�nage ou html
   */
  html(html = null) {
    if (html) {
      if (typeof html === 'string') this.root.innerHTML = html;
      else this.html(EMPTY_STRING).root.appendChild(html);

      return this;
    } else return this.innerHTML;
  }

  /**
   * Modifie le contenu par du texte ou le r�cup�re
   *
   * @param {?string} [text=null] Nouveau texte. Si null, renvoie le texte courant.
   * @returns {this | string} Cha�nage | texte
   */
  text(text = null) {
    if (text) {
      this.root.textContent = text;
      return this;
    } else return this.textContent;
  }

  /**
   * Ajoute une ou plusieurs nodes.
   *
   * @param {...HTMLElement} nodes Nodes � ajouter
   * @returns {this} Cha�nage
   */
  appendNodes(...nodes) {
    this.root.append(...nodes);

    return this;
  }

  /**
   * Ajoute avant tout, une ou plusieurs nodes.
   *
   * @param {...HTMLElement} nodes Nodes � ajouter
   * @returns {this} Cha�nage
   */
  prependNodes(...nodes) {
    this.root.prepend(...nodes);
    return this;
  }

  disable() {
    this.setAttribute('disabled', 'disabled');
    this.setAttribute('aria-disabled', true);

    return this;
  }

  enable() {
    this.removeAttribute('disabled');
    this.removeAttribute('aria-disabled');

    return this;
  }

  /**
   * R�cup�re une donn�e et la supprime dans le dom si elle y est.
   *
   * @param {!string} data Cl� sans "data-"
   * @returns {*}
   * @protected
   */
  _p_get_data(data) {
    const attribute = `data-${data}`;
    let rtn = null;

    if (this.#data[data] !== null && this.#data[data] !== undefined)
      rtn = this.#data[data];
    else if (this.hasAttribute(attribute)) {
      this.#data[data] = this.getAttribute(attribute);
      this.removeAttribute(attribute);
      rtn = this.#data[data];
    }

    return rtn;
  }

  _p_save_data(data, value) {
    this.#data[data] = value;
    return this;
  }

  /**
   * G?n?re un id
   * @param {*} param0
   * @returns {string}
   * @protected
   */
  _p_generate_id({ namespace = 'generated' } = {}) {
    namespace ??= EMPTY_STRING;
    do {
      var id = `${namespace}-${Random.random_string(Random.range(2, 10))}`;
    } while (this.rootNode.querySelector(`#${id}`));

    return id;
  }

  /**
   * S�pare les classes avec des espaces pour �viter les erreurs ('a b' => ['a','b']).
   *
   * @param {Array<string>} classes
   * @private
   * @yield {string}
   * @generator
   */
  *#_formatClasses(classes) {
    const UNDESIRED_CHAR = ' ';
    for (let i = 0, len = classes.length, element = null; i < len; ++i) {
      element = classes[i];
      if (element.includes(UNDESIRED_CHAR)) {
        yield* element.split(UNDESIRED_CHAR);
      } else yield element;
    }
  }

  /**
   * R�cup�re un texte depuis une fonction de traduction
   *
   * @param {string} text Texte � traduire
   * @returns {string}
   */
  gettext(text) {
    return HTMLCustomElement?._p_text_callback?.(text) ?? text;
  }

  /**
   * Cr�er une node de texte. Utilise la fonction {@link gettext}.
   *
   * @param {string} text
   * @returns {Text}
   * @see {@link gettext}
   */
  createText(text) {
    return document.createTextNode(this.gettext(text));
  }

  /**
   * D�fini un callback de localization
   *
   * @param {LocalizationCallback} callback
   * @static
   */
  static SetTextCallback(callback) {
    this._p_text_callback = callback;
  }

  /**
   * D�fini un �l�ment si il n'a pas �t� d�fini.
   * @static
   * @param {string} tag Tag de l'�l�ment custom
   * @param {typeof HTMLCustomElement} constructor Element d�riv� de HTMLCustomElement
   */
  static TryDefine(tag, constructor) {
    if (!customElements.get(tag)) customElements.define(tag, constructor);
  }
}

/**
 * @callback LocalizationCallback
 * @param {string} text
 * @param {...*} args
 * @return {string}
 */

/**
 * @type {?LocalizationCallback}
 * @static
 */
HTMLCustomElement._p_text_callback = HTMLCustomElement._p_text_callback || null;

/**
 * @type {string}
 * @default 'custom-element-state'
 * @readonly
 * @static
 */
HTMLCustomElement.ATTRIBUTE_STATE = 'custom-element-state';

/**
 * @enum {string}
 * @static
 */
HTMLCustomElement.EVENTS = {
  /**
   * @type {string}
   * @default 'event:custom:loaded'
   */
  loaded: 'event:custom:loaded',
  /**
   * @type {string}
   */
  stateChanged: StateChangedEvent.TAG,
};

Object.defineProperties(HTMLCustomElement, {
  ATTRIBUTE_STATE: {
    value: HTMLCustomElement.ATTRIBUTE_STATE,
    enumerable: true,
    configurable: false,
    writable: false,
  },
  EVENTS: {
    value: Object.freeze(HTMLCustomElement.EVENTS),
    enumerable: true,
    configurable: false,
    writable: false,
  },
});
