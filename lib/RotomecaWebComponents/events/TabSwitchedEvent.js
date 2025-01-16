import { CustomWebComponentCustomEvent } from './CustomWebComponentCustomEvent.js';

/**
 * @class
 * @classdesc
 * @extends CustomWebComponentCustomEvent<HTMLTabElement>
 */
export class TabSwitchedEvent extends CustomWebComponentCustomEvent {
  #_tabId = null;
  #_tab = null;
  constructor(tabId, tab, caller) {
    super(TabSwitchedEvent.TAG, caller);

    this.#_tabId = tabId;
    this.#_tab = tab;
  }

  /**
   * @type {HTMLTabButton}
   * @readonly
   */
  get tab() {
    return this.#_tab;
  }

  /**
   * @type {string}
   * @readonly
   */
  get id() {
    return this.#_tabId;
  }

  static get TAG() {
    return 'event:custom:tab.switched';
  }
}
