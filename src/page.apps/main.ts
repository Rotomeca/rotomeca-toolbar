/**
 * Bandeau d'en-tête d'une application ouverte : titre du site et boutons fermer, arrêter, ouvrir, recharger.
 *
 * Chargé par la vue d'en-tête (`src/page.apps/`) placée au-dessus du site. Dépend du processus principal,
 * qui lui indique le site affiché et exécute les actions demandées.
 */
// [ds.ts] Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages
import '../scripts/ds.js';
// [dom.ts] Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire
import { requireElement } from '../scripts/dom.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList, pageEventList } from '../shared/ipc/events.js';

/** Bandeau affiché au-dessus d'un site : titre, et actions (fermer, arrêter, ouvrir dans le navigateur, recharger). */
class AppsHeader {
  /** Adresse du site affiché, `null` tant qu'aucun n'est ouvert. */
  private url: string | null = null;

  /** Branche les boutons du bandeau et suit le site affiché. */
  start(): void {
    // Met à jour l'adresse en cours si un autre site est ouvert
    window.api.on(pageEventList.frameOpen, (_, url) => {
      this.url = url;
      this.showSite(url);
    });

    this.onClick('#close', () => window.api.invoke(appEventList.closeApps));
    this.onClick('#kill', () => this.withUrl((url) => window.api.invoke(appEventList.killApp, url)));
    this.onClick('#open', () => this.withUrl((url) => window.api.invoke(appEventList.killApp, url, true)));
    this.onClick('#refresh', () => this.withUrl((url) => window.api.invoke(appEventList.refreshApp, url)));
  }

  /** Affiche le site en cours dans le bandeau. */
  private showSite(url: string | null): void {
    const title = requireElement('#title');

    try {
      title.textContent = new URL(url ?? '').hostname;
    } catch {
      // Adresse absente ou illisible : on l'affiche telle quelle
      title.textContent = url ?? '';
    }
  }

  /**
   * Relie un bouton du bandeau à une action du processus principal.
   * @param selector Sélecteur du bouton
   * @param action Action lancée au clic ; son échec est journalisé
   */
  private onClick(selector: string, action: () => Promise<unknown>): void {
    requireElement(selector).addEventListener('click', () => {
      action().catch(console.error);
    });
  }

  /**
   * Exécute une action sur le site affiché, s'il y en a un.
   * @param action Action recevant l'adresse du site
   * @returns Le résultat de l'action, ou une promesse résolue si aucun site n'est ouvert
   */
  private withUrl(action: (url: string) => Promise<unknown>): Promise<unknown> {
    return this.url === null ? Promise.resolve() : action(this.url);
  }
}

new AppsHeader().start();
