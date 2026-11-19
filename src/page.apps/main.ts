import '../scripts/ds.js';
import { requireElement } from '../scripts/dom.js';
import { appEventList, pageEventList } from '../shared/ipc/events.js';

/** Bandeau affiché au-dessus d'un site : titre, et actions (fermer, arrêter, ouvrir dans le navigateur, recharger). */
class AppsHeader {
  /** Adresse du site affiché, `null` tant qu'aucun n'est ouvert. */
  private url: string | null = null;

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

  private onClick(selector: string, action: () => Promise<unknown>): void {
    requireElement(selector).addEventListener('click', () => {
      action().catch(console.error);
    });
  }

  private withUrl(action: (url: string) => Promise<unknown>): Promise<unknown> {
    return this.url === null ? Promise.resolve() : action(this.url);
  }
}

new AppsHeader().start();
