import { HTMLPrimaryButton } from '../../lib/RotomecaWebComponents/component/HTMLPrimaryButton.js';
import { EMPTY_STRING } from '../../lib/RotomecaWebComponents/libs/constants.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';

const SELECTOR_INPUT_URL = '#urlbox';
const SELECTOR_INPUT_NAME = '#namebox';
const SELECTOR_INPUT_PICTURE = '#picturebox';
const SELECTOR_BUTTON_SAVE = '#save';
const SELECTOR_BUTTON_CLEAR_PICTURE = '#clear';

/**
 * @class
 * @classdesc Classe qui gère le fonctionnement de la page d'édition d'une application de la toolbar
 */
export class Main {
  #_picture = null;
  constructor() {
    this.main();
  }

  /**
   * Root pour retrouver les éléments
   * @type {Document}
   * @readonly
   * @private
   */
  get #_root() {
    return document;
  }

  /**
   * Input de l'url
   * @type {HTMLInputElement}
   * @readonly
   */
  get urlInput() {
    return this.#_root.querySelector(SELECTOR_INPUT_URL);
  }

  /**
   * Input du nom de l'application
   * @type {HTMLInputElement}
   * @readonly
   */
  get nameInput() {
    return this.#_root.querySelector(SELECTOR_INPUT_NAME);
  }

  /**
   * Input de l'image
   * @type {HTMLInputElement}
   * @readonly
   */
  get pictureInput() {
    return this.#_root.querySelector(SELECTOR_INPUT_PICTURE);
  }

  /**
   * Bouton qui de sauvegarde
   * @type {HTMLPrimaryButton}
   * @readonly
   */
  get saveButton() {
    return this.#_root.querySelector(SELECTOR_BUTTON_SAVE);
  }

  /**
   * Séparateur
   * @type {HTMLElement}
   * @readonly
   * @deprecated L'élément n'existe plus
   */
  get separatorSaveButton() {
    return this.#_root.querySelector('#save-separator');
  }

  /**
   * Button qui permet de vider l'image
   * @type {HTMLPrimaryButton}
   * @readonly
   */
  get clearButton() {
    return this.#_root.querySelector(SELECTOR_BUTTON_CLEAR_PICTURE);
  }

  /**
   * Url de l'application
   * @type {string}
   * @readonly
   */
  get url() {
    let url = this.urlInput.value ?? EMPTY_STRING;

    if (!url.includes('://') && url !== EMPTY_STRING) url = `http://${url}`;

    return url;
  }

  /**
   * Nom par défaut de l'application
   * @type {string}
   * @readonly
   */
  get name() {
    try {
      return (
        this.nameInput.value ||
        capitalizeFirstLetter(
          this.url
            .replaceAll('www.', EMPTY_STRING)
            .split('://')[1]
            .split('.')[0],
        )
      );
    } catch (error) {
      return this.url;
    }
  }

  /**
   * Image de l'application
   * @type {?string}
   * @readonly
   */
  get picture() {
    return this.#_picture;
  }

  /**
   * Core du module
   */
  main() {
    this.urlInput.addEventListener('change', this._on_url_change.bind(this));

    this.pictureInput.addEventListener(
      'change',
      this._on_picture_change.bind(this),
    );

    this.saveButton.onclick = this._on_save_click.bind(this);

    this.clearButton.addEventListener(
      'click',
      this._on_clear_picture_click.bind(this),
    );

    if (!(this.urlInput.value || false)) this.saveButton.disable();

    if (this.#_picture) this.clearButton.enable();
    else this.clearButton.disable();

    window.api.on(pageEventList.modeEdit, (_, data) => {
      document.querySelector('title').textContent = 'Modifier une application';

      this.saveButton.enable();
      this.urlInput.value = data.url;
      this.nameInput.value = data.title || data.name;
      this.nameInput.setAttribute('placeholder', this.name);

      try {
        this.pictureInput.value = data.picture;
      } catch (error) {}

      this.#_picture = data.picture || null;

      this.saveButton.replaceWith(
        HTMLPrimaryButton.CreateNode({
          form: 'secondary',
          content: 'Modifier',
        }).attr('id', {
          value: 'save',
        }),
      );

      this.saveButton.onclick = () => {
        window.api.invoke(appEventList.requestUpdatedData, {
          name: this.name,
          url: this.url,
          picture: this.picture,
          id: data.index,
        });
      };

      this.enableOrDisablePicture();
    });
  }

  /**
   * Active ou désactive le bouton de vidage de l'image si une image a été mise ou non
   * @returns {Main} Chaînage
   */
  enableOrDisablePicture() {
    if (this.#_picture) this.clearButton.enable();
    else this.clearButton.disable();

    return this;
  }

  /**
   * Lorsque l'url change, on change le placeholder de l'input qui gère le nom. Ensuite, si il est vide, on ajoute un nom par défaut.
   *
   * Si l'url est vide, le bouton de sauvegarde est désactivé.
   * @package
   */
  _on_url_change() {
    this.nameInput.setAttribute(
      'placeholder',
      capitalizeFirstLetter(
        this.url
          .replaceAll('www.', EMPTY_STRING)
          ?.split('://')?.[1]
          ?.split('.')?.[0] ?? EMPTY_STRING,
      ),
    );

    if (!(this.nameInput.value || false)) {
      this.nameInput.value = this.name;
    }

    if (this.url !== EMPTY_STRING) this.saveButton.enable();
    else this.saveButton.disable();
  }

  /**
   * Lorsqu'une image est mise, les données de l'image sont récupérées et sauvegardées en mémoire.
   * @package
   */
  _on_picture_change() {
    let reader = new FileReader();
    reader.onload = (p) => {
      this.#_picture = p.target.result;

      this.enableOrDisablePicture();
    };
    reader.readAsDataURL(this.pictureInput.files[0]);
  }

  /**
   * On ajoute les donnée à la toolbar
   * @deprecated Seul le mode edit existe
   */
  _on_save_click() {
    window.api.invoke(appEventList.requestAddData, {
      name: this.name,
      url: this.url,
      picture: this.picture,
    });
  }

  /**
   * Lorsque le bouton pour vider l'image est activé, on vide l'input de l'image et on vide les données en mémoire.
   * @package
   */
  _on_clear_picture_click() {
    this.clearButton.disable();
    this.pictureInput.value = EMPTY_STRING;
    this.#_picture = null;
  }

  /**
   * Démarre le module
   * @returns {Main}
   */
  static Run() {
    return new Main();
  }
}

Main.Run();

/**
 * Met en majuscule la première lettre d'un texte
 * @param {string} val Texte
 * @returns {string} Texte avec une majuscule au début
 * @package
 */
function capitalizeFirstLetter(val) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}
