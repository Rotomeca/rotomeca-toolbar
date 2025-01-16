import { HTMLCustomElement } from './HTMLCustomElement.js';

/**
 * @class
 * @classdesc Représente un élément avec des données internes
 * @extends HTMLCustomElement
 * @abstract
 */
export class HTMLCustomInternalsElement extends HTMLCustomElement {
  /**
   * Données internes
   * @private
   * @type {ElementInternals}
   */
  #_internals = null;

  /**
   * Les données internes sont initialisés ici.
   *
   * Ils pourront ensuite être utiliser via `internals`.
   *
   * Les états custom s'utilisent comme ceci en css : `:state(defined)`
   */
  constructor() {
    super();

    this.#_internals = this.attachInternals();
  }

  /**
   * Eléments internes
   * @type {ElementInternals}
   * @readonly
   */
  get internals() {
    return this.#_internals;
  }

  /**
   * Les états de l'élément
   * @type {CustomStateSet}
   * @readonly
   */
  get state() {
    return this.internals.states;
  }

  /**
   * Met un état
   * @param {string} state
   * @returns {this} Chaînage
   * @override
   */
  setState(state) {
    this.internals.states.add(state);
    return this;
  }

  /**
   * Supprimer un état
   * @param {string} state Etat à supprimer
   * @returns {this} Chaînage
   * @override
   */
  removeState(state) {
    this.internals.states.delete(state);
    return this;
  }
}
