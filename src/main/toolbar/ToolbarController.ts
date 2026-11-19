import type { BrowserWindow } from 'electron';
import type { AppBar } from '../dock/AppBar.js';
import type { AppBarCallbacks } from '../dock/AppBar.js';
import { computeLayout, dockRequest, dockRequestKey, isPointInside, stepAutoHide } from '../dock/dockGeometry.js';
import type { Layout, Point, Rect } from '../dock/dockGeometry.js';
import type { AppWindows } from '../windows/AppWindows.js';
import { ADD_DIALOG_HEIGHT, ADD_DIALOG_WIDTH, APPBAR_WIDTH, EDGE_WIDTH, RAIL_WIDTH } from '../windows/windowSpecs.js';
import { resolveDisplayMode } from './displayMode.js';
import type { DisplayMode, DisplayModeSettings } from './displayMode.js';

/** Barre ancrée en masquage automatique : délai (ms) avant de se replier une fois la souris sortie. */
const AUTOHIDE_DELAY_MS = 700;
/** Période (ms) de la surveillance du curseur. */
const AUTOHIDE_POLL_MS = 150;
/** Délai (ms) pendant lequel la barre cesse d'être au-dessus des autres fenêtres, après un clic sur le bouton. */
const STOP_ON_TOP_DURATION_MS = 10_000;

const AUTOHIDE_WINDOWS = ['toolbar', 'apps', 'add_dialog'] as const;

/** L'écran choisi par l'utilisateur et ce qu'on peut en lire. */
export interface Displays {
  /** Limites complètes de l'écran choisi. */
  bounds(): Rect;
  /** Zone utilisable (hors barre des tâches) de l'écran choisi. */
  workArea(): Rect;
  /** Échelle d'affichage de l'écran qui contient (le plus) ce rectangle. */
  scaleFactorAt(rect: Rect): number;
  cursor(): Point;
}

export interface Timers {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export interface ToolbarMessages {
  /** Les fenêtres des applications se sont fermées. */
  appsClosed(): void;
  /** Le bouton principal doit se fermer (état du chevron). */
  buttonClosed(): void;
}

export interface ToolbarControllerDeps {
  readonly windows: AppWindows;
  readonly settings: DisplayModeSettings;
  readonly displays: Displays;
  readonly timers: Timers;
  readonly appBarSupported: () => boolean;
  readonly createAppBar: (callbacks: AppBarCallbacks) => AppBar<BrowserWindow>;
  readonly messages: ToolbarMessages;
  /** Cache les fenêtres flottantes (morceau, infobulle). */
  readonly hidePopups: () => void;
  /** La page de la barre est prête pour la première fois : charger les applications et les indicateurs. */
  readonly onToolbarPageReady: () => Promise<void>;
}

/**
 * La barre : ouverte ou repliée, ancrée au bord de l'écran ou flottante, avec ses modes bouton,
 * souris et masquage automatique. Elle place les fenêtres de l'interface sur l'écran choisi.
 */
export class ToolbarController {
  private opened = false;
  private pageReadyHandled = false;
  private pageReadyBound = false;
  private appBar: AppBar<BrowserWindow> | null = null;
  private appBarKey: string | null = null;
  private grantedArea: Rect | null = null;
  private autoHideTimer: unknown = null;
  private stopOnTopTimer: unknown = null;

  constructor(private readonly deps: ToolbarControllerDeps) {}

  /** La barre est dépliée. */
  get isOpen(): boolean {
    return this.opened;
  }

  get mode(): DisplayMode {
    return resolveDisplayMode(this.deps.settings, this.deps.appBarSupported());
  }

  /** Largeur actuelle de la barre ancrée : pleine largeur dépliée, rail fin repliée. */
  get dockedWidth(): number {
    return this.opened ? APPBAR_WIDTH : RAIL_WIDTH;
  }

  /** Disposition des fenêtres sur l'écran choisi. */
  get layout(): Layout {
    const { mode, deps } = this;

    return computeLayout({
      workArea: deps.displays.workArea(),
      bounds: deps.displays.bounds(),
      sizes: {
        toolbarWidth: APPBAR_WIDTH,
        addDialogWidth: ADD_DIALOG_WIDTH,
        addDialogHeight: ADD_DIALOG_HEIGHT,
        edgeWidth: EDGE_WIDTH,
      },
      docked: mode.appBar,
      dockedWidth: this.dockedWidth,
      grantedArea: this.grantedArea,
      buttonMode: mode.button,
    });
  }

  /** Met en place l'affichage choisi au démarrage. */
  start(): void {
    const { mode } = this;
    if (mode.usesEdge) this.startEdgeDetection();

    // Barre ancrée fixe : dépliée dès le démarrage
    if (mode.appBar) {
      if (!mode.autoHide) void this.toggle();
      else this.updateDock();
    }
  }

  /** Déplie ou replie la barre. */
  async toggle(): Promise<void> {
    const { deps } = this;
    const { windows } = deps;
    this.opened = !this.opened;

    if (this.opened) {
      deps.timers.clearTimeout(this.stopOnTopTimer);

      if (this.mode.button) windows.main.setAlwaysOnTop(true);
      else this.stopEdgeDetection();

      windows.toolbar.show();
      // En masquage automatique la barre flotte au-dessus des fenêtres, sans réserver d'espace
      if (this.mode.appBar && !this.mode.autoHide) this.attachAppBar();
      this.startAutoHideWatch();

      this.bindToolbarPage();
    } else {
      windows.apps.hide();
      // Ancrée, la barre reste affichée mais réduite à un rail fin
      if (!this.mode.appBar) windows.toolbar.hide();
      deps.hidePopups();
      deps.messages.appsClosed();

      this.stopAutoHideWatch();
      if (!this.mode.appBar) this.detachAppBar();

      if (this.mode.usesEdge) this.startEdgeDetection();
    }

    this.updateDock();
  }

  /**
   * Affiche ou cache la barre depuis le clavier ou la zone de notification.
   * En mode bouton, on passe par le bouton pour que son état reste cohérent.
   */
  toggleFromOutside(): void {
    const opening = !this.opened;

    if (this.mode.button) this.deps.messages.buttonClosed();
    else void this.toggle();

    // Au clavier, la barre doit recevoir le focus pour réagir à Échap
    if (opening) this.deps.windows.toolbar.focus();
  }

  /** La souris touche le bord gauche : seule la zone du bord (mode souris ou masquage automatique) ouvre la barre. */
  onEdgeEntered(): void {
    if ((this.mode.usesEdge || this.mode.autoHide) && !this.opened) void this.toggle();
  }

  /** Replie la barre en rail fin (ou la restaure) si elle est ancrée. */
  updateDock(): void {
    if (this.mode.appBar) this.updateRail();
  }

  /** Libère l'espace réservé par la barre ancrée. */
  detachAppBar(): void {
    this.appBar?.unregister();
    this.appBarKey = null;
    this.grantedArea = null;
  }

  stopAutoHideWatch(): void {
    this.deps.timers.clearInterval(this.autoHideTimer);
    this.autoHideTimer = null;
  }

  /** Replace les fenêtres existantes quand la configuration des écrans change. */
  repositionWindows(): void {
    const { deps } = this;
    const { windows } = deps;
    this.dockToolbar();
    const { layout } = this;

    this.moveWindow(windows.getBrowser('main'), layout.main);
    this.moveWindow(windows.getBrowser('toolbar'), layout.toolbar);
    this.moveWindow(windows.get('apps'), layout.apps);
    this.moveWindow(windows.getBrowser('edge'), layout.edge);

    // La fenêtre d'ajout est un dialogue : on la replace sans la redimensionner
    // si l'utilisateur a changé sa taille
    const addDialog = windows.getBrowser('add_dialog');
    if (addDialog) {
      const { width, height } = addDialog.getBounds();
      this.moveWindow(addDialog, {
        ...layout.addDialog,
        width: Math.min(width, layout.addDialog.width * 2),
        height: Math.min(height, deps.displays.workArea().height),
      });
    }

    deps.hidePopups();
  }

  /**
   * Le mode d'affichage a changé dans les paramètres : on libère l'espace réservé, on détruit
   * la barre et le bouton (ils sont recréés au prochain affichage) et on remet l'état à zéro.
   */
  rebuildForModeChange(): void {
    const { windows } = this.deps;

    this.stopAutoHideWatch();
    this.detachAppBar();
    windows.remove('toolbar');
    windows.remove('main');
    this.pageReadyBound = false;
    this.pageReadyHandled = false;
    this.opened = false;

    const { mode } = this;
    if (mode.button) {
      windows.main.show();
      this.stopEdgeDetection();
    } else {
      windows.getBrowser('main')?.hide();

      if (mode.appBar && !mode.autoHide) {
        this.stopEdgeDetection();
        void this.toggle();
      } else if (mode.usesEdge) this.startEdgeDetection();
      else this.stopEdgeDetection();
    }

    this.updateDock();
  }

  /** La barre cesse d'être au-dessus des autres fenêtres pendant quelques secondes. */
  suspendAlwaysOnTop(): void {
    if (this.opened) return;

    const { main } = this.deps.windows;
    main.setAlwaysOnTop(false);
    main.blur();

    this.stopOnTopTimer = this.deps.timers.setTimeout(() => main.setAlwaysOnTop(true), STOP_ON_TOP_DURATION_MS);
  }

  /** Bascule « toujours au-dessus » du bouton principal. */
  toggleAlwaysOnTop(): void {
    if (this.opened) return;

    this.deps.timers.clearTimeout(this.stopOnTopTimer);

    const { main } = this.deps.windows;
    main.setAlwaysOnTop(!main.isAlwaysOnTop());

    if (!main.isAlwaysOnTop()) main.blur();
  }

  /** Indique à la page de la barre si elle est réduite au rail. */
  syncToolbarClasses(): void {
    const rail = this.mode.appBar && !this.opened;

    this.deps.windows.toolbar.webContents
      .executeJavaScript(`document.documentElement.classList.toggle('rail', ${rail})`)
      .catch(() => {
        // La page peut être détruite entre-temps : l'état du rail est réappliqué au prochain chargement
      });
  }

  /**
   * Replie la barre en rail fin (ou la restaure) : le rail est la barre réduite à une bande,
   * qui garde sa place si elle n'est pas en masquage automatique.
   */
  private updateRail(): void {
    this.bindToolbarPage();

    const rail = !this.opened;

    // Réserve (ou met à jour) l'espace avant de replacer les fenêtres : le rail
    // ne doit jamais recouvrir les autres fenêtres
    if (rail) this.attachAppBar();
    this.repositionWindows();

    const { toolbar } = this.deps.windows;
    if (rail && !toolbar.isVisible()) toolbar.showInactive();

    this.syncToolbarClasses();
  }

  /** Charge les applications dans la barre dès que sa page est prête (une seule fois par fenêtre). */
  private bindToolbarPage(): void {
    if (this.pageReadyBound) return;
    this.pageReadyBound = true;

    this.deps.windows.toolbar.webContents.addListener('dom-ready', () => {
      this.syncToolbarClasses();

      if (this.pageReadyHandled) return;
      this.pageReadyHandled = true;

      this.deps.onToolbarPageReady().catch(console.error);
    });
  }

  /** En masquage automatique, replie la barre une fois la souris sortie de toute l'interface. */
  private startAutoHideWatch(): void {
    this.stopAutoHideWatch();
    if (!this.mode.autoHide) return;

    const { timers, windows, displays } = this.deps;
    let outsideSince: number | null = null;

    this.autoHideTimer = timers.setInterval(() => {
      const inside = isPointInside(displays.cursor(), windows.visibleBounds(AUTOHIDE_WINDOWS));
      const step = stepAutoHide(outsideSince, inside, timers.now(), AUTOHIDE_DELAY_MS);

      outsideSince = step.outsideSince;
      if (step.collapse && this.opened) void this.toggle();
    }, AUTOHIDE_POLL_MS);
  }

  /** Réserve (ou met à jour) la bande du bord gauche auprès du système. */
  private dockToolbar(force = false): void {
    if (!this.appBar?.registered) return;

    const wanted = dockRequest({
      bounds: this.deps.displays.bounds(),
      autoHide: this.mode.autoHide,
      dockedWidth: this.dockedWidth,
      railWidth: RAIL_WIDTH,
    });
    const key = dockRequestKey(wanted);

    // Évite de boucler : réserver l'espace modifie la zone de travail, ce qui redéclenche repositionWindows
    if (!force && key === this.appBarKey) return;
    this.appBarKey = key;

    this.grantedArea = this.appBar.setPos(wanted) ?? this.grantedArea;
  }

  /** Enregistre la barre comme AppBar et la place. */
  private attachAppBar(): void {
    this.appBar ??= this.deps.createAppBar({
      onFullscreen: (isFullscreen) => this.deps.windows.getBrowser('toolbar')?.setAlwaysOnTop(!isFullscreen),
      onPosChanged: () => {
        this.dockToolbar(true);
        this.repositionWindows();
      },
    });

    if (!this.appBar.register(this.deps.windows.toolbar)) return;

    this.dockToolbar(true);
    this.repositionWindows();
  }

  /** Affiche la zone sensible du bord gauche (mode souris). */
  private startEdgeDetection(): void {
    if (!this.mode.usesEdge) return;

    const { edge } = this.deps.windows;
    this.moveWindow(edge, this.layout.edge);
    edge.showInactive();
  }

  /** Cache la zone sensible du bord gauche. */
  private stopEdgeDetection(): void {
    this.deps.windows.getBrowser('edge')?.hide();
  }

  /**
   * Déplace et redimensionne une fenêtre, y compris vers un écran dont l'échelle d'affichage
   * est différente (sous Windows, Electron convertit alors la taille avec l'échelle de l'ancien
   * écran : on réapplique donc les dimensions une fois la fenêtre sur le nouvel écran).
   */
  private moveWindow(window: { isDestroyed(): boolean; getBounds(): Rect; setBounds(bounds: Rect): void } | undefined, bounds: Rect): void {
    if (!window || window.isDestroyed()) return;

    const { displays } = this.deps;
    const scaleChanges = displays.scaleFactorAt(bounds) !== displays.scaleFactorAt(window.getBounds());

    window.setBounds(bounds);
    if (scaleChanges) window.setBounds(bounds);
  }
}
