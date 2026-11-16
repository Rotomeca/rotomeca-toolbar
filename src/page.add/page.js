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

    //Demandes d'ajout venant de l'iframe de recherche (sandboxée, sans accès à l'IPC)
    window.addEventListener('message', (event) => {
      const iframe = document.querySelector('iframe');
      if (!iframe || event.source !== iframe.contentWindow) return;

      const { type, name, url } = event.data ?? {};
      if (
        ![appEventList.requestAddData, appEventList.requestAddDataEdit].includes(
          type,
        )
      )
        return;

      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol)) return;
      } catch (error) {
        return;
      }

      window.api.invoke(type, {
        name: typeof name === 'string' ? name : String(url),
        url,
        picture: null,
      });
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
