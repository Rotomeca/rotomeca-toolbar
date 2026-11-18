import { appEventList } from '../scripts/events/AppEventListModule.js';

/**
 * Jetons du thème recopiés dans l'iframe de recherche (qui n'hérite pas des --ds-*).
 * @type {string[]}
 */
const THEME_TOKENS = [
  '--ds-body-background-color',
  '--ds-background-surface',
  '--ds-background-surface-variant',
  '--ds-background-surface-strong',
  '--ds-border-subtle',
  '--ds-border-strong',
  '--ds-text-default',
  '--ds-text-muted',
  '--ds-text-action-tertiary',
  '--ds-background-action-primary',
  '--ds-background-action-primary-hover',
  '--ds-text-action-primary',
  '--ds-background-tone-success',
  '--ds-text-tone-success',
  '--ds-input-background',
  '--ds-input-text',
  '--ds-input-hint',
  '--ds-input-border',
  '--ds-input-radius',
  '--ds-focus-ring-color',
  '--ds-font-sans',
];

/** Messages échangés avec l'iframe de recherche */
const MESSAGE_READY = 'rotomecaSearchReady';
const MESSAGE_THEME = 'rotomecaTheme';
const MESSAGE_SAVED = 'rotomecaSaved';

/**
 * Forme comparable d'une adresse (sans barre finale ni ancre).
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname.replace(/\/$/, '') + parsed.search;
  } catch (error) {
    return String(url);
  }
}

/**
 * @class
 * @classdesc Page d'ajout d'un lien
 */
export class Page {
  /** Adresses déjà dans la barre (formes normalisées) */
  #saved = new Set();
  #searchCss = '';
  #frameReady = false;

  constructor() {
    this.main();
  }

  get frame() {
    return document.querySelector('iframe');
  }

  /**
   * Envoie un message à l'iframe de recherche (origine opaque : cible « * »).
   */
  #post(message) {
    this.frame?.contentWindow?.postMessage(message, '*');
  }

  /**
   * Envoie à l'iframe le thème courant : feuille Google, jetons résolus et libellés.
   */
  #pushTheme() {
    if (!this.#frameReady) return;

    const style = getComputedStyle(document.documentElement);
    const tokens = {};
    for (const name of THEME_TOKENS)
      tokens[name] = style.getPropertyValue(name).trim();

    this.#post({
      type: MESSAGE_THEME,
      css: this.#searchCss,
      tokens,
      scheme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      labels: {
        add: window.api.t('add.addToBar'),
        customize: window.api.t('add.customize'),
        added: window.api.t('add.added'),
      },
    });
  }

  #pushSaved() {
    if (this.#frameReady)
      this.#post({ type: MESSAGE_SAVED, urls: [...this.#saved] });
  }

  /**
   * Demande l'ajout (ou l'ajout avec personnalisation) d'un site.
   * @param {string} type appEventList.requestAddData | requestAddDataEdit
   * @param {{name: string, url: string, picture: ?string}} data
   */
  async #request(type, data) {
    const ok = await window.api.invoke(type, data);

    // La fenêtre reste ouverte après un ajout direct : on le signale aux deux listes
    if (type === appEventList.requestAddData && ok) {
      this.#saved.add(normalizeUrl(data.url));
      this.#refreshPopular();
      this.#pushSaved();
    }
  }

  /**
   * Un bouton « populaire » : icône ronde et nom.
   * @param {{url: string, title: string, icon: ?string}} element
   * @returns {HTMLButtonElement}
   */
  #createPopular(element) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'popular';
    button.dataset.url = element.url;
    button.setAttribute('aria-label', window.api.t('add.addNamed', { name: element.title }));

    const icon = document.createElement('span');
    icon.className = 'popular-icon';
    icon.setAttribute('aria-hidden', 'true');

    if (typeof element.icon === 'string' && element.icon.startsWith('font:')) {
      const glyph = document.createElement('i');
      glyph.className = `icofont-${element.icon.slice('font:'.length)}`;
      icon.appendChild(glyph);
    } else if (element.icon) {
      const image = document.createElement('img');
      image.src = element.icon;
      image.alt = '';
      icon.appendChild(image);
    } else {
      icon.textContent = element.title.slice(0, 1);
    }

    const name = document.createElement('span');
    name.className = 'popular-name';
    name.textContent = element.title;

    button.append(icon, name);
    button.addEventListener('click', () =>
      this.#request(appEventList.requestAddData, {
        name: element.title,
        url: element.url,
        picture: element.icon ?? null,
      }),
    );

    return button;
  }

  /**
   * Marque « Ajouté » les populaires déjà dans la barre.
   */
  #refreshPopular() {
    for (const button of document.querySelectorAll('#predefined-apps .popular')) {
      const added = this.#saved.has(normalizeUrl(button.dataset.url));
      button.classList.toggle('added', added);
      button.disabled = added;

      const icon = button.querySelector('.popular-icon');
      if (added && !icon.querySelector('rds-icon')) {
        icon.dataset.previous = icon.innerHTML;
        icon.innerHTML = '<rds-icon name="check"></rds-icon>';
      } else if (!added && icon.dataset.previous !== undefined) {
        icon.innerHTML = icon.dataset.previous;
        delete icon.dataset.previous;
      }
    }
  }

  async main() {
    window.electron ??= {};
    // Attendre que le dom soit chargé pour lancer la frame
    window.addEventListener('DOMContentLoaded', () => {
      this.frame.setAttribute('src', this.frame.getAttribute('data-src'));
    });

    // Habillage du widget Google : lu ici, injecté dans l'iframe (qui ne lit aucun fichier local)
    const cssLoaded = fetch('./google-search.css')
      .then((response) => response.text())
      .then((css) => {
        this.#searchCss = css;
      })
      .catch((error) => console.error('google-search.css', error));

    // Thème : le processus principal change data-theme / data-palette, on retransmet
    new MutationObserver(() => this.#pushTheme()).observe(
      document.documentElement,
      { attributes: true, attributeFilter: ['data-theme', 'data-palette'] },
    );

    // Messages venant de l'iframe de recherche (sandboxée, sans accès à l'IPC)
    window.addEventListener('message', async (event) => {
      if (!this.frame || event.source !== this.frame.contentWindow) return;

      const { type, name, url } = event.data ?? {};

      if (type === MESSAGE_READY) {
        await cssLoaded;
        this.#frameReady = true;
        this.#pushTheme();
        this.#pushSaved();
        return;
      }

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

      this.#request(type, {
        name: typeof name === 'string' ? name : String(url),
        url,
        picture: null,
      });
    });

    // Sites déjà présents dans la barre
    const saved = await window.api.invoke(appEventList.getSavedUrls);
    for (const url of saved ?? []) this.#saved.add(normalizeUrl(url));

    // Récupérer la config avec la liste des applications par défaut
    await fetch('../../configs/config.json')
      .then((response) => response.json())
      .then((data) => {
        window.electron.files = data;
      })
      .catch((error) => console.log('error: ' + error));

    // Génération des boutons
    const root = document.querySelector('#predefined-apps');
    for (const element of window.electron.files?.default_apps ?? [])
      root.appendChild(this.#createPopular(element));

    this.#refreshPopular();
    this.#pushSaved();
  }

  static Run() {
    return new Page();
  }
}

Page.Run();
