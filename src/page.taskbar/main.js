import '../scripts/ds.js';
import { HTMLToolbarButton } from '../scripts/components/HTMLToolbarButton.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';

/**
 * Balise du séparateur entre les applications
 * @type {string}
 */
const SEPARATOR_TAG = 'rds-divider';

/**
 * Crée un séparateur
 * @returns {HTMLElement}
 */
function createSeparator() {
  const separator = document.createElement(SEPARATOR_TAG);
  separator.setAttribute('spacing', 'none');
  return separator;
}

/**
 * Retrouve le bouton d'une application via son URL (échappée : l'URL peut
 * contenir des guillemets ou d'autres caractères spéciaux).
 * @param {string} url
 * @returns {?Element}
 */
function findButtonByUrl(url) {
  if (typeof url !== 'string') return null;
  return document.querySelector(`[href="${CSS.escape(url)}"]`);
}

/**
 * @class
 * @classdesc Gère la toolbar des applications
 */
export class Main {
  constructor() {
    this.main();
  }

  /**
   * Div qui contient les applications
   * @type {HTMLDivElement}
   * @readonly
   */
  get root() {
    return document.querySelector('#apps');
  }

  /**
   * Bouton d'ajout d'une application
   * @type {HTMLElement}
   * @readonly
   */
  get addButton() {
    return document.querySelector('#add-button');
  }

  /**
   * Ajoute un bouton ou un séparateur
   * @param {string | {url:string, name:string, picture:?string}} data Bouton à ajouter
   * @param {Object} [options={}]
   * @param {boolean} [options.request=false] Si l'on souhaite récupérer le bouton ou non
   * @returns {void | HTMLToolbarButton} Renvoi un HTMLToolbarButton si resuqest est vrai
   */
  add(_, data, { request = false } = {}) {
    if (data === 'separator') {
      if (document.querySelectorAll(HTMLToolbarButton.TAG).length !== 0)
        this.root.appendChild(createSeparator());
      return;
    }

    let button = HTMLToolbarButton.CreateNode(data.url, data.name, {
      picture: data.picture,
    });

    button.addEventListener(
      'event:custom:state.pressed',
      this.event_button_pressed.bind(this),
    );
    button.addEventListener(
      'event:custom:state.unpressed',
      this.event_button_unpressed.bind(this),
    );

    button.addEventListener('mouseenter', () => {
      if (!button.hasMedia) return;

      const rect = button.getBoundingClientRect();
      window.api.invoke(appEventList.mediaHover, {
        url: data.url,
        hovering: true,
        y: rect.top + rect.height / 2,
      });
    });
    button.addEventListener('mouseleave', () => {
      window.api.invoke(appEventList.mediaHover, {
        url: data.url,
        hovering: false,
      });
    });

    if (request === true) return button;

    if (document.querySelectorAll(HTMLToolbarButton.TAG).length === 0)
      this.root.appendChild(createSeparator());

    this.root.appendChild(button);
  }

  main() {
    window.api.on(pageEventList.toolbarAppSeparatorDelete, (_, url) => {
      let element =
        url === 0
          ? document.querySelector(SEPARATOR_TAG)
          : findButtonByUrl(url)?.nextElementSibling;

      if (element?.nodeName === SEPARATOR_TAG.toUpperCase())
        element.remove();
    });

    window.api.on(pageEventList.toolbarAppDeleted, (_, url) => {
      findButtonByUrl(url)?.remove?.();
    });

    window.api.on(pageEventList.windowAppMovement, (_, args) => {
      const { url, type, modifier } = args;

      let appMoved = findButtonByUrl(url);
      let element = appMoved;

      for (let index = 0; element && index <= modifier; ++index) {
        element =
          type === 'up'
            ? element.previousElementSibling
            : element.nextElementSibling;
      }

      if (!appMoved || !element) return;

      switch (type) {
        case 'up':
          element.before(appMoved);
          break;

        case 'down':
          element.after(appMoved);
          break;

        default:
          break;
      }

      element = null;
      appMoved = null;
    });

    window.api.on(pageEventList.appEdited, (_, state) => {
      if (state) {
        document
          .querySelectorAll('#apps rotomeca-toolbar-button')
          .forEach((element) => {
            element.disable();
          });
        document.querySelector('#add-button').disabled = true;
        document.querySelector('#edit-button').disabled = true;
      } else {
        document
          .querySelectorAll('#apps rotomeca-toolbar-button')
          .forEach((element) => {
            element.enable();
          });
        document.querySelector('#add-button').disabled = false;
        document.querySelector('#edit-button').disabled = false;
      }
    });

    window.api.on(pageEventList.appAdded, (ev, data) => {
      this.add(ev, data);
    });

    window.api.on(pageEventList.appUpdated, (_, data) => {
      /**
       * @type {HTMLToolbarButton}
       */
      for (const element of document.querySelectorAll(HTMLToolbarButton.TAG)) {
        if (element.itemData.link === data.oldLink) {
          let tmp = this.add(_, data, { request: true });
          element.replaceWith(tmp);
          tmp = null;
          break;
        }
      }
    });

    window.api.on(pageEventList.init, (ev, args) => {
      const { saves: arr, settings } = args;
      for (const element of arr) {
        this.add(ev, element);
      }

      if (!settings?.isButton) {
        let node = document.createElement('rds-icon-button');
        node.setAttribute('icon', 'chevron-left');
        node.setAttribute('variant', 'primary');
        node.setAttribute('square', '');
        node.setAttribute('label', 'Cacher la barre');
        node.setAttribute('title', 'Cacher la barre');
        node.id = 'hide-button';

        node.onclick = () => {
          window.api.invoke(appEventList.toggleToolbar);
        };

        document.querySelector('#main').prepend(node);
        node = null;
      }
    });

    window.api.on(pageEventList.appInserted, (_, args) => {
      const { url, data } = args;

      let button = HTMLToolbarButton.Select(url);

      if (button) {
        if (data === 'separator')
          button.after(createSeparator());
        else button.after(this.add(null, data, { request: true }));
      }
    });

    window.api.on(pageEventList.appIndicators, (_, { url, ...indicators }) => {
      HTMLToolbarButton.Select(url)?.setIndicators(indicators);
    });

    window.api.on(pageEventList.windowAppsClosed, () => {
      document.querySelector('[aria-pressed="true"]')?.unpress?.();
    });

    this.addButton.addEventListener('click', () => {
      window.api.invoke(appEventList.requestAdd);
    });

    document
      .querySelector('#edit-button')
      .addEventListener('rds-icon-button:toggle', (event) => {
        const editing = event.detail.selected;

        document
          .querySelectorAll('#apps rotomeca-toolbar-button')
          .forEach((element) => {
            element.classList.toggle('edit', editing);
          });
        document.querySelector('#add-button').disabled = editing;
      });
  }

  event_button_pressed(e) {
    if (e.caller.isOnEditMode) return;

    if (!e.caller.not) {
      const current = e.caller;
      window.api.invoke(appEventList.openFrame, current.itemData.link);
      document.querySelectorAll(HTMLToolbarButton.TAG).forEach((element) => {
        if (element.id !== current.id && element.isPressed)
          element.toggleState();
      });
    } else {
      e.caller.unpress({ enableEvent: false });

      e.caller.not = null;
    }
  }

  event_button_unpressed(event) {
    const current = event.caller;
    window.api.invoke(appEventList.closeFrame, current.itemData.link);
  }

  static Run() {
    return new Main();
  }
}

Main.Run();
