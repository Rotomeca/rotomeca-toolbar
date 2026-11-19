import '../scripts/ds.js';
import { requireElement } from '../scripts/dom.js';
import { formatTime, progressPercent } from '../scripts/mediaView.js';
import type { MediaAction, MediaPayload } from '../shared/dto.js';
import { appEventList, pageEventList } from '../shared/ipc/events.js';

/** Petit lecteur affiché au survol d'un bouton qui joue un morceau. */
class MediaPlayer {
  /** Dernier état reçu. */
  private state: MediaPayload | null = null;

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

  private hover(hovering: boolean): void {
    if (!this.state) return;
    window.api.invoke(appEventList.mediaHover, { url: this.state.url, hovering }).catch(console.error);
  }

  private onClick(id: string, callback: () => void): void {
    requireElement(`#${id}`).addEventListener('click', callback);
  }

  private control(action: MediaAction): void {
    if (this.state) window.api.invoke(appEventList.mediaControl, { url: this.state.url, action }).catch(console.error);
  }

  private render(state: MediaPayload): void {
    this.state = state;

    this.renderCover(state);
    const title = requireElement('#title');
    title.textContent = state.title;
    title.title = state.title;
    requireElement('#artist').textContent = state.artist;

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
