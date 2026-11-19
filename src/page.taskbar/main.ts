import '../scripts/ds.js';
import type { RdsIconButton } from '../types/rds.js';
import { HTMLToolbarButton } from '../scripts/components/HTMLToolbarButton.js';
import { requireElement } from '../scripts/dom.js';
import { initSeasonFx } from '../scripts/seasonFx.js';
import type { ToolbarEntryDto, UpdateState } from '../shared/dto.js';
import { appEventList, pageEventList } from '../shared/ipc/events.js';
import { updateLevelOf } from '../shared/updateLevel.js';

/** Sélecteur des séparateurs de groupe entre les applications. */
const SEPARATOR_SELECTOR = '#apps .separator';

/** Délai (ms) avant d'afficher l'infobulle au survol (le focus clavier l'affiche tout de suite). */
const TOOLTIP_DELAY_MS = 400;

const logError = (error: unknown): void => console.error(error);

/** Crée un séparateur de groupe (trait court, couleur d'accent). */
function createSeparator(): HTMLElement {
  const separator = document.createElement('div');
  separator.classList.add('separator', 'group');
  separator.setAttribute('aria-hidden', 'true');
  return separator;
}

/**
 * Retrouve le bouton d'une application via son adresse (échappée : l'adresse peut contenir des
 * guillemets ou d'autres caractères spéciaux).
 */
function findButtonByUrl(url: unknown): Element | null {
  if (typeof url !== 'string') return null;
  return document.querySelector(`[href="${CSS.escape(url)}"]`);
}

/** @returns Le milieu vertical d'un élément, dans la barre */
function centerY(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

/** Infobulle : au survol (après un court délai) et au focus clavier (immédiat). */
class TooltipTrigger {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private target: Element | null = null;

  start(): void {
    document.addEventListener('mouseover', (event) => {
      const element = this.hostOf(event.target);
      if (element === this.target) return;

      this.hide();
      if (!element) return;
      this.target = element;
      this.timer = setTimeout(() => this.show(element), TOOLTIP_DELAY_MS);
    });
    document.addEventListener('mouseleave', () => this.hide());
    document.addEventListener('focusin', (event) => {
      const element = this.hostOf(event.target);
      if (!element) return;

      this.cancelTimer();
      this.target = element;
      this.show(element);
    });
    document.addEventListener('focusout', () => this.hide());
    document.addEventListener('click', () => this.hide());
  }

  private hostOf(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('rotomeca-toolbar-button, rds-icon-button') : null;
  }

  private show(element: HTMLElement): void {
    // Un bouton qui joue un morceau affiche déjà le lecteur
    if (element instanceof HTMLToolbarButton && element.hasMedia) return;

    const text = element.dataset['tooltip'] ?? element.getAttribute('label');
    if (!text) return;

    window.api
      .invoke(appEventList.tooltipShow, { text, badge: element.dataset['tooltipBadge'] || null, y: centerY(element) })
      .catch(logError);
  }

  private hide(): void {
    this.cancelTimer();
    this.target = null;
    window.api.invoke(appEventList.tooltipHide).catch(logError);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** La barre des applications. */
class ToolbarPage {
  private get root(): HTMLElement {
    return requireElement('#apps');
  }

  start(): void {
    // Effets de saison sur la barre (calque décoratif, ne capte aucun clic)
    initSeasonFx(requireElement('#main'), { narrow: true });

    this.bindRail();
    new TooltipTrigger().start();

    // Échap cache la barre (ouverte au clavier ou à la souris)
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') window.api.invoke(appEventList.requestToggle).catch(logError);
    });

    this.bindMainMessages();
    this.bindUpdateIndicator();

    requireElement('#settings-button').addEventListener('click', () => {
      window.api.invoke(appEventList.openSettings).catch(logError);
    });
    requireElement('#add-button').addEventListener('click', () => {
      window.api.invoke(appEventList.requestAdd).catch(logError);
    });
    requireElement('#edit-button').addEventListener('rds-icon-button:toggle', (event) => {
      const editing = event.detail.selected;

      this.buttons().forEach((element) => element.classList.toggle('edit', editing));
      requireElement<RdsIconButton>('#add-button').disabled = editing;
    });
  }

  /** Ajoute un bouton ou un séparateur. */
  private add(data: ToolbarEntryDto): void {
    if (data === 'separator') {
      if (this.buttons().length !== 0) this.root.appendChild(createSeparator());
      return;
    }

    if (this.buttons().length === 0) this.root.appendChild(createSeparator());
    this.root.appendChild(this.createButton(data));
  }

  /** @returns Le bouton d'une application, avec ses réactions (ouvrir/fermer, lecteur, infobulle) */
  private createButton(data: { url: string; name: string; picture: string | null }): HTMLToolbarButton {
    const button = HTMLToolbarButton.CreateNode(data.url, data.name, { picture: data.picture });

    button.addEventListener('event:custom:state.pressed', (event) => this.onPressed(event.caller));
    button.addEventListener('event:custom:state.unpressed', (event) => {
      window.api.invoke(appEventList.closeFrame, event.caller.itemData.link).catch(logError);
    });

    const showPlayer = (): void => {
      if (!button.hasMedia) return;
      window.api.invoke(appEventList.mediaHover, { url: data.url, hovering: true, y: centerY(button) }).catch(logError);
    };
    button.addEventListener('mouseenter', showPlayer);
    // Un clic sur la tuile ouvre aussi le lecteur (utile s'il vient de se fermer)
    button.addEventListener('click', showPlayer);
    button.addEventListener('mouseleave', () => {
      window.api.invoke(appEventList.mediaHover, { url: data.url, hovering: false }).catch(logError);
    });

    return button;
  }

  private buttons(): HTMLToolbarButton[] {
    return [...document.querySelectorAll<HTMLToolbarButton>(HTMLToolbarButton.TAG)];
  }

  private onPressed(current: HTMLToolbarButton): void {
    if (current.isOnEditMode) return;

    window.api.invoke(appEventList.openFrame, current.itemData.link).catch(logError);
    for (const element of this.buttons()) {
      if (element.id !== current.id && element.isPressed) element.toggleState();
    }
  }

  /** Réduite au rail, la barre se déplie au survol (masquage automatique, filtré côté principal) ou au clic. */
  private bindRail(): void {
    document.documentElement.addEventListener('mouseenter', () => {
      if (document.documentElement.classList.contains('rail')) window.api.invoke(appEventList.edgeEnter).catch(logError);
    });
    requireElement('#rail-button').addEventListener('click', () => {
      window.api.invoke(appEventList.toggleToolbar).catch(logError);
    });
  }

  /** Les messages du processus principal qui modifient la barre. */
  private bindMainMessages(): void {
    window.api.on(pageEventList.toolbarAppSeparatorDelete, (_, reference) => {
      const element = reference === 0 ? document.querySelector(SEPARATOR_SELECTOR) : findButtonByUrl(reference)?.nextElementSibling;

      if (element?.classList.contains('separator')) element.remove();
    });

    window.api.on(pageEventList.toolbarAppDeleted, (_, url) => findButtonByUrl(url)?.remove());

    window.api.on(pageEventList.windowAppMovement, (_, { url, type, modifier }) => {
      const moved = findButtonByUrl(url);
      let target = moved;

      for (let index = 0; target && index <= modifier; ++index) {
        target = type === 'up' ? target.previousElementSibling : target.nextElementSibling;
      }

      if (!moved || !target) return;

      if (type === 'up') target.before(moved);
      else target.after(moved);
    });

    window.api.on(pageEventList.appEdited, (_, editing) => {
      this.buttons().forEach((element) => (editing ? element.disable() : element.enable()));
      requireElement<RdsIconButton>('#add-button').disabled = editing;
      requireElement<RdsIconButton>('#edit-button').disabled = editing;
    });

    window.api.on(pageEventList.appAdded, (_, data) => this.add(data));

    window.api.on(pageEventList.appUpdated, (_, data) => {
      const element = this.buttons().find((button) => button.itemData.link === data.oldLink);
      element?.replaceWith(this.createButton(data));
    });

    window.api.on(pageEventList.init, (_, { saves, settings }) => {
      for (const entry of saves) this.add(entry);

      if (!settings.isButton) this.addHideButton();
    });

    window.api.on(pageEventList.appInserted, (_, { url, data }) => {
      const button = HTMLToolbarButton.Select(url);
      if (button) button.after(data === 'separator' ? createSeparator() : this.createButton(data));
    });

    window.api.on(pageEventList.appIndicators, (_, { url, ...indicators }) => {
      HTMLToolbarButton.Select(url)?.setIndicators(indicators);
    });

    window.api.on(pageEventList.windowAppsClosed, () => {
      document.querySelector<HTMLToolbarButton>('[aria-pressed="true"]')?.unpress();
    });
  }

  /** Bouton réduire en tête de barre, suivi d'un séparateur simple. */
  private addHideButton(): void {
    const button = document.createElement('rds-icon-button');
    button.setAttribute('icon', 'chevron-left');
    button.setAttribute('square', '');
    button.setAttribute('size', 'sm');
    button.setAttribute('label', window.api.t('toolbar.hide'));
    button.id = 'hide-button';
    button.addEventListener('click', () => {
      window.api.invoke(appEventList.toggleToolbar).catch(logError);
    });

    const separator = document.createElement('div');
    separator.classList.add('separator');
    separator.setAttribute('aria-hidden', 'true');
    requireElement('#head').append(button, separator);
  }

  /** Point sur le bouton Paramètres : orange (version disponible), vert (prête). */
  private bindUpdateIndicator(): void {
    const settingsButton = requireElement('#settings-button');
    const defaultLabel = settingsButton.getAttribute('label') ?? '';

    const show = ({ etat }: Pick<UpdateState, 'etat'>): void => {
      const level = updateLevelOf(etat);

      if (level) settingsButton.dataset['maj'] = level;
      else delete settingsButton.dataset['maj'];

      const labelKey = level === 'ready' ? 'toolbar.settingsUpdateReady' : 'toolbar.settingsUpdateAvailable';
      settingsButton.setAttribute('label', level ? window.api.t(labelKey) : defaultLabel);
    };

    window.api.on(pageEventList.updateState, (_, state) => show(state));
    window.api.invoke(appEventList.updateGetState).then(show).catch(logError);
  }
}

new ToolbarPage().start();
