import '../scripts/ds.js';
import type { RdsLoadingButton, RdsProgress, RdsSegmentedControl, RdsSelect, RdsSwitch } from '../types/rds.js';
import { requireElement } from '../scripts/dom.js';
import { initSeasonFx } from '../scripts/seasonFx.js';
import type { PermissionDecision, SeasonInfo, UpdateState } from '../shared/dto.js';
import { appEventList, pageEventList } from '../shared/ipc/events.js';
import type { SettingsFormDto } from '../shared/ipc/contracts.js';
import { THEME_FAMILIES, THEME_LABELS, THEME_PREVIEWS, familyOf, isFamilyKey, themesOf } from './themeCatalog.js';
import type { FamilyKey, ThemeEntry } from './themeCatalog.js';
import { describeTestChannel, describeUpdateCard } from './updateCard.js';

const t = (key: string, variables?: Record<string, string | number>): string => window.api.t(key, variables);
const logError = (error: unknown): void => console.error(error);

/** « La date relative » de la dernière vérification est rafraîchie chaque minute. */
const REFRESH_INTERVAL_MS = 60_000;

type Mode = 'button' | 'mouse' | 'appbar';

/** Réglages tels que la page les modifie (les valeurs absentes sont complétées au chargement). */
type EditableSettings = { -readonly [K in keyof SettingsFormDto]: SettingsFormDto[K] };

const DEFAULT_SETTINGS: EditableSettings = {
  theme: 'system',
  themeAuto: false,
  effetsSaison: true,
  densiteEffets: 'normale',
  isButtonModeEnabled: true,
  appBarEnabled: false,
  appBarAutoHide: false,
  displayId: null,
};

function element(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Mini-barre (14 px) d'un aperçu : bouton primaire, filet d'accent, deux pastilles. */
function previewBar(): HTMLElement {
  const bar = element('span', 'preview-bar');
  for (const cls of ['pv-plus', 'pv-sep', '', '']) bar.appendChild(element('span', cls));
  return bar;
}

/** Affiche un statut texte, avec une icône d'alerte en cas d'erreur. */
function setStatus(target: HTMLElement, text: string, error = false): void {
  target.replaceChildren();
  target.classList.toggle('erreur', error);

  if (error) {
    const alert = document.createElement('rds-icon');
    alert.setAttribute('name', 'circle-alert');
    alert.setAttribute('aria-hidden', 'true');
    target.append(alert);
  }

  target.append(text);
}

/** Aperçu d'une vignette : porte son propre data-theme / data-palette. */
function createPreview(theme: string): HTMLElement {
  if (theme === 'system') {
    // Moitié claire, moitié sombre
    const split = element('span', 'preview split');
    split.setAttribute('aria-hidden', 'true');

    const light = element('span', 'half light');
    light.dataset['theme'] = 'light';
    light.appendChild(previewBar());

    const dark = element('span', 'half dark');
    dark.dataset['theme'] = 'dark';
    dark.appendChild(element('span', 'pv-btn'));

    split.append(light, dark);
    return split;
  }

  const [mode, palette] = THEME_PREVIEWS[theme] ?? ['dark', ''];
  const preview = element('span', 'preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.dataset['theme'] = mode;
  preview.dataset['palette'] = palette;

  const body = element('span', 'preview-body');
  for (const cls of ['pv-l1', 'pv-l2', 'pv-btn']) body.appendChild(element('span', cls));
  preview.append(previewBar(), body);

  return preview;
}

const themeLabel = (theme: string): string => t(THEME_LABELS[theme] ?? theme);

/** La page des paramètres. */
export class SettingsPage {
  private settings: EditableSettings = { ...DEFAULT_SETTINGS };
  private season: SeasonInfo | null = null;

  constructor() {
    initSeasonFx(requireElement('#page'));
  }

  start(): void {
    window.api.on(pageEventList.settingsStart, (_, settingsFile) => {
      this.initialize(settingsFile).catch(logError);
    });
  }

  private async initialize(settingsFile: string): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.readSettings(settingsFile)) };

    await this.initDisplays();
    await this.initMode();
    await this.initTheme();
    await this.initUpdates();
    await this.initTestChannel();
    await this.initPermissions();
  }

  /** @returns Les réglages enregistrés (vides si le fichier est illisible : les valeurs par défaut s'appliquent) */
  private async readSettings(settingsFile: string): Promise<Partial<EditableSettings>> {
    try {
      const response = await fetch(settingsFile);
      return ((await response.json()) as Partial<EditableSettings> | null) ?? {};
    } catch (error) {
      console.error(`error: ${String(error)}`);
      return {};
    }
  }

  /** Notifie le processus principal que les réglages ont changé. */
  private saveSettings(): void {
    window.api.invoke(appEventList.settingsUpdated, this.settings).catch(logError);
  }

  // #region Écran et mode d'activation

  private async initDisplays(): Promise<void> {
    const displays = await window.api.invoke(appEventList.getDisplays);
    if (displays.length < 2) return;

    // Écran enregistré absent : on affiche le principal sans toucher au réglage
    const selected = displays.find((d) => d.id === this.settings.displayId) ?? displays.find((d) => d.isPrimary) ?? displays[0];
    const select = requireElement<RdsSelect>('#displays');

    for (const display of displays) {
      const option = document.createElement('option');
      option.value = String(display.id);
      option.textContent = display.label;
      select.appendChild(option);
    }

    select.value = String(selected?.id ?? '');

    select.addEventListener('rds-select:change', (event) => {
      const display = displays.find((d) => String(d.id) === event.detail.value);
      if (!display) return;

      this.settings.displayId = display.id;
      this.saveSettings();
    });

    requireElement('#display-setting').hidden = false;
  }

  /** Texte d'aide propre au mode d'activation choisi. */
  private showModeHelp(mode: Mode): void {
    const keys: Record<Mode, string> = { button: 'settings.helpButton', mouse: 'settings.helpMouse', appbar: 'settings.helpAppBar' };
    requireElement('#mode-help').textContent = t(keys[mode]);
  }

  private async initMode(): Promise<void> {
    const control = requireElement<RdsSegmentedControl>('#mode');

    // L'option « barre ancrée » n'existe que si l'API native est disponible
    const appBarSupported = await window.api.invoke(appEventList.isAppBarSupported);

    if (appBarSupported) {
      const option = document.createElement('option');
      option.value = 'appbar';
      option.dataset['i18n'] = 'settings.modeAppBar';
      option.textContent = 'Barre ancrée';
      control.appendChild(option);
    }

    const isAppBar = appBarSupported && this.settings.appBarEnabled;
    const current: Mode = isAppBar ? 'appbar' : this.settings.isButtonModeEnabled ? 'button' : 'mouse';
    this.showModeHelp(current);
    control.value = current;

    const appBarSettings = requireElement('#appbar-settings');
    appBarSettings.hidden = !isAppBar;

    const autoHide = requireElement<RdsSwitch>('#autohide');
    autoHide.checked = this.settings.appBarAutoHide;
    autoHide.addEventListener('rds-switch:change', (event) => {
      this.settings.appBarAutoHide = event.detail.checked;
      this.saveSettings();
    });

    control.addEventListener('rds-segmented-control:change', (event) => {
      const mode = event.detail.value as Mode;
      this.showModeHelp(mode);
      appBarSettings.hidden = mode !== 'appbar';

      this.settings.appBarEnabled = mode === 'appbar';
      // En mode ancré, on conserve le dernier choix bouton/souris
      if (mode !== 'appbar') this.settings.isButtonModeEnabled = mode === 'button';
      this.saveSettings();
    });
  }

  // #endregion

  // #region Thème

  /** Thème réellement appliqué : celui de la saison en mode automatique, sinon le choix manuel. */
  private get currentTheme(): string {
    return this.settings.themeAuto && this.season ? this.season.theme : this.settings.theme;
  }

  /** Choix manuel d'un thème : appliqué et diffusé tout de suite, et le mode automatique s'éteint. */
  private pick(theme: string, family: FamilyKey): void {
    this.settings.theme = theme;
    this.settings.themeAuto = false;
    requireElement<RdsSwitch>('#auto').checked = false;
    this.saveSettings();
    this.renderAutoBadge();
    this.renderThemes(family);
  }

  /** (Re)construit la grille de vignettes, la ligne de variantes et les réglages de saison. */
  private renderThemes(family: FamilyKey): void {
    const current = this.currentTheme;
    const root = requireElement('#themes');
    root.textContent = '';

    let active: ThemeEntry | null = null;

    for (const entry of THEME_FAMILIES[family].entries) {
      const list = themesOf(entry);
      const chosen = list.includes(current);
      // L'aperçu montre la variante active si le parent est choisi, sinon la première
      const shown = (chosen ? current : list[0]) ?? entry.name;
      if (chosen) active = entry;

      const tile = element('button', 'tile') as HTMLButtonElement;
      tile.type = 'button';
      tile.dataset['theme'] = shown;
      tile.setAttribute('aria-pressed', String(chosen));
      tile.append(createPreview(shown), this.createTileName(entry, chosen));
      tile.addEventListener('click', () => this.pick(shown, family));
      root.appendChild(tile);
    }

    this.renderVariants(family, active, current);
    requireElement('#season-options').hidden = family !== 'seasons';
  }

  private createTileName(entry: ThemeEntry, chosen: boolean): HTMLElement {
    const name = element('span', 'tile-name');

    if (chosen) {
      const check = document.createElement('rds-icon');
      check.setAttribute('name', 'check');
      check.setAttribute('size', 'sm');
      name.appendChild(check);
    }

    name.appendChild(document.createTextNode(themeLabel(entry.name)));

    if (entry.variants) {
      const more = element('span', 'plus');
      more.textContent = `+${entry.variants.length - 1}`;
      name.appendChild(more);
    }

    return name;
  }

  /** Ligne « Variante de <parent> » : une pilule par variante, seulement pour un parent à variantes. */
  private renderVariants(family: FamilyKey, active: ThemeEntry | null, current: string): void {
    const row = requireElement('#variants');
    const pills = requireElement('#variant-pills');
    pills.textContent = '';

    row.hidden = !active?.variants;
    if (!active?.variants) return;

    requireElement('#variants-label').textContent = t('settings.variantOf', { parent: themeLabel(active.name) });

    for (const variant of active.variants) {
      const [mode, palette] = THEME_PREVIEWS[variant.theme] ?? ['dark', ''];
      const pill = element('button', 'pill') as HTMLButtonElement;
      pill.type = 'button';
      pill.setAttribute('aria-pressed', String(variant.theme === current));

      // Pastille de 22 px : porte les attributs de la variante (fond de page + point d'action)
      const dot = element('span', 'pill-dot');
      dot.setAttribute('aria-hidden', 'true');
      dot.dataset['theme'] = mode;
      dot.dataset['palette'] = palette;
      dot.appendChild(element('span'));

      pill.append(dot, document.createTextNode(t(variant.label)));
      pill.addEventListener('click', () => this.pick(variant.theme, family));
      pills.appendChild(pill);
    }
  }

  /** Pastille de la saison en cours et du prochain changement (mode automatique). */
  private renderAutoBadge(): void {
    const badge = requireElement('#auto-badge');
    const { season } = this;
    badge.hidden = !(this.settings.themeAuto && season);
    if (badge.hidden || !season) return;

    const [year = 0, month = 1, day = 1] = season.nextDate.split('-').map(Number);
    const date = new Intl.DateTimeFormat(navigator.language, { day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day));

    badge.textContent = t('settings.autoBadge', { season: themeLabel(season.theme), next: themeLabel(season.nextTheme), date });
  }

  private async initTheme(): Promise<void> {
    const familyControl = requireElement<RdsSegmentedControl>('#family');
    this.season = await window.api.invoke(appEventList.getSeasonInfo);

    for (const [key, { label }] of Object.entries(THEME_FAMILIES)) {
      const option = document.createElement('option');
      option.value = key;
      option.dataset['i18n'] = label;
      option.textContent = t(label);
      familyControl.appendChild(option);
    }

    // À l'ouverture : la famille du thème actif (Saisons si le mode automatique est actif)
    const family = familyOf(this.currentTheme);
    familyControl.value = family;
    this.renderThemes(family);

    familyControl.addEventListener('rds-segmented-control:change', (event) => {
      if (isFamilyKey(event.detail.value)) this.renderThemes(event.detail.value);
    });

    this.initAutoTheme(familyControl);
    this.initSeasonEffects();
  }

  /** Thème automatique : suit les dates officielles des saisons. */
  private initAutoTheme(familyControl: RdsSegmentedControl): void {
    const auto = requireElement<RdsSwitch>('#auto');
    auto.checked = this.settings.themeAuto;
    this.renderAutoBadge();

    auto.addEventListener('rds-switch:change', (event) => {
      this.onAutoThemeChanged(event.detail.checked, familyControl).catch(logError);
    });
  }

  private async onAutoThemeChanged(enabled: boolean, familyControl: RdsSegmentedControl): Promise<void> {
    this.season = await window.api.invoke(appEventList.getSeasonInfo);

    if (enabled) {
      this.settings.themeAuto = true;
    } else {
      // Éteint à la main : le thème en cours devient le choix manuel
      this.settings.theme = this.currentTheme;
      this.settings.themeAuto = false;
    }

    this.saveSettings();
    this.renderAutoBadge();
    if (isFamilyKey(familyControl.value)) this.renderThemes(familyControl.value);
  }

  /** Effets de saison : interrupteur et densité. */
  private initSeasonEffects(): void {
    const fx = requireElement<RdsSwitch>('#fx');
    fx.checked = this.settings.effetsSaison;
    fx.addEventListener('rds-switch:change', (event) => {
      this.settings.effetsSaison = event.detail.checked;
      this.saveSettings();
    });

    const density = requireElement<RdsSegmentedControl>('#density');
    density.value = this.settings.densiteEffets;
    density.addEventListener('rds-segmented-control:change', (event) => {
      this.settings.densiteEffets = event.detail.value;
      this.saveSettings();
    });
  }

  // #endregion

  // #region Mises à jour

  /**
   * Carte « Mises à jour » : le processus principal envoie l'état complet à chaque changement,
   * la page n'affiche que cet état et renvoie deux actions.
   */
  private async initUpdates(): Promise<void> {
    const card = requireElement('#maj');
    const checkButton = requireElement<RdsLoadingButton>('#maj-rechercher');
    const installButton = requireElement('#maj-installer');

    let state: UpdateState | null = null;

    const render = (): void => {
      if (state) this.renderUpdateCard(card, checkButton, installButton, state);
    };

    checkButton.addEventListener('click', () => window.api.invoke(appEventList.updateCheck).catch(logError));
    installButton.addEventListener('click', () => window.api.invoke(appEventList.updateInstall).catch(logError));

    const apply = (next: UpdateState): void => {
      state = next;
      render();
    };

    window.api.on(pageEventList.updateState, (_, next) => apply(next));
    apply(await window.api.invoke(appEventList.updateGetState));

    // « dernière il y a N min » reste à jour tant que la fenêtre est ouverte
    setInterval(() => {
      if (state && !state.erreur) render();
    }, REFRESH_INTERVAL_MS);
  }

  private renderUpdateCard(card: HTMLElement, checkButton: RdsLoadingButton, installButton: HTMLElement, state: UpdateState): void {
    const view = describeUpdateCard(state, Date.now(), t);

    card.dataset['etat'] = view.stage;
    requireElement('#maj-icone').setAttribute('name', view.icon);
    requireElement('#sec-maj').textContent = view.title;
    requireElement('#maj-pre').hidden = !view.showPrereleaseBadge;

    const status = requireElement('#maj-etat');
    const progress = requireElement<RdsProgress>('#maj-progres');
    status.hidden = view.downloading;
    progress.hidden = !view.downloading;

    if (view.downloading) {
      if (view.progress !== null) progress.value = view.progress;
      else progress.removeAttribute('value');
      progress.label = view.progressLabel;
      progress.textContent = view.progressLabel;
    } else {
      setStatus(status, view.status, view.statusIsError);
    }

    // Une seule action primaire à la fois
    checkButton.hidden = !view.showCheckButton;
    checkButton.loading = view.checking;
    installButton.hidden = !view.showInstallButton;
    installButton.textContent = view.installLabel;
    installButton.setAttribute('icon-before', view.installIcon);
  }

  /** Bloc « Version de test » : cherche une pré-version, puis ouvre sa page (téléchargement manuel). */
  private async initTestChannel(): Promise<void> {
    const status = requireElement('#test-etat');
    const checkButton = requireElement<RdsLoadingButton>('#test-rechercher');
    const openButton = requireElement('#test-telecharger');

    const render = (state: UpdateState): void => {
      const view = describeTestChannel(state, t);
      checkButton.loading = view.checking;
      openButton.hidden = !view.showOpenButton;
      if (view.openLabel) openButton.textContent = view.openLabel;
      setStatus(status, view.status, view.statusIsError);
    };

    checkButton.addEventListener('click', () => window.api.invoke(appEventList.updateCheckTest).catch(logError));
    openButton.addEventListener('click', () => window.api.invoke(appEventList.updateInstallTest).catch(logError));

    window.api.on(pageEventList.updateState, (_, next) => render(next));
    render(await window.api.invoke(appEventList.updateGetState));
  }

  // #endregion

  // #region Permissions

  /**
   * Section « Permissions des sites » : liste des décisions mémorisées, avec révocation une à une
   * ou en bloc. Les origines viennent de sites tiers : elles ne sont insérées que via `textContent`.
   */
  private async initPermissions(): Promise<void> {
    const list = requireElement('#perm-list');
    const empty = requireElement('#perm-empty');
    const clearButton = requireElement('#perm-clear');

    const render = (decisions: readonly PermissionDecision[]): void => {
      list.replaceChildren(...decisions.map((decision) => this.createPermissionItem(decision, render)));
      empty.hidden = decisions.length > 0;
      clearButton.hidden = decisions.length === 0;
    };

    clearButton.addEventListener('click', () => {
      window.api.invoke(appEventList.permissionsClear).then(render).catch(logError);
    });

    render(await window.api.invoke(appEventList.permissionsList));
  }

  private createPermissionItem(
    { origin, permission, allowed }: PermissionDecision,
    render: (decisions: readonly PermissionDecision[]) => void,
  ): HTMLElement {
    const kind = t(`permissions.kind.${permission}`);

    const info = element('div', 'perm-info');
    const originLabel = element('span', 'perm-origin');
    originLabel.textContent = origin;
    originLabel.title = origin;
    const kindLabel = element('span', 'perm-kind');
    kindLabel.textContent = kind;
    info.append(originLabel, kindLabel);

    const state = element('span', 'perm-state');
    state.dataset['allowed'] = String(allowed);
    state.textContent = t(allowed ? 'permissions.allowed' : 'permissions.denied');

    const revoke = document.createElement('rds-button');
    revoke.setAttribute('variant', 'tertiary');
    revoke.setAttribute('icon-before', 'trash-2');
    revoke.setAttribute('aria-label', t('permissions.revokeLabel', { kind, origin }));
    revoke.textContent = t('permissions.revoke');
    revoke.addEventListener('click', () => {
      window.api.invoke(appEventList.permissionRevoke, { origin, permission }).then(render).catch(logError);
    });

    const item = document.createElement('li');
    item.append(info, state, revoke);
    return item;
  }

  // #endregion
}

new SettingsPage().start();
