import type { UpdateLevel } from './updateBadge.js';
import { buildTrayTooltip } from './trayTooltip.js';
import type { TrayUpdateInfo } from './trayTooltip.js';

/** Un élément du menu de la zone de notification. */
export interface TrayMenuItem {
  readonly label: string;
  readonly accelerator?: string;
  /** `false` : l'accélérateur n'est qu'affiché (il est enregistré globalement par ailleurs). */
  readonly registerAccelerator?: boolean;
  readonly click: () => void;
}

/** Ce que le service demande à l'icône de la zone de notification (un sous-ensemble de `Tray`). */
export interface TrayHandle<Icon> {
  setImage(icon: Icon): void;
  setToolTip(tooltip: string): void;
  setContextMenu(menu: unknown): void;
  popUpContextMenu(menu: unknown): void;
  isDestroyed(): boolean;
  on(event: 'click', listener: () => void): unknown;
}

export interface TrayActions {
  /** Affiche ou cache la barre. */
  toggleToolbar(): void;
  openSettings(): void;
  quit(): void;
}

export interface TrayDeps<Icon> {
  readonly createTray: (icon: Icon) => TrayHandle<Icon>;
  /** L'icône pour ce niveau d'alerte de mise à jour (`null` : l'icône normale). */
  readonly iconFor: (level: UpdateLevel | null) => Icon;
  readonly buildMenu: (template: readonly TrayMenuItem[]) => unknown;
  /** L'état de la mise à jour, `null` si le gestionnaire n'est pas encore prêt. */
  readonly updateInfo: () => TrayUpdateInfo | null;
  readonly translate: (key: string, variables?: Readonly<Record<string, string | number>>) => string;
  readonly shortcut: string;
  readonly actions: TrayActions;
  /** En développement : une entrée qui ouvre les outils de développement d'une fenêtre. */
  readonly debugWindows?: () => readonly TrayMenuItem[];
}

/** L'icône de la zone de notification : menu, icône et infobulle qui suivent la mise à jour. */
export class TrayService<Icon> {
  private tray: TrayHandle<Icon> | null = null;

  constructor(private readonly deps: TrayDeps<Icon>) {}

  /** Crée l'icône dans la zone de notification. */
  start(): void {
    const { deps } = this;
    const tray = deps.createTray(deps.iconFor(this.currentLevel()));

    tray.setToolTip(this.tooltip(deps.translate('tray.tooltip')));
    tray.setContextMenu(deps.buildMenu(this.menuTemplate(tray)));
    tray.on('click', () => deps.actions.toggleToolbar());

    this.tray = tray;
  }

  /** Met à jour l'icône et l'infobulle après un changement d'état de la mise à jour. */
  refresh(): void {
    const tray = this.liveTray();
    if (!tray) return;

    tray.setImage(this.deps.iconFor(this.currentLevel()));
    tray.setToolTip(this.tooltip(this.deps.translate('tray.tooltip')));
  }

  /** Remplace le texte de base de l'infobulle (ex. le morceau en cours). */
  showTooltip(text: string): void {
    this.liveTray()?.setToolTip(this.tooltip(text));
  }

  private liveTray(): TrayHandle<Icon> | null {
    return this.tray && !this.tray.isDestroyed() ? this.tray : null;
  }

  private currentLevel(): UpdateLevel | null {
    return this.deps.updateInfo()?.level ?? null;
  }

  private tooltip(text: string): string {
    return buildTrayTooltip({ text, update: this.deps.updateInfo(), translate: this.deps.translate });
  }

  private menuTemplate(tray: TrayHandle<Icon>): TrayMenuItem[] {
    const { translate, shortcut, actions, buildMenu, debugWindows } = this.deps;
    const template: TrayMenuItem[] = [
      { label: translate('tray.toggle'), accelerator: shortcut, registerAccelerator: false, click: () => actions.toggleToolbar() },
      { label: translate('tray.settings'), click: () => actions.openSettings() },
      { label: translate('tray.quit'), click: () => actions.quit() },
    ];

    if (debugWindows) {
      template.unshift({
        label: '[DEBUG]Ouvrir une console',
        click: () => tray.popUpContextMenu(buildMenu(debugWindows())),
      });
    }

    return template;
  }
}
