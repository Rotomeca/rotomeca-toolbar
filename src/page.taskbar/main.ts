/**
 * Page de la barre : boutons des applications, séparateurs, infobulles, mode édition et rail.
 *
 * Chargée par la fenêtre principale de la barre (`src/page.taskbar/`). Dépend de `HTMLToolbarButton`,
 * de `seasonFx` et du processus principal, qui envoie les changements de la liste des applications.
 */
// [ds.ts] Charge le design system `rds-*` : enregistre tous les composants web utilisés par les pages
import '../scripts/ds.js';
// [rds.d.ts] Types des composants `rds-*` du design system utilisés par les pages
import type { RdsIconButton } from '../types/rds.js';
// [HTMLToolbarButton.ts] Composant web du bouton d'une application dans la barre : icône, non-lus, son, pochette, avancement
import { HTMLToolbarButton } from '../scripts/components/HTMLToolbarButton.js';
// [dom.ts] Accès sûr aux éléments du DOM pour les scripts de page : un élément manquant lève une erreur claire
import { requireElement } from '../scripts/dom.js';
// [seasonFx.ts] Effets de saison : calque décoratif (neige, feuilles, pétales, soleil, cadeaux) posé dans un élément
import { initSeasonFx } from '../scripts/seasonFx.js';
// [dto.ts] Données échangées entre le processus principal et les pages (applications, médias, mises à jour, écrans)
import type { ToolbarEntryDto, UpdateState } from '../shared/dto.js';
// [events.ts] Noms de tous les canaux IPC : appels des pages, envois vers les pages, canaux internes
import { appEventList, pageEventList } from '../shared/ipc/events.js';
// [updateLevel.ts] Niveau d'alerte d'une mise à jour (en attente ou prête), partagé entre le processus principal et les pages
import { updateLevelOf } from '../shared/updateLevel.js';

/** Sélecteur des séparateurs de groupe entre les applications. */
const SEPARATOR_SELECTOR = '#apps .separator';

/** Délai (ms) avant d'afficher l'infobulle au survol (le focus clavier l'affiche tout de suite). */
const TOOLTIP_DELAY_MS = 400;

/**
 * Journalise une erreur d'appel au processus principal.
 * @param error Erreur reçue
 */
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
 * @param url Adresse de l'application, d'un type non vérifié car reçue du processus principal
 * @returns Le bouton, ou `null` s'il n'existe pas ou si l'adresse n'est pas un texte
 */
function findButtonByUrl(url: unknown): Element | null {
  if (typeof url !== 'string') return null;
  return document.querySelector(`[href="${CSS.escape(url)}"]`);
}

/**
 * Calcule la position verticale où ancrer une fenêtre voisine (infobulle, lecteur).
 * @param element Élément de la barre
 * @returns Le milieu vertical d'un élément, dans la barre
 */
function centerY(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

/** Infobulle : au survol (après un court délai) et au focus clavier (immédiat). */
class TooltipTrigger {
  /** Minuterie du délai avant affichage, `null` si aucune n'est en cours. */
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Élément dont l'infobulle est affichée ou attendue. */
  private target: Element | null = null;

  /** Écoute le survol, le focus et le clic pour afficher ou cacher l'infobulle. */
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

  /**
   * Remonte jusqu'au bouton de la barre qui porte une infobulle.
   * @param target Cible de l'évènement
   * @returns Le bouton, ou `null` si la cible n'en fait pas partie
   */
  private hostOf(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('rotomeca-toolbar-button, rds-icon-button') : null;
  }

  /**
   * Demande au processus principal d'afficher l'infobulle d'un bouton.
   * @param element Bouton survolé ou focalisé
   */
  private show(element: HTMLElement): void {
    // Un bouton qui joue un morceau affiche déjà le lecteur
    if (element instanceof HTMLToolbarButton && element.hasMedia) return;

    const text = element.dataset['tooltip'] ?? element.getAttribute('label');
    if (!text) return;

    window.api
      .invoke(appEventList.tooltipShow, { text, badge: element.dataset['tooltipBadge'] || null, y: centerY(element) })
      .catch(logError);
  }

  /** Annule l'attente en cours et demande au processus principal de cacher l'infobulle. */
  private hide(): void {
    this.cancelTimer();
    this.target = null;
    window.api.invoke(appEventList.tooltipHide).catch(logError);
  }

  /** Arrête la minuterie d'affichage si elle tourne. */
  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** La barre des applications. */
class ToolbarPage {
  /** Conteneur des boutons d'applications. */
  private get root(): HTMLElement {
    return requireElement('#apps');
  }

  /** Branche tous les évènements de la page : rail, infobulles, clavier, messages du processus principal, boutons. */
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

  /**
   * Ajoute un bouton ou un séparateur en fin de liste.
   * @param data Application, ou `'separator'`
   */
  private add(data: ToolbarEntryDto): void {
    if (data === 'separator') {
      if (this.buttons().length !== 0) this.root.appendChild(createSeparator());
      return;
    }

    if (this.buttons().length === 0) this.root.appendChild(createSeparator());
    this.root.appendChild(this.createButton(data));
  }

  /**
   * Crée le bouton d'une application.
   * @param data Adresse, nom et image de l'application
   * @returns Le bouton, avec ses réactions (ouvrir/fermer, lecteur, infobulle)
   */
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

  /** @returns Tous les boutons d'applications de la barre, dans l'ordre d'affichage */
  private buttons(): HTMLToolbarButton[] {
    return [...document.querySelectorAll<HTMLToolbarButton>(HTMLToolbarButton.TAG)];
  }

  /**
   * Ouvre l'application d'un bouton enfoncé et relâche les autres (sauf en mode édition).
   * @param current Bouton qui vient d'être enfoncé
   */
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
      for (const entry of saves) {
        // Une entrée qui échoue ne doit pas empêcher d'afficher les suivantes
        try {
          this.add(entry);
        } catch (error) {
          console.error('Bouton impossible à créer', error);
        }
      }

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
