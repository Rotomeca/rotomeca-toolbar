
/**
 * @class 
 * @classdesc Evènement de base pour les élément HTMLCUstomElement et dérivés
 * @template T
 * @extends CustomEvent
 */
export class CustomWebComponentCustomEvent extends CustomEvent {
  /**
   * @private
   * @type {T}
   */
  #caller = null;

  /**
   * Initialise la classe
   * @param {string} type Type d'évènement 
   * @param {T} caller Element qui envoi cet évènement
   */
  constructor(type, caller) {
    super(type);

    this.#caller = caller;
  }

  /**
   * @type {T}
   * @readonly
   */
    get caller() {
      return this.#caller;
  }
}