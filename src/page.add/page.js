import { HTMLToolbarButton } from '../scripts/components/HTMLToolbarButton.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';

/**
 * @class
 * @classdesc Page d'ajout d'un lien
 */
export class Page {
  constructor() {
    this.main();
  }

  async main() {
    window.electron ??= {};
    //Attendre que le dom soit charger pour lancer la frame
    window.addEventListener('DOMContentLoaded', () => {
      let iframe = document.querySelector('iframe');
      iframe.setAttribute('src', iframe.getAttribute('data-src'));
    });

    //Récupérer la config avec la liste des applications par défaut
    await fetch('../../configs/config.json')
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        window.electron.files = data;
      })
      .catch(function (err) {
        console.log('error: ' + err);
      });

    //Génération des boutons
    for (const element of window.electron.files.default_apps) {
      const node = HTMLToolbarButton.CreateNode(element.url, element.title, {
        picture: element.icon,
      });

      node.onpressed.push((caller) => {
        window.api.invoke(appEventList.requestAddData, {
          name: caller.itemData.title,
          url: caller.itemData.link,
          picture: caller.itemData.picture,
        });
      });

      document.querySelector('#predefined-apps').appendChild(node);
    }
  }

  static Run() {
    return new Page();
  }
}

Page.Run();
