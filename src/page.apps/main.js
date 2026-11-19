import { appEventList } from '../shared/ipc/events.js';
import { pageEventList } from '../shared/ipc/events.js';
import '../scripts/ds.js';

/**
 * @class
 * @classdesc Affichage qui s'affiche au dessus d'une frame, gère l'action de la feneêtre et remplace les boutons par défaut.
 */
export class Main {
  #_url;
  constructor() {
    this.main();
  }

  /**
   * Url de la frame en cours
   * @type {?string}
   * @readonly
   */
  get url() {
    return this.#_url;
  }

  main() {
    //Met à jour l'url en cours si une autre frame est ouverte
    window.api.on(pageEventList.frameOpen, (_, url) => {
      this.#_url = url;

      // Affiche le site en cours dans le bandeau
      try {
        document.querySelector('#title').textContent = new URL(url).hostname;
      } catch {
        document.querySelector('#title').textContent = url ?? '';
      }
    });

    //Ajout des listeners pour les différentes actions
    document
      .querySelector('#close')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.closeApps);
      });

    document
      .querySelector('#kill')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.killApp, this.url);
      });

    document
      .querySelector('#open')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.killApp, this.url, true);
      });

    document
      .querySelector('#refresh')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.refreshApp, this.url);
      });
  }

  static Run() {
    return new Main();
  }
}

window.app = Main.Run();
