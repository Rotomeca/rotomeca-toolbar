const {
  JsEvent,
} = require('../../lib/RotomecaWebComponents/libs/events_electron.js');
const { BaseAppObject } = require('./BaseAppObject');

/**
 * @callback OnShowCallback
 * @param {import('./RotomecaElectronContextMenu.js').ContextMenuEvent} event
 * @param {RotomecaElectronContextMenu} caller
 * @returns {boolean}
 */

/**
 * @class
 * @classdesc Initialise et gère le contextmenu de l'application
 * @extends BaseAppObject
 */
class ContextMenu extends BaseAppObject {
  /**
   * Boutons de l'application
   * @private
   * @type {?Array<string | Object<string, any>>}
   */
  #_saves = null;
  constructor() {
    super();
  }

  /**
   * @type {Readonly<Array<string | Object<string, any>>>}
   * @readonly
   */
  get saves() {
    return this.#_saves !== null
      ? Object.freeze(JSON.parse(JSON.stringify(this.#_saves)))
      : [];
  }

  /**
   * Initialise la classe
   * @override
   */
  init() {
    /**
     * Est appelé lorsque le contextmenu doit vérifier si il doit s'afficher ou non.
     * @type {JsEvent<OnShowCallback>}
     * @event
     */
    this.onShowCondition = new JsEvent();
  }

  /**
   * Action principales, initialise le contextmenu
   * @override
   */
  main() {
    super.main();

    //Récupère le contextmenu
    const {
      RotomecaElectronContextMenu,
    } = require('./RotomecaElectronContextMenu.js');
    const contextMenu = RotomecaElectronContextMenu;

    //Démarre le contextmenu
    contextMenu.Start({
      menu: this._menuCallback.bind(this),
      showCondition: (event, caller) => {
        return this.onShowCondition.call(event, caller);
      },
    });
  }

  /**
   * Récupère le callback qui récupère les données de la toolbar après la sauvegarde
   * @returns {import('../../main.js').SavesUpdatedCallback}
   */
  getOnSaveCallback() {
    return function onSave(saves) {
      this.#_onSave(saves);
    }.bind(this);
  }

  /**
   * Récupère le callback qui récupère les données de la toolbar après le chargement des données
   * @returns {import('../../main.js').SavesUpdatedCallback}
   */
  getOnLoadCallback() {
    return function onLoad(saves) {
      this.#_onLoad(saves);
    }.bind(this);
  }

  /**
   * Récupère les boutons lorsque l'on doit afficher le menu
   * @param {import('./RotomecaElectronContextMenu.js').ContextMenuEvent} event Evènement reçu
   * @returns {Array<Object<string, string | Object<string, any>>} Boutons à afficher et leurs actions
   * @package
   */
  _menuCallback(event) {
    if (event.target.classes && event.target.classes.includes('edit')) {
      const index = this.saves
        .map((value, itemIndex) => {
          return { value, itemIndex };
        })
        .filter((x) => x.value.url === event.target.attribs.href)[0].itemIndex;

      return [
        {
          text: 'Supprimer',
          title: `Supprimer l'application "${event.target.attribs.title}"`,
          action: 'delete',
          data: {
            url: event.target.attribs.href,
          },
        },
        {
          text: 'Ajouter un séparateur en bas',
          title: 'Ajoute un séparateur en bas',
          action: 'addseparator',
          data: {
            url: event.target.attribs.href,
          },
          disabled:
            index + 1 < this.saves.length &&
            this.saves[index + 1] === 'separator',
        },
        {
          text: 'Déplacer en haut',
          title: "Déplace l'application vers le haut",
          action: 'goUp',
          data: {
            url: event.target.attribs.href,
          },
          disabled:
            this.saves.filter((x) => x !== 'separator').length === 1 ||
            index - 1 < 0,
        },
        {
          text: 'Déplacer en bas',
          title: "Déplace l'application vers le bas",
          action: 'goDown',
          data: {
            url: event.target.attribs.href,
          },
          disabled:
            index + 1 >= this.saves.length ||
            (index + 1 === this.saves.length - 1 &&
              this.saves[this.saves.length - 1] === 'separator'),
        },
      ];
    } else {
      return [
        {
          text: 'Supprimer',
          title: `Supprimer l'application "${event.target.attribs.title}"`,
          action: 'delete',
          data: {
            url: event.target.attribs.href,
          },
        },
        {
          text: 'Modifier',
          title: `Modifier l'application "${event.target.attribs.title}"`,
          action: 'edit',
          data: {
            url: event.target.attribs.href,
            title: event.target.attribs.title,
            picture: this.saves.filter(
              (x) => x.url === event.target.attribs.href,
            )?.[0]?.picture,
          },
        },
      ];
    }
  }

  #_onSave(saves) {
    this.#_saves = saves;
  }

  #_onLoad(saves) {
    this.#_saves = saves;
  }
}

module.exports = { ContextMenu };
