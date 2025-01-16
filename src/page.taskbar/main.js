import { HTMLPrimaryButton } from '../../lib/RotomecaWebComponents/component/HTMLPrimaryButton.js';
import { HTMLSeparator } from '../scripts/components/HTMLSeparator.js';
import { HTMLToolbarButton } from '../scripts/components/HTMLToolbarButton.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';

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
   * @type {HTMLPrimaryButton}
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
        this.root.appendChild(HTMLSeparator.CreateNode());
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

    if (request === true) return button;

    if (document.querySelectorAll(HTMLToolbarButton.TAG).length === 0)
      this.root.appendChild(HTMLSeparator.CreateNode());

    this.root.appendChild(button);
  }

  main() {
    window.api.on(pageEventList.toolbarAppSeparatorDelete, (_, url) => {
      let element =
        url === 0
          ? document.querySelector(HTMLSeparator.TAG)
          : document.querySelector(`[href="${url}"]`).nextElementSibling;

      if (element.nodeName === HTMLSeparator.TAG.toUpperCase())
        element.remove();
    });

    window.api.on(pageEventList.toolbarAppDeleted, (_, url) => {
      document.querySelector(`[href="${url}"]`)?.remove?.();
    });

    window.api.on(pageEventList.windowAppMovement, (_, args) => {
      const { url, type, modifier } = args;

      let appMoved = document.querySelector(`[href="${url}"]`);
      let element = appMoved;

      for (let index = 0; index <= modifier; ++index) {
        element =
          type === 'up'
            ? element.previousElementSibling
            : element.nextElementSibling;
      }

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
        document.querySelector('#add-button').disable();
        document
          .querySelector('#edit rotomeca-primary-pressed-button')
          .disable();
      } else {
        document
          .querySelectorAll('#apps rotomeca-toolbar-button')
          .forEach((element) => {
            element.enable();
          });
        document.querySelector('#add-button').enable();
        document
          .querySelector('#edit rotomeca-primary-pressed-button')
          .enable();
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
        let node = HTMLPrimaryButton.CreateNode({
          form: 'secondary',
          content: '<',
        });

        node.onclick = () => {
          window.api.invoke(appEventList.toggleToolbar);
        };
        node.style.textAlign = 'center';
        node.style.borderBottomLeftRadius = 0;
        node.style.borderBottomRightRadius = 0;

        node.setAttribute('title', 'Cacher la barre');

        document.querySelector('#main').prepend(node);
        node = null;
      }
    });

    window.api.on(pageEventList.appInserted, (_, args) => {
      const { url, data } = args;

      let button = HTMLToolbarButton.Select(url);

      if (button) {
        if (data === 'separator')
          button.after(document.createElement(HTMLSeparator.TAG));
        else button.after(this.add(null, data, { request: true }));
      }
    });

    window.api.on(pageEventList.windowAppsClosed, () => {
      document.querySelector('[aria-pressed="true"]')?.unpress?.();
    });

    this.addButton.addEventListener('click', () => {
      window.api.invoke(appEventList.requestAdd);
    });

    let editButton = document.querySelector(
      '#edit rotomeca-primary-pressed-button',
    );
    editButton.addEventListener('event:custom:state.pressed', () => {
      document
        .querySelectorAll('#apps rotomeca-toolbar-button')
        .forEach((element) => {
          element.classList.add('edit');
        });
      document.querySelector('#add-button').disable();
    });

    editButton.addEventListener('event:custom:state.unpressed', () => {
      document
        .querySelectorAll('#apps rotomeca-toolbar-button')
        .forEach((element) => {
          element.classList.remove('edit');
        });

      document.querySelector('#add-button').enable();
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
