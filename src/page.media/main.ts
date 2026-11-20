/**
 * Lecteur multimédia affiché au survol d'un bouton qui joue un morceau : titre, pochette, commandes.
 *
 * Chargé par la fenêtre du lecteur (`src/page.media/`). Dépend de `mediaView` pour le formatage
 * et du processus principal, qui envoie l'état du média et exécute les commandes.
 */
// [ds.ts] Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages
import '../scripts/ds.js';
// [dom.ts] Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire
import { requireElement } from '../scripts/dom.js';
// [mediaView.ts] Fonctions pures d'affichage du lecteur multimédia : durée et avancement
import { formatTime, progressPercent } from '../scripts/mediaView.js';
// [marquee.ts] Défilement d'un texte trop long pour sa place (titre et artiste du lecteur)
import { applyMarquee } from './marquee.js';
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { MediaAction, MediaPayload } from '../shared/dto.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList, pageEventList } from '../shared/ipc/events.js';

/** Petit lecteur affiché au survol d'un bouton qui joue un morceau. */
class MediaPlayer {
  /** Dernier état reçu. */
  private state: MediaPayload | null = null;

  /** Branche les commandes du lecteur et affiche chaque état reçu du processus principal. */
  start(): void {
    window.api.on(pageEventList.mediaState, (_, state) => this.render(state));

    // Garde la fenêtre ouverte tant que la souris est dessus
    document.addEventListener('mouseenter', () => this.hover(true));
    document.addEventListener('mouseleave', () => this.hover(false));

    this.onClick('prev', () => this.control('previoustrack'));
    this.onClick('next', () => this.control('nexttrack'));
    this.onClick('toggle', () => this.control(this.state?.playing ? 'pause' : 'play'));
    this.onClick('mute', () => {
      if (this.state) window.api.invoke(appEventList.toggleMute, { url: this.state.url }).catch(console.error);
    });
  }

  /**
   * Signale au processus principal que la souris entre ou sort, pour garder la fenêtre ouverte.
   * @param hovering `true` quand la souris est sur le lecteur
   */
  private hover(hovering: boolean): void {
    if (!this.state) return;
    window.api.invoke(appEventList.mediaHover, { url: this.state.url, hovering }).catch(console.error);
  }

  /**
   * Relie un bouton du lecteur à une action.
   * @param id Identifiant du bouton, sans `#`
   * @param callback Action lancée au clic
   */
  private onClick(id: string, callback: () => void): void {
    requireElement(`#${id}`).addEventListener('click', callback);
  }

  /**
   * Envoie une commande de lecture au site qui joue le média.
   * @param action Commande (lecture, pause, piste précédente ou suivante)
   */
  private control(action: MediaAction): void {
    if (this.state) window.api.invoke(appEventList.mediaControl, { url: this.state.url, action }).catch(console.error);
  }

  /**
   * Affiche un nouvel état : titre, artiste, pochette, avancement et état des boutons.
   * @param state État du média reçu du processus principal
   */
  private render(state: MediaPayload): void {
    this.state = state;

    this.renderCover(state);
    const title = requireElement('#title');
    applyMarquee(title, state.title);
    title.title = state.title;
    const artist = requireElement('#artist');
    applyMarquee(artist, state.artist);
    artist.title = state.artist;

    this.renderProgress(state);

    const has = (action: MediaAction): boolean => state.actions.includes(action);
    requireElement<HTMLButtonElement>('#prev').disabled = !has('previoustrack');
    requireElement<HTMLButtonElement>('#next').disabled = !has('nexttrack');
    // Sans handler, le script injecté pilote directement les lecteurs audio/vidéo
    requireElement('#toggle').setAttribute('icon', state.playing ? 'pause' : 'play');

    const mute = requireElement('#mute');
    const muteLabel = window.api.t(state.muted ? 'media.unmute' : 'media.mute');
    mute.setAttribute('icon', state.muted ? 'volume-x' : 'volume-2');
    mute.setAttribute('label', muteLabel);
    mute.title = muteLabel;
  }

  /**
   * Affiche la pochette, ou l'image de remplacement quand le média n'en fournit pas.
   * @param state État du média
   */
  private renderCover(state: MediaPayload): void {
    const cover = requireElement<HTMLImageElement>('#cover');
    cover.hidden = !state.artwork;
    if (state.artwork) cover.src = state.artwork;
    else cover.removeAttribute('src');
    requireElement('#cover-fallback').hidden = !!state.artwork;
  }

  /** Avancement : la barre et les temps lisent la même valeur. */
  private renderProgress(state: MediaPayload): void {
    const progress = requireElement('#progress');
    progress.hidden = !state.duration;
    if (!state.duration) return;

    const percent = progressPercent(state.position, state.duration);
    requireElement('#fill').style.width = `${percent}%`;
    requireElement('#track').setAttribute('aria-valuenow', String(percent));
    requireElement('#elapsed').textContent = formatTime(state.position ?? 0);
    requireElement('#total').textContent = formatTime(state.duration);
  }
}

new MediaPlayer().start();
