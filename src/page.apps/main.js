import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';
import { HTMLPrimaryButton } from '../../lib/RotomecaWebComponents/component/HTMLPrimaryButton.js';

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
    });

    //Ajout des listeners pour les différentes actions
    document
      .querySelector('rotomeca-primary-button#close')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.closeApps);
      });

    document
      .querySelector('rotomeca-primary-button#kill')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.killApp, this.url);
      });

    document
      .querySelector('rotomeca-primary-button#open')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.killApp, this.url, true);
      });

    document
      .querySelector('rotomeca-primary-button#refresh')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.refreshApp, this.url);
      });
  }

  static Run() {
    return new Main();
  }
}

window.app = Main.Run();
