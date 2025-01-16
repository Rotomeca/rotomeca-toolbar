import { HTMLCustomInternalsElement } from '../../abstract/HTMLCustomInternalsElement.js';
import { LIB_PREFIXES } from '../../libs/config.js';

export { HTMLMaterialIconComponent };

/**
 * @class
 * @classdesc Affiche une icône matérial symbol. /!\La font doit être chargée.
 * @extends HTMLCustomInternalsElement
 */
class HTMLMaterialIconComponent extends HTMLCustomInternalsElement {
  /**
   * L'icône doit être définie soit via `data-icon`, soit dans le texte directement.
   *
   * Le shadow-dom ne fonctionne pas pour cette classe.
   *
   * Si aria-hidden n'est pas défini, il sera automatiquement mis à `true`
   *
   * Etats :
   *
   *  - icon-%icon%, remplacer `%icon%` par l'icône.
   * @see {@link https://fonts.google.com/icons}
   */
  constructor() {
    super();
  }

  /**
   * Icône de l'élément
   * @type {string}
   */
  get icon() {
    return this.textContent || this._p_get_data('icon');
  }

  set icon(value) {
    this.#_setIcon(value);
  }

  /**
   * Est appelé quand l'élément est affiché
   * @override
   * @protected
   */
  _p_main() {
    super._p_main();

    if (!this.hasClass(HTMLMaterialIconComponent.HTML_CLASS))
      this.addClass(HTMLMaterialIconComponent.HTML_CLASS);

    if (this.icon) this.#_setIcon(this.icon);

    if (!this.hasAttribute('aria-hidden'))
      this.setAttribute('aria-hidden', true);
  }

  /**
   * Change d'icône et contrôle son fonctionnement
   * @private
   * @param {string} value Nouvelle icône
   * @returns {this} Chaînage
   */
  #_setIcon(value) {
    this.textContent = value;
    this.setState(`icon-${value}`);
    return this;
  }

  /**
   * Le shadow dom est désactivé pour cette classe
   * @returns {boolean}
   * @override
   */
  shadowEnabled() {
    return false;
  }
}

/**
 * Classe à ajouter à l'élément.
 * @type {string}
 * @static
 * @readonly
 * @default 'material-symbols-outlined'
 */
HTMLMaterialIconComponent.HTML_CLASS = 'material-symbols-outlined';
/**
 * Tag de l'élément.
 * @type {string}
 * @static
 * @readonly
 * @default `${LIB_PREFIXES.material_symbol}-icon`
 */
HTMLMaterialIconComponent.TAG = `${LIB_PREFIXES.material_symbol}-icon`;

Object.defineProperties(HTMLMaterialIconComponent, {
  HTML_CLASS: {
    value: HTMLMaterialIconComponent.HTML_CLASS,
    writable: false,
    enumerable: true,
    configurable: false,
  },
  TAG: {
    value: HTMLMaterialIconComponent.TAG,
    writable: false,
    enumerable: true,
    configurable: false,
  },
});

HTMLMaterialIconComponent.TryDefine(
  HTMLMaterialIconComponent.TAG,
  HTMLMaterialIconComponent,
);
