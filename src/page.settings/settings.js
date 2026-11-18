import '../scripts/ds.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';

/**
 * Familles de thèmes (ordre d'affichage) : libellé du réglage → [clé de traduction du thème].
 * `mode` / `palette` servent à l'aperçu de la vignette, qui porte ses propres attributs.
 */
const THEME_FAMILIES = {
  base: {
    label: 'settings.familyBase',
    themes: ['system', 'clair', 'sombre', 'blanc', 'noir'],
  },
  colors: {
    label: 'settings.familyColors',
    themes: ['marron', 'rouge', 'bleu', 'vert', 'sapin'],
  },
  seasons: {
    label: 'settings.familySeasons',
    themes: ['hiver', 'automne', 'printemps', 'cerisier', 'ete', 'noel'],
  },
};

const THEME_PREVIEWS = {
  clair: ['light', ''],
  sombre: ['dark', ''],
  blanc: ['light', 'blanc'],
  noir: ['dark', 'noir'],
  marron: ['dark', 'marron'],
  rouge: ['dark', 'rouge'],
  bleu: ['dark', 'bleu'],
  vert: ['dark', 'vert'],
  sapin: ['dark', 'sapin'],
  hiver: ['dark', 'hiver'],
  automne: ['dark', 'automne'],
  printemps: ['dark', 'printemps'],
  cerisier: ['dark', 'cerisier'],
  ete: ['light', 'ete'],
  noel: ['dark', 'noel'],
};

const THEME_LABELS = {
  system: 'settings.themeSystem',
  clair: 'settings.themeClair',
  sombre: 'settings.themeDark',
  blanc: 'settings.themeWhite',
  noir: 'settings.themeBlack',
  marron: 'settings.themeMarron',
  rouge: 'settings.themeRed',
  bleu: 'settings.themeBlue',
  vert: 'settings.themeGreen',
  sapin: 'settings.themeSapin',
  hiver: 'settings.themeHiver',
  automne: 'settings.themeAutomne',
  printemps: 'settings.themePrintemps',
  cerisier: 'settings.themeCerisier',
  ete: 'settings.themeEte',
  noel: 'settings.themeNoel',
};

/**
 * @param {string} theme
 * @returns {string} Clé de la famille qui contient ce thème
 */
function familyOf(theme) {
  return (
    Object.keys(THEME_FAMILIES).find((key) =>
      THEME_FAMILIES[key].themes.includes(theme),
    ) ?? 'base'
  );
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function element(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Mini-barre (14 px) d'un aperçu : bouton primaire, filet d'accent, deux pastilles.
 * @returns {HTMLElement}
 */
function previewBar() {
  const bar = element('span', 'preview-bar');
  for (const cls of ['pv-plus', 'pv-sep', '', '']) bar.appendChild(element('span', cls));
  return bar;
}

export class PageSettings {
  constructor() {
    this.settings ??= {};
    this.main();
  }

  /**
   * Notifie le processus principal que les réglages ont changé
   */
  #saveSettings() {
    window.api.invoke(appEventList.settingsUpdated, this.settings);
  }

  async #initDisplays() {
    const displays = (await window.api.invoke(appEventList.getDisplays)) ?? [];
    if (displays.length < 2) return;

    // Écran enregistré absent : on affiche le principal sans toucher au réglage
    const selected =
      displays.find((d) => d.id === this.settings.displayId) ??
      displays.find((d) => d.isPrimary) ??
      displays[0];
    const select = document.querySelector('#displays');

    for (const display of displays) {
      const option = document.createElement('option');
      option.value = String(display.id);
      option.textContent = display.label;
      select.appendChild(option);
    }

    select.value = String(selected.id);

    select.addEventListener('rds-select:change', (event) => {
      const display = displays.find(
        (d) => String(d.id) === event.detail.value,
      );
      if (!display) return;

      this.settings.displayId = display.id;
      this.#saveSettings();
    });

    document.querySelector('#display-setting').hidden = false;
  }

  /**
   * Texte d'aide propre au mode d'activation choisi
   * @param {'button'|'mouse'|'appbar'} mode
   */
  #showModeHelp(mode) {
    const keys = {
      button: 'settings.helpButton',
      mouse: 'settings.helpMouse',
      appbar: 'settings.helpAppBar',
    };
    document.querySelector('#mode-help').textContent = window.api.t(keys[mode]);
  }

  async #initMode() {
    const control = document.querySelector('#mode');

    // L'option « barre ancrée » n'existe que si l'API native est disponible
    const appBarSupported = await window.api.invoke(
      appEventList.isAppBarSupported,
    );

    if (appBarSupported) {
      const option = document.createElement('option');
      option.value = 'appbar';
      option.dataset.i18n = 'settings.modeAppBar';
      option.textContent = 'Barre ancrée';
      control.appendChild(option);
    }

    const isAppBar = appBarSupported && this.settings.appBarEnabled === true;
    let current = this.settings.isButtonModeEnabled ? 'button' : 'mouse';
    if (isAppBar) current = 'appbar';
    this.#showModeHelp(current);

    if (isAppBar) control.value = 'appbar';
    else control.value = this.settings.isButtonModeEnabled ? 'button' : 'mouse';

    const autoHide = document.querySelector('#autohide');
    const appBarSettings = document.querySelector('#appbar-settings');
    appBarSettings.hidden = !isAppBar;

    autoHide.checked = this.settings.appBarAutoHide === true;
    autoHide.addEventListener('rds-switch:change', (event) => {
      this.settings.appBarAutoHide = event.detail.checked;
      this.#saveSettings();
    });

    control.addEventListener('rds-segmented-control:change', (event) => {
      const mode = event.detail.value;
      this.#showModeHelp(mode);
      appBarSettings.hidden = mode !== 'appbar';

      this.settings.appBarEnabled = mode === 'appbar';
      // En mode ancré, on conserve le dernier choix bouton/souris
      if (mode !== 'appbar')
        this.settings.isButtonModeEnabled = mode === 'button';
      this.#saveSettings();
    });
  }

  /**
   * Aperçu d'une vignette : porte son propre data-theme / data-palette.
   * @param {string} theme
   * @returns {HTMLElement}
   */
  #createPreview(theme) {
    if (theme === 'system') {
      // Moitié claire, moitié sombre
      const split = element('span', 'preview split');
      split.setAttribute('aria-hidden', 'true');

      const light = element('span', 'half light');
      light.dataset.theme = 'light';
      light.appendChild(previewBar());

      const dark = element('span', 'half dark');
      dark.dataset.theme = 'dark';
      dark.appendChild(element('span', 'pv-btn'));

      split.append(light, dark);
      return split;
    }

    const [mode, palette] = THEME_PREVIEWS[theme];
    const preview = element('span', 'preview');
    preview.setAttribute('aria-hidden', 'true');
    preview.dataset.theme = mode;
    preview.dataset.palette = palette;

    const body = element('span', 'preview-body');
    for (const cls of ['pv-l1', 'pv-l2', 'pv-btn']) body.appendChild(element('span', cls));
    preview.append(previewBar(), body);

    return preview;
  }

  /**
   * (Re)construit la grille de vignettes de la famille affichée.
   * @param {string} family
   */
  #renderThemes(family) {
    const root = document.querySelector('#themes');
    root.textContent = '';

    for (const theme of THEME_FAMILIES[family].themes) {
      const chosen = this.settings.theme === theme;
      const tile = element('button', 'tile');
      tile.type = 'button';
      tile.dataset.theme = theme;
      tile.setAttribute('aria-pressed', String(chosen));

      const name = element('span', 'tile-name');
      if (chosen) {
        const check = document.createElement('rds-icon');
        check.setAttribute('name', 'check');
        check.setAttribute('size', 'sm');
        name.appendChild(check);
      }
      name.appendChild(document.createTextNode(window.api.t(THEME_LABELS[theme])));

      tile.append(this.#createPreview(theme), name);
      tile.addEventListener('click', () => {
        // Appliqué et diffusé tout de suite : le processus principal met à jour toutes les fenêtres
        this.settings.theme = theme;
        this.#saveSettings();
        this.#renderThemes(family);
        this.#showSeasonOptions(family);
      });
      root.appendChild(tile);
    }
  }

  /**
   * Les réglages d'effets n'existent que dans la famille Saisons.
   * @param {string} family
   */
  #showSeasonOptions(family) {
    document.querySelector('#season-options').hidden = family !== 'seasons';
  }

  #initTheme() {
    const familyControl = document.querySelector('#family');

    for (const [key, { label }] of Object.entries(THEME_FAMILIES)) {
      const option = document.createElement('option');
      option.value = key;
      option.dataset.i18n = label;
      option.textContent = window.api.t(label);
      familyControl.appendChild(option);
    }

    // À l'ouverture : la famille du thème actif
    const family = familyOf(this.settings.theme);
    familyControl.value = family;
    this.#renderThemes(family);
    this.#showSeasonOptions(family);

    familyControl.addEventListener('rds-segmented-control:change', (event) => {
      const next = event.detail.value;
      if (!THEME_FAMILIES[next]) return;

      this.#renderThemes(next);
      this.#showSeasonOptions(next);
    });

    // Effets de saison : interrupteur et densité
    const fx = document.querySelector('#fx');
    fx.checked = this.settings.effetsSaison !== false;
    fx.addEventListener('rds-switch:change', (event) => {
      this.settings.effetsSaison = event.detail.checked;
      this.#saveSettings();
    });

    const density = document.querySelector('#density');
    density.value = this.settings.densiteEffets ?? 'normale';
    density.addEventListener('rds-segmented-control:change', (event) => {
      this.settings.densiteEffets = event.detail.value;
      this.#saveSettings();
    });
  }

  async main() {
    window.api.on(pageEventList.settingsStart, async (_, path) => {
      console.log('path', path);
      await fetch(path)
        .then(function (response) {
          return response.json();
        })
        .then(
          function (data) {
            this.settings = data ?? {};
          }.bind(this),
        )
        .catch(function (err) {
          console.error('error: ' + err);
        });

      document.querySelector('#version').textContent = window.api.t(
        'settings.versionLabel',
        { version: await window.api.invoke(appEventList.getVersion) },
      );

      this.settings ??= {};
      this.settings.isButtonModeEnabled ??= true;
      this.settings.theme ??= 'system';
      this.settings.effetsSaison ??= true;
      this.settings.densiteEffets ??= 'normale';

      await this.#initDisplays();
      await this.#initMode();
      this.#initTheme();
    });
  }
}

new PageSettings();
