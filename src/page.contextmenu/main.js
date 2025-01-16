import { HTMLPrimaryButton } from '../../lib/RotomecaWebComponents/component/HTMLPrimaryButton.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';

export { Main };

/**
 * @class
 * @classdesc Action de la page du contextmenu
 */
class Main {
  constructor() {
    this.main();
  }

  async main() {
    while (!window?.electron?.menu) {
      await new Promise((ok) => {
        setTimeout(() => {
          ok();
        }, 10);
      });
    }

    //Génère les boutons
    for (const element of window?.electron?.menu ?? []) {
      const node = HTMLPrimaryButton.CreateNode({ content: element.text });
      node.setAttribute('title', element.title);
      node.addEventListener(
        'click',
        function (data, action) {
          data = JSON.parse(data);
          switch (action) {
            case basicActions.delete:
              window.api.invoke(appEventList.appDelete, data.url);
              break;

            case basicActions.edit:
              window.api.invoke(appEventList.appEdit, {
                url: data.url,
                picture: data.picture,
                title: data.title,
              });
              break;

            case basicActions.addseparator:
              window.api.invoke(appEventList.requestAddSeparator, data.url);
              break;

            case basicActions.goUp:
              window.api.invoke(appEventList.requestMovement, {
                url: data.url,
                type: 'up',
              });
              break;

            case basicActions.goDown:
              window.api.invoke(appEventList.requestMovement, {
                url: data.url,
                type: 'down',
              });
              break;

            default:
              window.api.invoke(action, data);
              break;
          }
        }.bind(this, JSON.stringify(element.data), element.action),
      );

      if (element.disabled) node.disable();

      document.querySelector('#layout').appendChild(node);
    }
  }
}

/**
 * Liste des actions par défaut du contextMenu
 * @enum {string}
 */
const basicActions = Object.freeze({
  delete: 'delete',
  edit: 'edit',
  addseparator: 'addseparator',
  goUp: 'goUp',
  goDown: 'goDown',
});

new Main();
