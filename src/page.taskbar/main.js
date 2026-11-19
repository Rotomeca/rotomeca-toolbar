import '../scripts/ds.js';
import { HTMLToolbarButton } from '../scripts/components/HTMLToolbarButton.js';
import { appEventList } from '../shared/ipc/events.js';
import { pageEventList } from '../shared/ipc/events.js';
import { initSeasonFx } from '../scripts/seasonFx.js';

/**
 * Sélecteur des séparateurs de groupe entre les applications
 * @type {string}
 */
const SEPARATOR_SELECTOR = '#apps .separator';

/**
 * Crée un séparateur de groupe (trait court, couleur d'accent)
 * @returns {HTMLElement}
 */
function createSeparator() {
  const separator = document.createElement('div');
  separator.classList.add('separator', 'group');
  separator.setAttribute('aria-hidden', 'true');
  return separator;
}

/**
 * Retrouve le bouton d'une application via son URL (échappée : l'URL peut
 * contenir des guillemets ou d'autres caractères spéciaux).
 * @param {string} url
 * @returns {?Element}
 */
function findButtonByUrl(url) {
  if (typeof url !== 'string') return null;
  return document.querySelector(`[href="${CSS.escape(url)}"]`);
}

/**
 * @class
 * @classdesc Gère la toolbar des applications
 */
export class Main {
  constructor() {
    this.main();
  }

  /**
   * Div qui contient les applications
   * @type {HTMLDivElement}
   * @readonly
   */
  get root() {
    return document.querySelector('#apps');
  }

  /**
   * Bouton d'ajout d'une application
   * @type {HTMLElement}
   * @readonly
   */
  get addButton() {
    return document.querySelector('#add-button');
  }

  /**
   * Ajoute un bouton ou un séparateur
   * @param {string | {url:string, name:string, picture:?string}} data Bouton à ajouter
   * @param {Object} [options={}]
   * @param {boolean} [options.request=false] Si l'on souhaite récupérer le bouton ou non
   * @returns {void | HTMLToolbarButton} Renvoi un HTMLToolbarButton si resuqest est vrai
   */
  add(_, data, { request = false } = {}) {
    if (data === 'separator') {
      if (document.querySelectorAll(HTMLToolbarButton.TAG).length !== 0)
        this.root.appendChild(createSeparator());
      return;
    }

    let button = HTMLToolbarButton.CreateNode(data.url, data.name, {
      picture: data.picture,
    });

    button.addEventListener(
      'event:custom:state.pressed',
      this.event_button_pressed.bind(this),
    );
    button.addEventListener(
      'event:custom:state.unpressed',
      this.event_button_unpressed.bind(this),
    );

    button.addEventListener('mouseenter', () => {
      if (!button.hasMedia) return;

      const rect = button.getBoundingClientRect();
      window.api.invoke(appEventList.mediaHover, {
        url: data.url,
        hovering: true,
        y: rect.top + rect.height / 2,
      });
    });
    button.addEventListener('mouseleave', () => {
      window.api.invoke(appEventList.mediaHover, {
        url: data.url,
        hovering: false,
      });
    });
    // Un clic sur la tuile ouvre aussi le lecteur (utile s'il vient de se fermer)
    button.addEventListener('click', () => {
      if (!button.hasMedia) return;

      const rect = button.getBoundingClientRect();
      window.api.invoke(appEventList.mediaHover, {
        url: data.url,
        hovering: true,
        y: rect.top + rect.height / 2,
      });
    });

    if (request === true) return button;

    if (document.querySelectorAll(HTMLToolbarButton.TAG).length === 0)
      this.root.appendChild(createSeparator());

    this.root.appendChild(button);
  }

  main() {
    // Effets de saison sur la barre (calque décoratif, ne capte aucun clic)
    initSeasonFx(document.querySelector('#main'), { narrow: true });

    // Réduite au rail, la barre se déplie au survol (masquage automatique,
    // filtré côté principal) ou au clic
    const isRail = () => document.documentElement.classList.contains('rail');
    document.documentElement.addEventListener('mouseenter', () => {
      if (isRail()) window.api.invoke(appEventList.edgeEnter);
    });
    document.querySelector('#rail-button').addEventListener('click', () => {
      window.api.invoke(appEventList.toggleToolbar);
    });

    // Infobulle : au survol (après 400 ms) et au focus clavier (immédiat)
    let tooltipTimer = null;
    let tooltipTarget = null;
    const tooltipHost = (target) =>
      target?.closest?.('rotomeca-toolbar-button, rds-icon-button') ?? null;
    const showTooltip = (element) => {
      // Un bouton qui joue un morceau affiche déjà le lecteur
      if (element.hasMedia) return;

      const text = element.dataset.tooltip ?? element.getAttribute('label');
      if (!text) return;

      const rect = element.getBoundingClientRect();
      window.api.invoke(appEventList.tooltipShow, {
        text,
        badge: element.dataset.tooltipBadge || null,
        y: rect.top + rect.height / 2,
      });
    };
    const hideTooltip = () => {
      clearTimeout(tooltipTimer);
      tooltipTarget = null;
      window.api.invoke(appEventList.tooltipHide);
    };
    document.addEventListener('mouseover', (event) => {
      const element = tooltipHost(event.target);
      if (element === tooltipTarget) return;

      hideTooltip();
      if (!element) return;
      tooltipTarget = element;
      tooltipTimer = setTimeout(() => showTooltip(element), 400);
    });
    document.addEventListener('mouseleave', hideTooltip);
    document.addEventListener('focusin', (event) => {
      const element = tooltipHost(event.target);
      if (!element) return;

      clearTimeout(tooltipTimer);
      tooltipTarget = element;
      showTooltip(element);
    });
    document.addEventListener('focusout', hideTooltip);
    document.addEventListener('click', hideTooltip);

    // Échap cache la barre (ouverte au clavier ou à la souris)
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape')
        window.api.invoke(appEventList.requestToggle);
    });

    window.api.on(pageEventList.toolbarAppSeparatorDelete, (_, url) => {
      let element =
        url === 0
          ? document.querySelector(SEPARATOR_SELECTOR)
          : findButtonByUrl(url)?.nextElementSibling;

      if (element?.classList.contains('separator')) element.remove();
    });

    window.api.on(pageEventList.toolbarAppDeleted, (_, url) => {
      findButtonByUrl(url)?.remove?.();
    });

    window.api.on(pageEventList.windowAppMovement, (_, args) => {
      const { url, type, modifier } = args;

      let appMoved = findButtonByUrl(url);
      let element = appMoved;

      for (let index = 0; element && index <= modifier; ++index) {
        element =
          type === 'up'
            ? element.previousElementSibling
            : element.nextElementSibling;
      }

      if (!appMoved || !element) return;

      switch (type) {
        case 'up':
          element.before(appMoved);
          break;

        case 'down':
          element.after(appMoved);
          break;

        default:
          break;
      }

      element = null;
      appMoved = null;
    });

    window.api.on(pageEventList.appEdited, (_, state) => {
      if (state) {
        document
          .querySelectorAll('#apps rotomeca-toolbar-button')
          .forEach((element) => {
            element.disable();
          });
        document.querySelector('#add-button').disabled = true;
        document.querySelector('#edit-button').disabled = true;
      } else {
        document
          .querySelectorAll('#apps rotomeca-toolbar-button')
          .forEach((element) => {
            element.enable();
          });
        document.querySelector('#add-button').disabled = false;
        document.querySelector('#edit-button').disabled = false;
      }
    });

    window.api.on(pageEventList.appAdded, (ev, data) => {
      this.add(ev, data);
    });

    window.api.on(pageEventList.appUpdated, (_, data) => {
      /**
       * @type {HTMLToolbarButton}
       */
      for (const element of document.querySelectorAll(HTMLToolbarButton.TAG)) {
        if (element.itemData.link === data.oldLink) {
          let tmp = this.add(_, data, { request: true });
          element.replaceWith(tmp);
          tmp = null;
          break;
        }
      }
    });

    window.api.on(pageEventList.init, (ev, args) => {
      const { saves: arr, settings } = args;
      for (const element of arr) {
        this.add(ev, element);
      }

      if (!settings?.isButton) {
        let node = document.createElement('rds-icon-button');
        node.setAttribute('icon', 'chevron-left');
        node.setAttribute('square', '');
        node.setAttribute('size', 'sm');
        node.setAttribute('label', window.api.t('toolbar.hide'));
        node.id = 'hide-button';

        node.onclick = () => {
          window.api.invoke(appEventList.toggleToolbar);
        };

        // Bouton réduire en tête de barre, suivi d'un séparateur simple
        const separator = document.createElement('div');
        separator.classList.add('separator');
        separator.setAttribute('aria-hidden', 'true');
        document.querySelector('#head').append(node, separator);
        node = null;
      }
    });

    window.api.on(pageEventList.appInserted, (_, args) => {
      const { url, data } = args;

      let button = HTMLToolbarButton.Select(url);

      if (button) {
        if (data === 'separator')
          button.after(createSeparator());
        else button.after(this.add(null, data, { request: true }));
      }
    });

    window.api.on(pageEventList.appIndicators, (_, { url, ...indicators }) => {
      HTMLToolbarButton.Select(url)?.setIndicators(indicators);
    });

    window.api.on(pageEventList.windowAppsClosed, () => {
      document.querySelector('[aria-pressed="true"]')?.unpress?.();
    });

    // Point sur le bouton Paramètres : orange (version disponible), vert (prête)
    const settingsButton = document.querySelector('#settings-button');
    const settingsLabel = settingsButton.getAttribute('label');
    const showUpdate = ({ etat }) => {
      const level =
        etat === 'ready'
          ? 'ready'
          : ['downloading', 'available'].includes(etat)
            ? 'pending'
            : null;
      if (level) settingsButton.dataset.maj = level;
      else delete settingsButton.dataset.maj;
      settingsButton.setAttribute(
        'label',
        level
          ? window.api.t(
              level === 'ready'
                ? 'toolbar.settingsUpdateReady'
                : 'toolbar.settingsUpdateAvailable',
            )
          : settingsLabel,
      );
    };
    window.api.on(pageEventList.updateState, (_, state) => showUpdate(state));
    window.api
      .invoke(appEventList.updateGetState)
      .then(showUpdate)
      .catch(() => {});

    document
      .querySelector('#settings-button')
      .addEventListener('click', () => {
        window.api.invoke(appEventList.openSettings);
      });

    this.addButton.addEventListener('click', () => {
      window.api.invoke(appEventList.requestAdd);
    });

    document
      .querySelector('#edit-button')
      .addEventListener('rds-icon-button:toggle', (event) => {
        const editing = event.detail.selected;

        document
          .querySelectorAll('#apps rotomeca-toolbar-button')
          .forEach((element) => {
            element.classList.toggle('edit', editing);
          });
        document.querySelector('#add-button').disabled = editing;
      });
  }

  event_button_pressed(e) {
    if (e.caller.isOnEditMode) return;

    if (!e.caller.not) {
      const current = e.caller;
      window.api.invoke(appEventList.openFrame, current.itemData.link);
      document.querySelectorAll(HTMLToolbarButton.TAG).forEach((element) => {
        if (element.id !== current.id && element.isPressed)
          element.toggleState();
      });
    } else {
      e.caller.unpress({ enableEvent: false });

      e.caller.not = null;
    }
  }

  event_button_unpressed(event) {
    const current = event.caller;
    window.api.invoke(appEventList.closeFrame, current.itemData.link);
  }

  static Run() {
    return new Main();
  }
}

Main.Run();
