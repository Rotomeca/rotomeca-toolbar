import '../scripts/ds.js';
import { appEventList } from '../scripts/events/AppEventListModule.js';
import { pageEventList } from '../scripts/events/PageEventListModule.js';
import { initSeasonFx } from '../scripts/seasonFx.js';

/**
 * Familles de thèmes (ordre d'affichage). Une entrée est un thème parent : sans `variants`,
 * c'est un thème ; avec `variants`, c'est un regroupement dont chaque variante désigne le
 * thème final enregistré (« sapin », « noel », « cerisier »…).
 */
const THEME_FAMILIES = {
  base: {
    label: 'settings.familyBase',
    entries: [{ name: 'system' }, { name: 'clair' }, { name: 'sombre' }, { name: 'blanc' }, { name: 'noir' }],
  },
  colors: {
    label: 'settings.familyColors',
    entries: [
      { name: 'marron' },
      { name: 'rouge' },
      { name: 'bleu' },
      {
        name: 'vert',
        variants: [
          { label: 'settings.variantClassic', theme: 'vert' },
          { label: 'settings.variantSapin', theme: 'sapin' },
        ],
      },
    ],
  },
  seasons: {
    label: 'settings.familySeasons',
    entries: [
      {
        name: 'hiver',
        variants: [
          { label: 'settings.variantNeige', theme: 'hiver' },
          { label: 'settings.variantNoel', theme: 'noel' },
        ],
      },
      { name: 'automne' },
      {
        name: 'printemps',
        variants: [
          { label: 'settings.variantFeuilles', theme: 'printemps' },
          { label: 'settings.variantCerisier', theme: 'cerisier' },
        ],
      },
      { name: 'ete' },
    ],
  },
};

/**
 * @param {{name: string, variants?: {theme: string}[]}} entry
 * @returns {string[]} Thèmes finaux que couvre une entrée
 */
function themesOf(entry) {
  return entry.variants ? entry.variants.map((variant) => variant.theme) : [entry.name];
}

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
 * @param {string} theme Thème final
 * @returns {string} Clé de la famille qui contient ce thème
 */
function familyOf(theme) {
  return (
    Object.keys(THEME_FAMILIES).find((key) =>
      THEME_FAMILIES[key].entries.some((entry) => themesOf(entry).includes(theme)),
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
    initSeasonFx(document.querySelector('#page'));
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
   * Thème réellement appliqué : celui de la saison en mode automatique, sinon le choix manuel.
   * @type {string}
   */
  get #current() {
    return this.settings.themeAuto === true && this.season
      ? this.season.theme
      : this.settings.theme;
  }

  /**
   * Choix manuel d'un thème : appliqué et diffusé tout de suite, et le mode automatique s'éteint.
   * @param {string} theme Thème final
   * @param {string} family Famille affichée
   */
  #pick(theme, family) {
    this.settings.theme = theme;
    this.settings.themeAuto = false;
    document.querySelector('#auto').checked = false;
    this.#saveSettings();
    this.#renderAutoBadge();
    this.#render(family);
  }

  /**
   * (Re)construit la grille de vignettes, la ligne de variantes et les réglages de saison.
   * @param {string} family
   */
  #render(family) {
    const current = this.#current;
    const root = document.querySelector('#themes');
    root.textContent = '';

    let active = null;

    for (const entry of THEME_FAMILIES[family].entries) {
      const list = themesOf(entry);
      const chosen = list.includes(current);
      // L'aperçu montre la variante active si le parent est choisi, sinon la première
      const shown = chosen ? current : list[0];
      if (chosen) active = entry;

      const tile = element('button', 'tile');
      tile.type = 'button';
      tile.dataset.theme = shown;
      tile.setAttribute('aria-pressed', String(chosen));

      const name = element('span', 'tile-name');
      if (chosen) {
        const check = document.createElement('rds-icon');
        check.setAttribute('name', 'check');
        check.setAttribute('size', 'sm');
        name.appendChild(check);
      }
      name.appendChild(document.createTextNode(window.api.t(THEME_LABELS[entry.name])));
      if (entry.variants) {
        const more = element('span', 'plus');
        more.textContent = `+${entry.variants.length - 1}`;
        name.appendChild(more);
      }

      tile.append(this.#createPreview(shown), name);
      tile.addEventListener('click', () => this.#pick(shown, family));
      root.appendChild(tile);
    }

    this.#renderVariants(family, active, current);
    document.querySelector('#season-options').hidden = family !== 'seasons';
  }

  /**
   * Ligne « Variante de <parent> » : une pilule par variante, seulement pour un parent à variantes.
   * @param {string} family
   * @param {?{name: string, variants?: {label: string, theme: string}[]}} active Parent choisi
   * @param {string} current Thème appliqué
   */
  #renderVariants(family, active, current) {
    const row = document.querySelector('#variants');
    const pills = document.querySelector('#variant-pills');
    pills.textContent = '';

    row.hidden = !active?.variants;
    if (!active?.variants) return;

    document.querySelector('#variants-label').textContent = window.api.t('settings.variantOf', {
      parent: window.api.t(THEME_LABELS[active.name]),
    });

    for (const variant of active.variants) {
      const [mode, palette] = THEME_PREVIEWS[variant.theme];
      const pill = element('button', 'pill');
      pill.type = 'button';
      pill.setAttribute('aria-pressed', String(variant.theme === current));

      // Pastille de 22 px : porte les attributs de la variante (fond de page + point d'action)
      const dot = element('span', 'pill-dot');
      dot.setAttribute('aria-hidden', 'true');
      dot.dataset.theme = mode;
      dot.dataset.palette = palette;
      dot.appendChild(element('span'));

      pill.append(dot, document.createTextNode(window.api.t(variant.label)));
      pill.addEventListener('click', () => this.#pick(variant.theme, family));
      pills.appendChild(pill);
    }
  }

  /**
   * Pastille de la saison en cours et du prochain changement (mode automatique).
   */
  #renderAutoBadge() {
    const badge = document.querySelector('#auto-badge');
    badge.hidden = !(this.settings.themeAuto === true && this.season);
    if (badge.hidden) return;

    const [year, month, day] = this.season.nextDate.split('-').map(Number);
    const date = new Intl.DateTimeFormat(navigator.language, {
      day: 'numeric',
      month: 'long',
    }).format(new Date(year, month - 1, day));

    badge.textContent = window.api.t('settings.autoBadge', {
      season: window.api.t(THEME_LABELS[this.season.theme]),
      next: window.api.t(THEME_LABELS[this.season.nextTheme]),
      date,
    });
  }

  async #initTheme() {
    const familyControl = document.querySelector('#family');
    this.season = await window.api.invoke(appEventList.getSeasonInfo);

    for (const [key, { label }] of Object.entries(THEME_FAMILIES)) {
      const option = document.createElement('option');
      option.value = key;
      option.dataset.i18n = label;
      option.textContent = window.api.t(label);
      familyControl.appendChild(option);
    }

    // À l'ouverture : la famille du thème actif (Saisons si le mode automatique est actif)
    const family = familyOf(this.#current);
    familyControl.value = family;
    this.#render(family);

    familyControl.addEventListener('rds-segmented-control:change', (event) => {
      if (THEME_FAMILIES[event.detail.value]) this.#render(event.detail.value);
    });

    // Thème automatique : suit les dates officielles des saisons
    const auto = document.querySelector('#auto');
    auto.checked = this.settings.themeAuto === true;
    this.#renderAutoBadge();
    auto.addEventListener('rds-switch:change', async (event) => {
      this.season = await window.api.invoke(appEventList.getSeasonInfo);

      if (event.detail.checked) {
        this.settings.themeAuto = true;
      } else {
        // Éteint à la main : le thème en cours devient le choix manuel
        this.settings.theme = this.#current;
        this.settings.themeAuto = false;
      }

      this.#saveSettings();
      this.#renderAutoBadge();
      this.#render(familyControl.value);
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
      this.settings.themeAuto ??= false;
      this.settings.effetsSaison ??= true;
      this.settings.densiteEffets ??= 'normale';

      await this.#initDisplays();
      await this.#initMode();
      await this.#initTheme();
    });
  }
}

new PageSettings();
